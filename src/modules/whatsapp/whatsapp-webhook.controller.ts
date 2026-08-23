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

    // TEMPORARY DEBUG: Log safe payload structure for messages.upsert
    if (eventType === 'messages.upsert') {
      const data = payload?.data ?? {};
      const key = data?.key ?? {};
      const msgContent = data?.message ?? {};
      
      this.logger.debug(`[PAYLOAD-STRUCTURE] remoteJid="${key?.remoteJid ?? 'MISSING'}" fromMe=${key?.fromMe} messageId="${key?.id ?? 'MISSING'}"`);
      this.logger.debug(`[PAYLOAD-STRUCTURE] pushName="${data?.pushName ?? 'MISSING'}" messageType="${data?.messageType ?? 'MISSING'}"`);
      this.logger.debug(`[PAYLOAD-STRUCTURE] message keys: ${Object.keys(msgContent).join(', ') || 'NONE'}`);
      
      const textSources = {
        conversation: msgContent?.conversation,
        extendedText: msgContent?.extendedTextMessage?.text,
        imageCaption: msgContent?.imageMessage?.caption,
      };
      this.logger.debug(`[PAYLOAD-STRUCTURE] text sources: conversation=${!!textSources.conversation} extendedText=${!!textSources.extendedText} imageCaption=${!!textSources.imageCaption}`);
    }

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

    this.logger.debug(`[WEBHOOK-DEBUG] payload.data exists: ${!!data}, key exists: ${!!key}`);

    // ── Extract phone ──────────────────────────────
    const remoteJid: string = key?.remoteJid ?? '';

    this.logger.debug(`[WEBHOOK-DEBUG] remoteJid="${remoteJid}"`);

    // Skip group messages
    if (remoteJid.includes('@g.us')) {
      this.logger.debug('[EARLY RETURN] group_message: @g.us detected');
      return { status: 'ignored', reason: 'group_message' };
    }

    const rawPhone = remoteJid.split('@')[0];
    if (!rawPhone) {
      this.logger.warn(`[EARLY RETURN] no_phone: remoteJid="${remoteJid}"`);
      return { status: 'ignored', reason: 'no_phone' };
    }

    const phone = this.normalizePhone(rawPhone);
    this.logger.debug(`[WEBHOOK-DEBUG] rawPhone="${rawPhone}" normalized="${phone}"`);
    
    if (!phone || phone.length < 7) {
      this.logger.warn(`[EARLY RETURN] invalid_phone: rawPhone="${rawPhone}" normalized="${phone}"`);
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

    const messageId: string = key?.id || `${rawPhone}-${data?.messageTimestamp || Date.now()}`;

    this.logger.debug(`[WEBHOOK-DEBUG] messageId="${messageId}" messageText="${messageText.slice(0,50)}"`);

    // ── Find WhatsApp account by instance ─────────
    const whatsappAccount = await this.whatsappService.getAccountByInstanceName(instanceName);
    if (!whatsappAccount) {
      this.logger.warn(`WhatsApp account not found for instance="${instanceName}" — creating lead anyway`);
    }

    // ── Handle OUTGOING messages (fromMe = true) ──
    if (key?.fromMe === true) {
      this.logger.debug(`[OUTGOING] fromMe=true, processing operator's message`);
      return await this.handleOutgoingMessage({
        phone,
        messageText,
        messageId,
        instanceName,
        whatsappAccountId: whatsappAccount?.id ?? null,
      });
    }

    this.logger.debug(`[WEBHOOK-DEBUG] fromMe=${key?.fromMe}, continuing...`);

    // ── Other fields ──────────────────────────────
    const senderName: string = data?.pushName || '';
    const source: string = data?.source || 'unknown';

    // ── Idempotency: skip exact duplicate messageId ──
    const existing = await this.prisma.message.findUnique({ where: { messageId } });
    if (existing) {
      this.logger.warn(`🔁 Duplicate message: ${messageId}`);
      return { status: 'ignored', reason: 'duplicate' };
    }

    this.logger.debug(`[WEBHOOK-DEBUG] Not duplicate, proceeding...`);

    this.logger.log(
      `📞 Message from ${phone} via ${instanceName}: "${messageText.slice(0, 80)}"`,
    );

    this.logger.debug(`[WEBHOOK-DEBUG] Calling createLeadFromWebhook...`);

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

    this.logger.debug(`[WEBHOOK-DEBUG] createLeadFromWebhook returned: leadId=${(lead as any)?.id ?? 'NULL'}`);

    if (lead && (lead as any).id) {
      this.websocketGateway.emitLeadCreated(lead as any);
      this.logger.log(`✅ Lead ${(lead as any).id} created | phone=${phone} | owner=${((lead as any).whatsappOwner as any)?.name ?? '—'}`);
    }

    return {
      status: 'success',
      leadId: (lead as any)?.id ?? null,
      phone,
      instance: instanceName,
    };
  }

  // ════════════════════════════════════════════════
  // OUTGOING MESSAGE (fromMe = true)
  // ════════════════════════════════════════════════

  private async handleOutgoingMessage(params: {
    phone: string;
    messageText: string;
    messageId: string;
    instanceName: string;
    whatsappAccountId: string | null;
  }) {
    const { phone, messageText, messageId, instanceName, whatsappAccountId } = params;

    this.logger.log(`📤 Outgoing message to ${phone} via ${instanceName}: "${messageText.slice(0, 80)}"`);

    // Skip duplicate
    const existing = await this.prisma.message.findUnique({ where: { messageId } });
    if (existing) {
      this.logger.warn(`🔁 Duplicate outgoing message: ${messageId}`);
      return { status: 'ignored', reason: 'duplicate' };
    }

    // Find or create client
    let client = await this.prisma.client.findUnique({ where: { phone } });
    if (!client) {
      client = await this.prisma.client.create({
        data: {
          phone,
          normalizedPhone: phone, // Required field
          name: '',
          whatsappName: '',
        },
      });
      this.logger.log(`📇 Created new client: ${phone}`);
    }

    // Save outgoing message
    await this.prisma.message.create({
      data: {
        messageId,
        clientId: client.id,
        direction: 'OUTGOING',
        message: messageText,
      },
    });

    // ── Parse DATE and TIME from OUTGOING message ──
    // ВАЖНО: дата и время записи часто в ответе оператора!
    // Пример: "Ильхама, я записала Вас на 21.08 в 18:00"
    const parsedDate = this.parserService.extractDate(messageText);
    const parsedTime = this.parserService.extractTime(messageText);

    if (parsedDate || parsedTime) {
      this.logger.log(`📅 Parsed from OUTGOING: date=${parsedDate ?? '—'} time=${parsedTime ?? '—'}`);
    }

    // ── Check if message contains BOOKING confirmation ──
    const lowerText = messageText.toLowerCase();
    
    // ИСКЛЮЧЕНИЯ: фразы-предложения (не подтверждения)
    const isOffer = 
      lowerText.includes('могу записать') ||
      lowerText.includes('могу забронировать') ||
      lowerText.includes('могу зафиксировать') ||
      lowerText.includes('хотите записаться') ||
      lowerText.includes('готовы записаться') ||
      lowerText.includes('можем записать') ||
      lowerText.includes('давайте запишу') ||
      lowerText.includes('могу жазып қою') || // могу записать (каз.)
      lowerText.includes('жазып қоя аламын ба') || // могу ли записать?
      lowerText.includes('жазып қояйын ба'); // записать вас? (вопрос)
    
    if (isOffer) {
      this.logger.debug(`⏸️ Skipped: detected OFFER phrase (not confirmation) for ${phone}`);
      return {
        status: 'success',
        direction: 'outgoing',
        phone,
        isBookingConfirmation: false,
      };
    }
    
    // ПОДТВЕРЖДЕНИЯ: точные фразы
    const isBookingConfirmation = 
      // РУССКИЙ - прошедшее время (100% подтверждение)
      lowerText.includes('записала вас') ||
      lowerText.includes('записал вас') ||
      lowerText.includes('я записала') ||
      lowerText.includes('я записал') ||
      lowerText.includes('забронировала') ||
      lowerText.includes('забронировал') ||
      lowerText.includes('ждем вас') ||
      lowerText.includes('ждём вас') ||
      lowerText.includes('до встречи') && lowerText.match(/\d{1,2}[:\.]?\d{2}/) || // "до встречи в 18:00"
      // РУССКИЙ - настоящее время с датой
      /записываю .{0,50} на \d{1,2}[.\-]\d{1,2}/.test(lowerText) || // "записываю на послезавтра, 24.08"
      /записываю .{0,30} в \d{1,2}[:\.]\d{2}/.test(lowerText) ||    // "записываю в 16:00"
      /записываю [^!?]{0,80}\d{1,2}[.\-]\d{1,2}/.test(lowerText) || // любой вариант с датой
      /фиксирую .{0,50} на \d{1,2}[.\-]\d{1,2}/.test(lowerText) ||
      lowerText.includes('зафиксировала') ||
      lowerText.includes('зафиксировал') ||
      // Специфичные шаблоны операторов
      lowerText.includes('мы уже готовимся к вашему визиту') ||
      lowerText.includes('бронируем кабинет') ||
      lowerText.includes('с вами свяжется менеджер') ||
      // КАЗАХСКИЙ - подтверждение
      lowerText.includes('кутемин') || // "жду вас" (каз.)
      lowerText.includes('күтемін') ||
      lowerText.includes('кутеміз') || // "ждем вас"
      lowerText.includes('күтеміз') ||
      lowerText.includes('жазып қою') || // запишу вас
      lowerText.includes('жазып қой') ||
      lowerText.includes('жазып қояйын') ||
      lowerText.includes('жазып қоямын') ||
      lowerText.includes('жазып қоюға болады') || // можно записать
      lowerText.includes('жазып қоя аламын') ||
      lowerText.includes('белгілеп қою') || // отмечу вас
      lowerText.includes('белгілеп қой') ||
      lowerText.includes('белгілеп қоямын') ||
      lowerText.includes('жазып берем') || // запишу (дам)
      lowerText.includes('жазып берейін') ||
      lowerText.includes('жаксы сагат') || // "хорошо в ... часов"
      lowerText.includes('жазып қойдым') || // "записала" казах. прошедшее
      lowerText.includes('жазып койдым') ||
      lowerText.includes('күтеміз') ||      // "ждём вас"
      lowerText.includes('кутемиз') ||
      // Транслитерация (без қ/ғ)
      lowerText.includes('жазып кою') ||
      lowerText.includes('жазып кой') ||
      lowerText.includes('жазып кояйын') ||
      lowerText.includes('жазып коямын') ||
      lowerText.includes('белгілеп кою') ||
      lowerText.includes('белгілеп кой');

    if (isBookingConfirmation) {
      this.logger.log(`✅ Detected BOOKING confirmation in outgoing message for ${phone}`);

      // Find latest lead for this client
      const latestLead = await this.prisma.lead.findFirst({
        where: {
          client: { phone },
          status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'BOOKED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (latestLead) {
        // Prepare update data
        const updateData: any = {
          botResult: 'BOOKED',
          status: 'BOOKED',
        };

        // Add parsed date and time if available
        if (parsedDate) updateData.parsedDate = parsedDate;
        if (parsedTime) updateData.parsedTime = parsedTime;

        await this.prisma.lead.update({
          where: { id: latestLead.id },
          data: updateData,
        });

        this.logger.log(
          `🎯 Updated lead ${latestLead.id} to BOOKED | date=${parsedDate ?? '—'} time=${parsedTime ?? '—'}`
        );

        // Emit websocket event
        const updatedLead = await this.prisma.lead.findUnique({
          where: { id: latestLead.id },
          include: {
            client: true,
            operator: { include: { user: true } },
            whatsappOwner: true,
          },
        });

        if (updatedLead) {
          this.websocketGateway.emitLeadUpdated(updatedLead);
        }
      } else {
        this.logger.warn(`No active lead found for ${phone} to mark as BOOKED`);
      }
    } else if (parsedDate || parsedTime) {
      // Even if not BOOKED confirmation, still update date/time if found
      const latestLead = await this.prisma.lead.findFirst({
        where: {
          client: { phone },
          status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'BOOKED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (latestLead) {
        const updateData: any = {};
        if (parsedDate) updateData.parsedDate = parsedDate;
        if (parsedTime) updateData.parsedTime = parsedTime;

        await this.prisma.lead.update({
          where: { id: latestLead.id },
          data: updateData,
        });

        this.logger.log(
          `📅 Updated lead ${latestLead.id} with date/time | date=${parsedDate ?? '—'} time=${parsedTime ?? '—'}`
        );
      }
    }

    return {
      status: 'success',
      direction: 'outgoing',
      phone,
      isBookingConfirmation,
      parsedDate: parsedDate ?? null,
      parsedTime: parsedTime ?? null,
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

    // Извлекаем номер телефона из ownerJid при подключении
    // ownerJid format: "77001234567@s.whatsapp.net"
    const ownerJid: string = data?.ownerJid || data?.number || '';
    const phone = ownerJid ? ownerJid.split('@')[0] : null;

    await this.whatsappService.updateAccountStatus(instanceName, state, phone);

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
