import { Controller, Post, Body, Logger, HttpCode, OnModuleInit } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController implements OnModuleInit {
  private readonly logger = new Logger(WebhookController.name);

  // Our own WhatsApp numbers — never create leads from these
  private OWN: Set<string> = new Set([
    '77085995047', '77083274500', '77058716017', '77085991789',
  ]);

  private evoKey: string;
  private evoUrl: string;

  constructor(
    private leadsService: LeadsService,
    private prisma: PrismaService,
    private config: ConfigService,
    private notifications: NotificationsGateway,
  ) {
    this.evoKey = this.config.get('EVOLUTION_API_KEY', '');
    this.evoUrl = this.config.get('EVOLUTION_API_URL', 'http://localhost:8080');
  }

  async onModuleInit() {
    // Load own WA numbers from DB
    try {
      const accounts = await this.prisma.whatsAppAccount.findMany({
        where: { phone: { not: null } },
        select: { phone: true },
      });
      accounts.forEach(a => {
        if (a.phone) this.OWN.add(a.phone.replace('+', '').replace(/\s/g, ''));
      });
      this.logger.log(`Own WA numbers: ${[...this.OWN].join(', ')}`);
    } catch {
      this.logger.warn('Using fallback own numbers');
    }
  }

  // ── Main webhook endpoint ──────────────────────────────────────────────────
  @Post('evolution')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evolution API webhook — 100% lead capture' })
  async handleEvolution(@Body() payload: any) {
    const event = payload?.event || payload?.type || '';
    try {
      if (['messages.upsert', 'MESSAGES_UPSERT', 'message'].includes(event)) {
        await this.handleMessage(payload);
      }
      if (['connection.update', 'CONNECTION_UPDATE'].includes(event)) {
        await this.handleConnection(payload);
      }
    } catch (err) {
      this.logger.error('Webhook error: ' + err?.message);
    }
    return { received: true };
  }

  // ── Handle incoming message ────────────────────────────────────────────────
  private async handleMessage(payload: any) {
    const instance: string = payload?.instance || payload?.instanceName || 'unknown';
    const data = payload?.data || payload;
    const msgs: any[] = Array.isArray(data?.messages) ? data.messages
      : data?.message ? [data.message] : [data];

    for (const msg of msgs) {
      if (!msg) continue;

      // Skip outgoing
      if (msg?.key?.fromMe === true) continue;

      // Skip protocol/system
      const msgObj = msg?.message || {};
      const msgType = this.getType(msgObj);
      if (['protocol', 'ephemeral', 'protocolMessage'].includes(msgType)) continue;

      // ── Get real phone number ────────────────────────────────────────────
      const phone = this.getPhone(msg?.key);
      if (!phone) continue;
      if (this.OWN.has(phone)) {
        this.logger.debug('Skip own: ' + phone);
        continue;
      }

      const name: string = msg?.pushName || msg?.notifyName || null;
      const body = this.getBody(msgObj, msgType, msg);

      this.logger.log(`📱 ${instance} | ${phone} | ${name || '?'} | "${body.slice(0, 60)}"`);

      // ── Upsert client ──────────────────────────────────────────────────
      const client = await this.prisma.client.upsert({
        where: { phone },
        update: { ...(name ? { name } : {}) },
        create: { phone, name: name || null, source: 'WHATSAPP' },
      });

      // ── Save message ───────────────────────────────────────────────────
      const wa = await this.prisma.whatsAppAccount.findUnique({ where: { instanceName: instance } });
      await this.prisma.message.create({
        data: {
          clientId: client.id,
          whatsappAccountId: wa?.id ?? null,
          direction: 'IN',
          body: body || `[${msgType}]`,
          rawPayload: msg,
        },
      });

      // ── Create or update lead ──────────────────────────────────────────
      const activeLead = await this.prisma.lead.findFirst({
        where: { clientId: client.id, status: { notIn: ['CLOSED', 'BOOKED'] } },
        orderBy: { createdAt: 'desc' },
      });

      if (activeLead) {
        // Try to detect procedure if not set
        if (!activeLead.procedureId && body) {
          const proc = await this.leadsService.detectProcedure(body);
          if (proc) {
            await this.prisma.lead.update({
              where: { id: activeLead.id },
              data: { procedureId: proc.id, price: proc.price },
            });
            this.logger.log(`🎯 ${proc.name} → ${phone}`);
          }
        }
        await this.prisma.leadHistory.create({
          data: {
            leadId: activeLead.id,
            event: `Сообщение (${msgType})`,
            details: body?.slice(0, 500) || null,
          },
        });
        this.logger.log(`♻️  Updated: ${phone}`);
      } else {
        const lead = await this.leadsService.createFromWebhook({
          phone, name, message: body || `[${msgType}]`,
          messageType: msgType, source: 'WHATSAPP', whatsappInstanceName: instance,
        });
        this.logger.log(`✅ Created: ${phone}`);
        // ── WebSocket: notify admin instantly ──────────────────────────
        try { this.notifications.notifyNewLead(lead); } catch {}
      }
    }
  }

  // ── Get clean phone number from key ────────────────────────────────────────
  // Evolution v1.8.x: @s.whatsapp.net  |  Evolution v2.x: may use @lid
  private getPhone(key: any): string | null {
    if (!key) return null;

    const candidates = [
      key.remoteJidAlt,
      key.remoteJid,
      key.participant,
    ].filter(Boolean) as string[];

    for (const jid of candidates) {
      if (!jid) continue;
      if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) continue;

      // @s.whatsapp.net or @c.us — real phone number
      if (jid.includes('@s.whatsapp.net') || jid.includes('@c.us')) {
        const p = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').trim();
        if (p.length >= 7 && /^\d+$/.test(p)) return p;
      }

      // @lid — Evolution v2.x internal LID
      // LIDs that look like phone numbers (KZ: 77xxxxxxxxx — 11 digits)
      if (jid.includes('@lid')) {
        const lid = jid.replace('@lid', '').trim();
        // KZ: exactly 11 digits starting with 77
        if (/^77\d{9}$/.test(lid)) return lid;
        // RU/KZ: 11 digits starting with 7
        if (/^7\d{10}$/.test(lid)) return lid;
        // 10 digit number (without country code) — prefix with 7
        if (/^\d{10}$/.test(lid) && lid.startsWith('7')) return `7${lid.slice(1)}`;
        // Any 10+ digit number — store as-is for 100% capture
        if (/^\d{10,15}$/.test(lid)) return lid;
        // Non-numeric LID — skip (it's a real internal ID, not a phone)
        continue;
      }

      // Plain number without suffix
      const plain = jid.trim();
      if (/^\d{10,15}$/.test(plain)) return plain;
    }

    return null;
  }

  // ── Get message type ────────────────────────────────────────────────────────
  private getType(msg: any): string {
    if (!msg || Object.keys(msg).length === 0) return 'unknown';
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage)    return 'image';
    if (msg.audioMessage)    return 'audio';
    if (msg.videoMessage)    return 'video';
    if (msg.documentMessage || msg.documentWithCaptionMessage) return 'document';
    if (msg.stickerMessage)  return 'sticker';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage)  return 'contact';
    if (msg.reactionMessage) return 'reaction';
    if (msg.protocolMessage) return 'protocol';
    if (msg.ephemeralMessage) return 'ephemeral';
    const k = Object.keys(msg);
    return k[0]?.replace('Message', '') || 'unknown';
  }

  // ── Extract message text ────────────────────────────────────────────────────
  private getBody(msg: any, type: string, raw: any): string {
    if (!msg) return '';
    if (msg.conversation)                      return msg.conversation;
    if (msg.extendedTextMessage?.text)         return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption)             return msg.imageMessage.caption;
    if (msg.videoMessage?.caption)             return msg.videoMessage.caption;
    if (msg.documentMessage?.title)            return `[Документ: ${msg.documentMessage.title}]`;
    if (msg.audioMessage)                      return '[Голосовое сообщение]';
    if (msg.stickerMessage)                    return '[Стикер]';
    if (msg.locationMessage?.degreesLatitude)  return `[Локация]`;
    if (msg.contactMessage?.displayName)       return `[Контакт: ${msg.contactMessage.displayName}]`;
    if (msg.reactionMessage?.text)             return msg.reactionMessage.text;
    return raw?.body || raw?.text || `[${type}]`;
  }

  // ── Connection update ────────────────────────────────────────────────────────
  private async handleConnection(payload: any) {
    try {
      const instanceName = payload?.instance || payload?.instanceName || '';
      const state = payload?.data?.state || payload?.state || '';
      if (!instanceName) return;
      const status = state === 'open' ? 'ONLINE' : state === 'connecting' ? 'CONNECTING' : 'OFFLINE';
      
      // Extract phone number when connected (state=open)
      let phone: string | null = null;
      if (state === 'open') {
        const ownerJid = payload?.data?.instance?.ownerJid || '';
        if (ownerJid) {
          phone = ownerJid.split('@')[0]?.replace(/\D/g, '') || null;
        }
      }
      
      await this.prisma.whatsAppAccount.updateMany({
        where: { instanceName },
        data: {
          status,
          ...(phone ? { phone } : {}),
        },
      });
      this.logger.log(`🔗 ${instanceName} → ${status}${phone ? ` | +${phone}` : ''}`);
    } catch (err) {
      this.logger.error('Connection update error: ' + err?.message);
    }
  }
}
