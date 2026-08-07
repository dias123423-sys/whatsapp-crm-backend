import { Controller, Post, Body, Headers, Logger, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Evolution API webhook — captures 100% of all incoming messages
  // RULE: Every message creates a Lead, regardless of content/type/language
  // ─────────────────────────────────────────────────────────────────────────
  @Post('evolution')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evolution API webhook — 100% lead capture' })
  async handleEvolution(@Body() payload: any) {
    try {
      const event = payload?.event || payload?.type || '';
      this.logger.log(`Webhook event: ${event} | instance: ${payload?.instance || '?'}`);

      if (
        event === 'messages.upsert' ||
        event === 'MESSAGES_UPSERT' ||
        event === 'message' ||
        event === 'messages.update'
      ) {
        await this.handleIncomingMessage(payload);
      }

      if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
        await this.handleConnectionUpdate(payload);
      }

      // Unknown event — still log it
      if (!event) {
        this.logger.warn(`Unknown webhook payload: ${JSON.stringify(payload).slice(0, 200)}`);
      }
    } catch (err) {
      this.logger.error('Webhook error:', err?.message);
    }

    return { received: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  private async handleIncomingMessage(payload: any) {
    try {
      const instanceName: string = payload?.instance || payload?.instanceName || 'unknown';
      const data = payload?.data || payload;
      const messages: any[] = Array.isArray(data?.messages)
        ? data.messages
        : data?.message
        ? [data.message]
        : [data];

      for (const msg of messages) {
        if (!msg) continue;

        // Skip outgoing messages
        const fromMe = msg?.key?.fromMe ?? msg?.fromMe ?? false;
        if (fromMe) continue;

        // Extract phone — support all JID formats
        // IMPORTANT: @lid is internal WhatsApp ID, real phone is in remoteJidAlt
        const jid: string =
          msg?.key?.remoteJidAlt ||  // Real phone number (priority)
          msg?.key?.remoteJid ||
          msg?.remoteJid ||
          msg?.from ||
          payload?.sender ||
          '';

        // Skip group messages
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue;

        // Extract clean phone number
        const phone = jid
          .replace('@s.whatsapp.net', '')
          .replace('@c.us', '')
          .replace('@lid', '')   // Remove lid suffix if remoteJidAlt not available
          .trim();
        if (!phone || phone.length < 5 || phone.includes('@')) continue;

        // Extract name
        const pushName: string =
          msg?.pushName || msg?.notifyName || msg?.key?.participant || null;

        // ── Detect message type & extract body ───────────────────────────
        const messageObj = msg?.message || {};
        const messageType = this.detectMessageType(messageObj);
        const body = this.extractBody(messageObj, messageType, msg);

        this.logger.log(
          `📱 Incoming | ${instanceName} | ${phone} | ${pushName || 'no-name'} | type:${messageType} | "${body.slice(0, 80)}"`,
        );

        // ── Upsert Client ────────────────────────────────────────────────
        const client = await this.prisma.client.upsert({
          where: { phone },
          update: {
            ...(pushName ? { name: pushName } : {}),
          },
          create: {
            phone,
            name: pushName || null,
            source: 'WHATSAPP',
          },
        });

        // ── Resolve WhatsApp account ────────────────────────────────────
        const whatsappAccount = await this.prisma.whatsAppAccount.findUnique({
          where: { instanceName },
        });

        // ── Save message always ──────────────────────────────────────────
        await this.prisma.message.create({
          data: {
            clientId: client.id,
            whatsappAccountId: whatsappAccount?.id ?? null,
            direction: 'IN',
            body: body || `[${messageType}]`,
            rawPayload: msg,
          },
        });

        // ─────────────────────────────────────────────────────────────────
        // CRITICAL BUSINESS RULE:
        // Create a Lead for EVERY message from a phone number.
        // Only one ACTIVE lead per phone at a time (status not CLOSED/BOOKED).
        // If active lead exists → reuse it, add history.
        // If no active lead → create new one always.
        // ─────────────────────────────────────────────────────────────────
        const activeLead = await this.prisma.lead.findFirst({
          where: {
            clientId: client.id,
            status: { notIn: ['CLOSED', 'BOOKED'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (activeLead) {
          // Existing active lead — add message to history
          await this.prisma.leadHistory.create({
            data: {
              leadId: activeLead.id,
              event: `Новое сообщение (${messageType})`,
              details: body ? body.slice(0, 500) : null,
            },
          });
          this.logger.log(`♻️  Active lead exists for ${phone} — history updated`);
        } else {
          // No active lead → create new one (100% capture)
          await this.leadsService.createFromWebhook({
            phone,
            name: pushName,
            message: body,
            messageType,
            source: 'WHATSAPP',
            whatsappInstanceName: instanceName,
          });
          this.logger.log(`✅ New lead created for ${phone} | procedure will be auto-detected`);
        }
      }
    } catch (err) {
      this.logger.error('handleIncomingMessage error:', err?.message, err?.stack);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  private detectMessageType(msg: any): string {
    if (!msg || Object.keys(msg).length === 0) return 'unknown';
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.audioMessage) return 'audio';
    if (msg.videoMessage) return 'video';
    if (msg.documentMessage || msg.documentWithCaptionMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';
    if (msg.reactionMessage) return 'reaction';
    if (msg.pollCreationMessage) return 'poll';
    if (msg.buttonsResponseMessage || msg.listResponseMessage) return 'button_response';
    if (msg.templateButtonReplyMessage) return 'template_reply';
    if (msg.ephemeralMessage) return 'ephemeral';
    if (msg.viewOnceMessage || msg.viewOnceMessageV2) return 'view_once';
    if (msg.liveLocationMessage) return 'live_location';
    if (msg.orderMessage) return 'order';
    if (msg.productMessage) return 'product';
    if (msg.protocolMessage) return 'protocol';
    const keys = Object.keys(msg);
    return keys[0]?.replace('Message', '') || 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  private extractBody(msg: any, type: string, rawMsg: any): string {
    if (!msg) return '';

    // Text
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

    // Image caption
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;

    // Video caption
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;

    // Document name
    if (msg.documentMessage?.title) return `[Документ: ${msg.documentMessage.title}]`;
    if (msg.documentWithCaptionMessage?.message?.documentMessage?.title) {
      return `[Документ: ${msg.documentWithCaptionMessage.message.documentMessage.title}]`;
    }

    // Audio
    if (msg.audioMessage) return '[Голосовое сообщение]';

    // Sticker
    if (msg.stickerMessage) return '[Стикер]';

    // Location
    if (msg.locationMessage) {
      const lat = msg.locationMessage.degreesLatitude || '';
      const lng = msg.locationMessage.degreesLongitude || '';
      return `[Локация: ${lat}, ${lng}]`;
    }

    // Contact
    if (msg.contactMessage?.displayName) {
      return `[Контакт: ${msg.contactMessage.displayName}]`;
    }

    // Reaction (emoji)
    if (msg.reactionMessage?.text) return msg.reactionMessage.text;

    // Button response
    if (msg.buttonsResponseMessage?.selectedDisplayText) {
      return msg.buttonsResponseMessage.selectedDisplayText;
    }
    if (msg.listResponseMessage?.title) {
      return msg.listResponseMessage.title;
    }

    // Fallback to raw body
    const rawBody = rawMsg?.body || rawMsg?.text || '';
    if (rawBody) return rawBody;

    return `[${type}]`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  private async handleConnectionUpdate(payload: any) {
    try {
      const instanceName: string = payload?.instance || payload?.instanceName || '';
      const state: string = payload?.data?.state || payload?.state || '';

      if (!instanceName) return;

      const status =
        state === 'open' ? 'ONLINE' : state === 'connecting' ? 'CONNECTING' : 'OFFLINE';

      await this.prisma.whatsAppAccount.updateMany({
        where: { instanceName },
        data: { status },
      });

      this.logger.log(`🔗 WhatsApp ${instanceName} → ${status}`);
    } catch (err) {
      this.logger.error('handleConnectionUpdate error:', err?.message);
    }
  }
}
