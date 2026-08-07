import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  // Our own WhatsApp numbers — never create leads from these
  private readonly OWN_NUMBERS = new Set([
    '77085995047', // WA1
    '77083274500', // WA2
    '77058716017', // WA3
    '77085991789', // WA4
  ]);

  private evoBaseUrl: string;
  private evoApiKey: string;

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.evoBaseUrl = this.config.get('EVOLUTION_API_URL', 'http://localhost:8080');
    this.evoApiKey  = this.config.get('EVOLUTION_API_KEY', '');
  }

  // ─────────────────────────────────────────────────────────────────────────
  @Post('evolution')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evolution API webhook — 100% lead capture + instant parsing' })
  async handleEvolution(@Body() payload: any) {
    const event = payload?.event || payload?.type || '';

    try {
      if (
        event === 'messages.upsert' ||
        event === 'MESSAGES_UPSERT' ||
        event === 'message'
      ) {
        await this.handleIncomingMessage(payload);
      }

      if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
        await this.handleConnectionUpdate(payload);
      }
    } catch (err) {
      this.logger.error('Webhook error:', err?.message);
    }

    return { received: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  private async handleIncomingMessage(payload: any) {
    const instanceName: string = payload?.instance || payload?.instanceName || 'unknown';
    const data = payload?.data || payload;
    const messages: any[] = Array.isArray(data?.messages)
      ? data.messages
      : data?.message ? [data.message] : [data];

    for (const msg of messages) {
      if (!msg) continue;

      // Skip outgoing
      if (msg?.key?.fromMe === true || msg?.fromMe === true) continue;

      // Skip protocol/system messages
      const msgObj = msg?.message || {};
      const msgType = this.detectMessageType(msgObj);
      if (['protocol', 'ephemeral'].includes(msgType)) continue;

      // Extract real phone — remoteJidAlt has real number, remoteJid may have @lid
      const jid: string =
        msg?.key?.remoteJidAlt ||
        msg?.key?.remoteJid ||
        msg?.remoteJid || '';

      if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue;

      const phone = jid
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace('@lid', '')
        .trim();

      if (!phone || phone.length < 5 || phone.includes('@')) continue;

      // Skip our own numbers
      if (this.OWN_NUMBERS.has(phone)) {
        this.logger.debug(`Skip own number: ${phone}`);
        continue;
      }

      const pushName: string = msg?.pushName || msg?.notifyName || null;

      // Extract text from this message
      const body = this.extractBody(msgObj, msgType, msg);

      this.logger.log(
        `📱 ${instanceName} | ${phone} | ${pushName || 'no-name'} | ${msgType} | "${body.slice(0, 60)}"`,
      );

      // ── INSTANT PARSING: read full chat from Evolution to find procedure ──
      // We look at ALL messages in the chat (client + our replies)
      // because the procedure is often mentioned in our outgoing message
      let bestText = body;
      try {
        const chatText = await this.fetchFullChatText(instanceName, phone);
        if (chatText) {
          bestText = chatText;
          this.logger.log(`  Chat context loaded (${chatText.length} chars) for ${phone}`);
        }
      } catch (e) {
        this.logger.warn(`  Could not fetch chat for ${phone}: ${e?.message}`);
      }

      // ── Upsert client ────────────────────────────────────────────────────
      const client = await this.prisma.client.upsert({
        where: { phone },
        update: { ...(pushName ? { name: pushName } : {}) },
        create: { phone, name: pushName || null, source: 'WHATSAPP' },
      });

      // ── Save message ──────────────────────────────────────────────────────
      const whatsappAccount = await this.prisma.whatsAppAccount.findUnique({
        where: { instanceName },
      });

      await this.prisma.message.create({
        data: {
          clientId: client.id,
          whatsappAccountId: whatsappAccount?.id ?? null,
          direction: 'IN',
          body: body || `[${msgType}]`,
          rawPayload: msg,
        },
      });

      // ── Check if active lead exists ───────────────────────────────────────
      const activeLead = await this.prisma.lead.findFirst({
        where: {
          clientId: client.id,
          status: { notIn: ['CLOSED', 'BOOKED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeLead) {
        // Active lead exists — try to update procedure if not set yet
        if (!activeLead.procedureId) {
          const procedure = await this.leadsService.detectProcedure(bestText);
          if (procedure) {
            await this.prisma.lead.update({
              where: { id: activeLead.id },
              data: {
                procedureId: procedure.id,
                price: procedure.price,
              },
            });
            this.logger.log(
              `  🎯 Procedure found for existing lead: ${procedure.name} | ${phone}`,
            );
          }
        }

        // Add to history
        await this.prisma.leadHistory.create({
          data: {
            leadId: activeLead.id,
            event: `Новое сообщение (${msgType})`,
            details: body ? body.slice(0, 500) : null,
          },
        });

        this.logger.log(`♻️  Active lead updated for ${phone}`);
      } else {
        // No active lead — create new one with instant procedure detection
        await this.leadsService.createFromWebhook({
          phone,
          name: pushName,
          message: bestText,      // full chat text for better parsing
          messageType: msgType,
          source: 'WHATSAPP',
          whatsappInstanceName: instanceName,
        });
        this.logger.log(`✅ New lead created for ${phone}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read ALL messages from instance, filter by phone, collect text for parsing
  private async fetchFullChatText(instanceName: string, phone: string): Promise<string> {
    try {
      const res = await axios.post(
        `${this.evoBaseUrl}/chat/findMessages/${instanceName}`,
        { count: 200, offset: 0 },
        { headers: { apikey: this.evoApiKey }, timeout: 8000 },
      );

      const msgs = res.data?.messages?.records || [];
      const texts: string[] = [];

      for (const m of msgs) {
        const key = m?.key || {};
        // Check both remoteJid and remoteJidAlt for match
        const jid1 = (key.remoteJidAlt || '').replace('@s.whatsapp.net','').replace('@c.us','').replace('@lid','');
        const jid2 = (key.remoteJid || '').replace('@s.whatsapp.net','').replace('@c.us','').replace('@lid','');

        if (jid1 !== phone && jid2 !== phone) continue;

        const msgObj = m?.message || {};
        const ext = msgObj?.extendedTextMessage || {};
        const text = msgObj?.conversation || ext?.text || '';

        if (text && text.length > 2) {
          texts.push(text);
        }
      }

      return texts.join(' | ');
    } catch {
      return '';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  private detectMessageType(msg: any): string {
    if (!msg || Object.keys(msg).length === 0) return 'unknown';
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage)    return 'image';
    if (msg.audioMessage)    return 'audio';
    if (msg.videoMessage)    return 'video';
    if (msg.documentMessage || msg.documentWithCaptionMessage) return 'document';
    if (msg.stickerMessage)  return 'sticker';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';
    if (msg.reactionMessage) return 'reaction';
    if (msg.protocolMessage) return 'protocol';
    if (msg.ephemeralMessage) return 'ephemeral';
    if (msg.buttonsResponseMessage || msg.listResponseMessage) return 'button_response';
    const keys = Object.keys(msg);
    return keys[0]?.replace('Message', '') || 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  private extractBody(msg: any, type: string, rawMsg: any): string {
    if (!msg) return '';
    if (msg.conversation)                        return msg.conversation;
    if (msg.extendedTextMessage?.text)           return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption)               return msg.imageMessage.caption;
    if (msg.videoMessage?.caption)               return msg.videoMessage.caption;
    if (msg.documentMessage?.title)              return `[Документ: ${msg.documentMessage.title}]`;
    if (msg.audioMessage)                        return '[Голосовое сообщение]';
    if (msg.stickerMessage)                      return '[Стикер]';
    if (msg.locationMessage?.degreesLatitude)    return `[Локация: ${msg.locationMessage.degreesLatitude}, ${msg.locationMessage.degreesLongitude}]`;
    if (msg.contactMessage?.displayName)         return `[Контакт: ${msg.contactMessage.displayName}]`;
    if (msg.reactionMessage?.text)               return msg.reactionMessage.text;
    if (msg.buttonsResponseMessage?.selectedDisplayText) return msg.buttonsResponseMessage.selectedDisplayText;
    if (msg.listResponseMessage?.title)          return msg.listResponseMessage.title;
    return rawMsg?.body || rawMsg?.text || `[${type}]`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  private async handleConnectionUpdate(payload: any) {
    try {
      const instanceName = payload?.instance || payload?.instanceName || '';
      const state = payload?.data?.state || payload?.state || '';
      if (!instanceName) return;

      const status =
        state === 'open' ? 'ONLINE' :
        state === 'connecting' ? 'CONNECTING' : 'OFFLINE';

      await this.prisma.whatsAppAccount.updateMany({
        where: { instanceName },
        data: { status },
      });

      this.logger.log(`🔗 ${instanceName} → ${status}`);
    } catch (err) {
      this.logger.error('ConnectionUpdate error:', err?.message);
    }
  }
}
