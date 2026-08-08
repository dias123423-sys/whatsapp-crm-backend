import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { WebSocketGateway as WsGateway } from '../websocket/websocket.gateway';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppParserService } from './whatsapp-parser.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Real Evolution API v2 webhook payload structure:
 *
 * {
 *   event: "messages.upsert",
 *   instance: "whatsapp-1-tanat",
 *   data: {
 *     key: {
 *       remoteJid: "77771234567@s.whatsapp.net",  // or @lid for Android
 *       fromMe: false,
 *       id: "ABCDEF123456",
 *       participant: undefined                    // only for groups
 *     },
 *     pushName: "Клиент Имя",
 *     message: {
 *       conversation: "ХОЧУ ЗАПИСАТЬСЯ НА МАССАЖ ЛИЦА ВСЕГО ЗА 3990 ТГ"
 *       // or extendedTextMessage: { text: "..." }
 *       // or imageMessage: { caption: "..." }
 *     },
 *     messageType: "conversation",
 *     messageTimestamp: 1757201641,
 *     instanceId: "uuid",
 *     source: "android" | "iphone" | "web" | "unknown"
 *   }
 * }
 *
 * connection.update:
 * {
 *   event: "connection.update",
 *   instance: "whatsapp-1-tanat",
 *   data: {
 *     state: "open" | "close" | "connecting",
 *     statusReason: 200
 *   }
 * }
 *
 * qrcode.updated:
 * {
 *   event: "qrcode.updated",
 *   instance: "whatsapp-1-tanat",
 *   data: {
 *     qrcode: { base64: "data:image/png;base64,..." }
 *   }
 * }
 */

@ApiTags('Webhooks')
@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private parserService: WhatsAppParserService,
    private whatsappService: WhatsAppService,
    private websocketGateway: WsGateway,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /whatsapp/webhook
   * Single endpoint for ALL Evolution API events.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evolution API webhook — receives all events' })
  async handleWebhook(
    @Body() payload: any,
    @Headers('apikey') apiKey: string,
  ) {
    // Optional API key validation
    const expectedKey = process.env.EVOLUTION_API_KEY;
    if (expectedKey && apiKey && apiKey !== expectedKey) {
      this.logger.warn(`Webhook received with invalid apikey`);
      // Still return 200 so Evolution doesn't retry forever
      return { status: 'ignored', reason: 'invalid_api_key' };
    }

    const eventType: string = (
      payload?.event ||
      payload?.type ||
      ''
    ).toLowerCase().replace(/_/g, '.');

    const instanceName: string = payload?.instance || payload?.data?.instance || '';

    this.logger.log(`📨 Webhook event="${eventType}" instance="${instanceName}"`);

    try {
      switch (eventType) {
        case 'messages.upsert':
          return await this.handleIncomingMessage(payload, instanceName);

        case 'connection.update':
          return await this.handleConnectionUpdate(payload, instanceName);

        case 'qrcode.updated':
          return await this.handleQRCodeUpdate(payload, instanceName);

        default:
          this.logger.debug(`Unhandled event: ${eventType}`);
          return { status: 'ignored', event: eventType };
      }
    } catch (error) {
      // Always 200 — Evolution API must not retry
      this.logger.error(`❌ Error processing webhook event="${eventType}"`, error?.message);
      return { status: 'error', message: error?.message };
    }
  }

  // ════════════════════════════════════════════════
  // INCOMING MESSAGE
  // ════════════════════════════════════════════════

  private async handleIncomingMessage(payload: any, instanceName: string) {
    const data = payload?.data ?? {};
    const key = data?.key ?? {};

    // Skip messages sent by us
    if (key?.fromMe === true) {
      this.logger.debug('Skip: fromMe=true');
      return { status: 'ignored', reason: 'fromMe' };
    }

    // ── Extract phone ──────────────────────────────
    const remoteJid: string = key?.remoteJid ?? '';

    // Skip group messages
    if (remoteJid.includes('@g.us')) {
      this.logger.debug('Skip: group message');
      return { status: 'ignored', reason: 'group_message' };
    }

    // Handle @lid (Android LID — use participant or try to resolve)
    // For @lid we still process — normalizePhone strips everything except digits
    const rawPhone = remoteJid.split('@')[0];
    if (!rawPhone) {
      this.logger.warn(`No phone in remoteJid: ${remoteJid}`);
      return { status: 'ignored', reason: 'no_phone' };
    }

    const phone = this.normalizePhone(rawPhone);
    if (!phone || phone.length < 7) {
      this.logger.warn(`Could not normalize phone from: ${rawPhone}`);
      return { status: 'ignored', reason: 'invalid_phone' };
    }

    // ── Extract message text ──────────────────────
    const msgContent = data?.message ?? {};
    const messageText: string = (
      msgContent?.conversation ||
      msgContent?.extendedTextMessage?.text ||
      msgContent?.imageMessage?.caption ||
      msgContent?.videoMessage?.caption ||
      msgContent?.documentMessage?.caption ||
      ''
    ).trim();

    // ── Other fields ──────────────────────────────
    const senderName: string = data?.pushName || '';
    const messageId: string = key?.id || `${rawPhone}-${data?.messageTimestamp || Date.now()}`;
    const source: string = data?.source || 'unknown'; // android | iphone | web

    // ── Idempotency: skip exact duplicate messageId ──
    const existing = await this.prisma.message.findUnique({ where: { messageId } });
    if (existing) {
      this.logger.warn(`🔁 Duplicate message: ${messageId}`);
      return { status: 'ignored', reason: 'duplicate' };
    }

    // ── Find WhatsApp account by instance ─────────
    const whatsappAccount = await this.whatsappService.getAccountByInstanceName(instanceName);
    if (!whatsappAccount) {
      this.logger.warn(`WhatsApp account not found for instance="${instanceName}" — creating lead anyway`);
    }

    this.logger.log(
      `📞 Message from ${phone} via ${instanceName}: "${messageText.slice(0, 80)}"`,
    );

    // ── Parse + Create Lead ────────────────────────
    const lead = await this.parserService.createLeadFromWebhook({
      phone,
      senderName,
      messageText,
      messageId,
      instanceName,
      whatsappAccountId: whatsappAccount?.id ?? null,
      whatsappOwnerId: whatsappAccount?.ownerId ?? null,
    });

    if (lead) {
      this.websocketGateway.emitLeadCreated(lead);
      this.logger.log(`✅ Lead ${lead.id} created | phone=${phone} | owner=${(lead as any).whatsappOwner?.name ?? '—'}`);
    }

    return {
      status: 'success',
      leadId: lead?.id ?? null,
      phone,
      instance: instanceName,
    };
  }

  // ════════════════════════════════════════════════
  // CONNECTION UPDATE
  // ════════════════════════════════════════════════

  private async handleConnectionUpdate(payload: any, instanceName: string) {
    const data = payload?.data ?? {};
    const state: string = data?.state || 'close';

    if (!instanceName) return { status: 'ignored', reason: 'no_instance' };

    this.logger.log(`🔌 Connection: instance=${instanceName} state=${state}`);

    await this.whatsappService.updateAccountStatus(instanceName, state);

    const account = await this.whatsappService.getAccountByInstanceName(instanceName);
    if (account) {
      if (state === 'open') {
        this.websocketGateway.emitWhatsAppConnected(account);
      } else if (state === 'close' || state === 'closed') {
        this.websocketGateway.emitWhatsAppDisconnected(account);
      }
    }

    return { status: 'success', instance: instanceName, state };
  }

  // ════════════════════════════════════════════════
  // QR CODE UPDATED
  // ════════════════════════════════════════════════

  private async handleQRCodeUpdate(payload: any, instanceName: string) {
    const data = payload?.data ?? {};
    // Evolution API v2 nests QR: data.qrcode.base64
    const qrCode: string =
      data?.qrcode?.base64 ||
      data?.qrcode?.code ||
      data?.qrcode ||
      data?.base64 ||
      data?.code ||
      '';

    if (!instanceName || !qrCode) {
      return { status: 'ignored', reason: 'no_instance_or_qr' };
    }

    this.logger.log(`📱 QR updated for ${instanceName}`);

    await this.whatsappService.updateQRCode(instanceName, qrCode);
    this.websocketGateway.emitQRUpdated(instanceName, qrCode);

    return { status: 'success', instance: instanceName };
  }

  // ════════════════════════════════════════════════
  // PHONE NORMALIZER
  // ════════════════════════════════════════════════

  /**
   * Normalizes any phone format to +7XXXXXXXXXX (Kazakhstan)
   *
   * Handles:
   *   77771234567          → +77771234567
   *   87771234567          → +77771234567  (8 → 7)
   *   7771234567 (10 dig)  → +77771234567
   *   +77771234567         → +77771234567
   *   154417159582282 (@lid Android) → +154417159582282 (pass-through)
   */
  private normalizePhone(raw: string): string {
    if (!raw) return '';

    let digits = raw.replace(/\D/g, '');
    if (!digits) return '';

    // Kazakhstan: 8xxxxxxxxxx → 7xxxxxxxxxx
    if (digits.length === 11 && digits.startsWith('8')) {
      digits = '7' + digits.slice(1);
    }

    // Kazakhstan local without country code: 7xxxxxxxxx (10 digits)
    if (digits.length === 10 && !digits.startsWith('7')) {
      digits = '7' + digits;
    }

    return '+' + digits;
  }
}
