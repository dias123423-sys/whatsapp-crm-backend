import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface WebhookLeadInput {
  phone: string;             // нормализованный: +77771234567
  senderName: string;        // pushName из WhatsApp
  messageText: string;       // оригинальный текст
  messageId: string;         // уникальный ID сообщения для идемпотентности
  instanceName: string;      // название instance Evolution API
  whatsappAccountId: string | null;
  whatsappOwnerId: string | null;
}

interface PriceResult {
  price: number;
  currency: string;
}

interface OfferMatch {
  offerId: string;
  offerName: string;
  price: number;
  procedures: string[];
  score: number;
}

@Injectable()
export class WhatsAppParserService {
  private readonly logger = new Logger(WhatsAppParserService.name);

  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════
  // MAIN PIPELINE
  // ═══════════════════════════════════════════════

  /**
   * ГЛАВНАЯ ФУНКЦИЯ: обработка входящего сообщения.
   *
   * Pipeline:
   *   1. PHONE — из WhatsApp metadata (нормализованный)
   *   2. NAME  — из pushName
   *   3. Find/Create CLIENT (dedup by normalizedPhone)
   *   4. Save MESSAGE
   *   5. Find current LEAD (last 24h)
   *   6. Load full CONVERSATION context
   *   7. OLD PARSER: PROCEDURE + PRICE (extractPrice, matchOffer)
   *   8. CONTEXT PARSER: DATE + TIME
   *   9. Save primary data
   *  10. RESULT PARSER: BOOKED / LOST / UNKNOWN
   *  11. Save result
   */
  async createLeadFromWebhook(input: WebhookLeadInput) {
    const { phone, senderName, messageText, messageId, whatsappAccountId, whatsappOwnerId } = input;

    this.logger.log(`📱 Processing: phone=${phone} text="${messageText.slice(0, 80)}"`);

    // ─────────────────────────────────────────────────
    // GUARD: Пустые сообщения (медиа, голосовые, стикеры)
    // Не создаём новый лид, только обновляем существующий
    // ─────────────────────────────────────────────────
    const isEmptyMessage = !messageText || messageText.trim().length === 0;
    if (isEmptyMessage) {
      this.logger.debug(`⏭️ Empty message (media/voice/sticker) from ${phone} — skip lead creation`);
    }

    // ─────────────────────────────────────────────────
    // STEP 1+2: Find or Create Client (dedup by normalizedPhone)
    // ─────────────────────────────────────────────────
    let client = await this.prisma.client.findFirst({
      where: { OR: [{ normalizedPhone: phone }, { phone }] },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: { phone, normalizedPhone: phone, whatsappName: senderName || null },
      });
      this.logger.log(`✅ New client created: ${phone}`);
    } else if (senderName && client.whatsappName !== senderName) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { whatsappName: senderName },
      });
    }

    // ─────────────────────────────────────────────────
    // STEP 3: Save Message (idempotent by messageId)
    // ─────────────────────────────────────────────────
    await this.prisma.message.upsert({
      where: { messageId },
      update: {},
      create: {
        messageId,
        clientId: client.id,
        message: messageText || '',
        direction: 'INCOMING',
        metadata: { instanceName: input.instanceName, whatsappAccountId, senderName },
      },
    });

    // ─────────────────────────────────────────────────
    // STEP 4: Find ANY active lead (not only 24h) → UPDATE or CREATE
    // FIX: Убрана проверка createdAt для предотвращения дубликатов
    // ─────────────────────────────────────────────────
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLead = await this.prisma.lead.findFirst({
      where: {
        clientId: client.id,
        status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'FOLLOW_UP', 'BOOKED'] },
        // FIX: включён BOOKED чтобы не создавались дубли после подтверждения записи
        // Ограничиваем 7 днями чтобы не обновлять очень старые лиды
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentLead) {
      this.logger.log(`♻️  Updating lead ${recentLead.id} (${recentLead.status})`);

      // STEP 5: Load full conversation context (ALL messages since lead creation)
      // FIX: Загружаем ВСЕ сообщения с момента создания лида, не только 24ч
      const allMessages = await this.prisma.message.findMany({
        where: { 
          clientId: client.id, 
          createdAt: { gte: recentLead.createdAt } // С момента создания лида
        },
        orderBy: { createdAt: 'asc' },
      });
      const fullConversation = allMessages.map((m) => m.message).join('\n');
      // FIX: для matchOffer используем только INCOMING сообщения клиента
      // чтобы слова оператора не влияли на определение процедуры/пола
      const incomingOnly = allMessages
        .filter((m) => m.direction === 'INCOMING')
        .map((m) => m.message)
        .join('\n');

      this.logger.debug(`📝 Context: ${allMessages.length} messages`);

      // STEP 6: OLD PARSER — procedure + price (только по INCOMING, чтобы слова оператора не влияли)
      const ctxOffer = await this.matchOffer(incomingOnly, this.extractPrice(incomingOnly)?.price);
      const ctxPrice = this.extractPrice(incomingOnly);

      // STEP 7: CONTEXT PARSER — date + time
      const ctxDate = this.extractDate(fullConversation);
      const ctxTime = this.extractTime(fullConversation);

      // STEP 8: RESULT PARSER — BOOKED / LOST / UNKNOWN
      const ctxResult = this.determineResult(fullConversation);

      const updateData: any = {
        originalMessage: recentLead.originalMessage
          ? `${recentLead.originalMessage}\n---\n${messageText}`
          : messageText,
        updatedAt: new Date(),
      };

      // Procedure: обновляем только если ещё нет
      const hasProcedure = recentLead.parsedProcedures?.length > 0;
      if (!hasProcedure && ctxOffer) {
        updateData.parsedProcedures = ctxOffer.procedures;
        updateData.offerId = ctxOffer.offerId;
        this.logger.log(`📋 Procedure: "${ctxOffer.offerName}"`);
      }

      // Price: обновляем только если ещё нет
      const hasPrice = recentLead.parsedPrice && recentLead.parsedPrice > 0;
      if (!hasPrice) {
        if (ctxOffer) {
          updateData.parsedPrice = ctxOffer.price;
          updateData.parsedCurrency = 'KZT';
          this.logger.log(`💰 Price from offer: ${ctxOffer.price} ₸`);
        } else if (ctxPrice) {
          updateData.parsedPrice = ctxPrice.price;
          updateData.parsedCurrency = 'KZT';
          this.logger.log(`💰 Price extracted: ${ctxPrice.price} ₸`);
        }
      }

      // Date: обновляем только если ещё нет
      if (ctxDate && !(recentLead as any).parsedDate) {
        updateData.parsedDate = ctxDate;
        this.logger.log(`📅 Date: ${ctxDate}`);
      }

      // Time: обновляем только если ещё нет
      if (ctxTime && !(recentLead as any).parsedTime) {
        updateData.parsedTime = ctxTime;
        this.logger.log(`🕐 Time: ${ctxTime}`);
      }

      // Result: BOOKED не деградирует до UNKNOWN
      const prevResult = recentLead.botResult;
      const shouldUpdateResult =
        ctxResult !== null &&
        ctxResult !== prevResult &&
        !(prevResult === 'BOOKED' && ctxResult !== 'LOST');

      if (shouldUpdateResult) {
        updateData.botResult = ctxResult;
        updateData.botResultUpdatedAt = new Date();
        this.logger.log(`🎯 Result: ${prevResult ?? 'null'} → ${ctxResult}`);
      }

      await this.prisma.lead.update({ where: { id: recentLead.id }, data: updateData });
      this.logger.log(`✅ Lead ${recentLead.id} updated`);
      return null;
    }

    // ─────────────────────────────────────────────────
    // STEP 9: Create new Lead
    // Парсим по fullConversation (все сообщения за 24ч)
    // ВАЖНО: текущее сообщение УЖЕ в базе (upsert выше), не дублируем!
    // ─────────────────────────────────────────────────

    // FIX: Если сообщение пустое (медиа/голос/стикер) — НЕ создаём новый лид
    // Пустые сообщения не должны триггерить создание дубля
    if (isEmptyMessage) {
      this.logger.debug(`⏭️ Empty message — skipping new lead creation for ${phone}`);
      return { status: 'skipped', reason: 'empty_message', phone };
    }

    // Загружаем все сообщения клиента за 24ч (включая текущее)
    const prevMessages = await this.prisma.message.findMany({
      where: { clientId: client.id, createdAt: { gte: oneDayAgo } },
      orderBy: { createdAt: 'asc' },
    });
    const fullContext = prevMessages.map((m) => m.message).join('\n');
    // FIX: для matchOffer используем только INCOMING чтобы слова оператора не влияли
    const incomingContext = prevMessages
      .filter((m) => m.direction === 'INCOMING')
      .map((m) => m.message)
      .join('\n');

    const priceResult  = this.extractPrice(incomingContext);
    const offerMatch   = await this.matchOffer(incomingContext, priceResult?.price);
    const parsedDate   = this.extractDate(fullContext);
    const parsedTime   = this.extractTime(fullContext);
    const result       = this.determineResult(fullContext);
    const period       = this.determinePeriod();

    // ─────────────────────────────────────────────────
    // DUPLICATE PREVENTION: Try to create, catch unique constraint violation
    // If another webhook created lead concurrently → retry as update
    // ─────────────────────────────────────────────────
    try {
      const lead = await this.prisma.lead.create({
        data: {
          clientId:          client.id,
          whatsappAccountId: whatsappAccountId ?? undefined,
          whatsappOwnerId:   whatsappOwnerId ?? undefined,
          originalMessage:   messageText || '',
          parsedProcedures:  offerMatch?.procedures ?? [],
          parsedPrice:       offerMatch?.price ?? priceResult?.price ?? null,
          parsedCurrency:    'KZT',
          parsedDate:        parsedDate ?? undefined,
          parsedTime:        parsedTime ?? undefined,
          offerId:           offerMatch?.offerId ?? undefined,
          status:            'NEW',
          source:            'WHATSAPP',
          period,
          botResult:         result ?? undefined,
          botResultUpdatedAt: result ? new Date() : undefined,
        } as any,
        include: { client: true, whatsappAccount: true, whatsappOwner: true, offer: true },
      });

      this.logger.log(
        `✅ Lead created: ${lead.id} | context=${prevMessages.length}msgs | proc=${offerMatch?.offerName ?? 'UNKNOWN'} | price=${offerMatch?.price ?? priceResult?.price ?? 'NULL'} | date=${parsedDate ?? '—'} | time=${parsedTime ?? '—'} | result=${result ?? '—'}`,
      );

      return lead;
    } catch (error: any) {
      // Check if this is a unique constraint violation on clientId
      // Prisma error code P2002 = unique constraint violation
      if (error.code === 'P2002' && error.meta?.target?.includes('clientId')) {
        this.logger.warn(
          `⚠️  Duplicate lead prevented for client ${client.id} (${phone}). Another webhook created lead concurrently. Retrying as update...`
        );

        // Query again for the lead that was just created by another webhook
        const existingLead = await this.prisma.lead.findFirst({
          where: {
            clientId: client.id,
            status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'FOLLOW_UP'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingLead) {
          // Load messages for context
          const allMessages = await this.prisma.message.findMany({
            where: { 
              clientId: client.id, 
              createdAt: { gte: existingLead.createdAt }
            },
            orderBy: { createdAt: 'asc' },
          });
          const fullConversation = allMessages.map((m) => m.message).join('\n');
          // FIX: для matchOffer только INCOMING
          const incomingConv = allMessages
            .filter((m) => m.direction === 'INCOMING')
            .map((m) => m.message)
            .join('\n');

          // Reparse with full context
          const ctxOffer = await this.matchOffer(incomingConv, this.extractPrice(incomingConv)?.price);
          const ctxPrice = this.extractPrice(incomingConv);
          const ctxDate = this.extractDate(fullConversation);
          const ctxTime = this.extractTime(fullConversation);
          const ctxResult = this.determineResult(fullConversation);

          const updateData: any = {
            originalMessage: existingLead.originalMessage
              ? `${existingLead.originalMessage}\n---\n${messageText}`
              : messageText,
            updatedAt: new Date(),
          };

          // Update procedure if not set
          const hasProcedure = existingLead.parsedProcedures?.length > 0;
          if (!hasProcedure && ctxOffer) {
            updateData.parsedProcedures = ctxOffer.procedures;
            updateData.offerId = ctxOffer.offerId;
          }

          // Update price if not set
          const hasPrice = existingLead.parsedPrice && existingLead.parsedPrice > 0;
          if (!hasPrice) {
            if (ctxOffer) {
              updateData.parsedPrice = ctxOffer.price;
              updateData.parsedCurrency = 'KZT';
            } else if (ctxPrice) {
              updateData.parsedPrice = ctxPrice.price;
              updateData.parsedCurrency = 'KZT';
            }
          }

          // Update date if not set
          if (ctxDate && !(existingLead as any).parsedDate) {
            updateData.parsedDate = ctxDate;
          }

          // Update time if not set
          if (ctxTime && !(existingLead as any).parsedTime) {
            updateData.parsedTime = ctxTime;
          }

          // Update result (don't degrade BOOKED to UNKNOWN)
          const prevResult = existingLead.botResult;
          const shouldUpdateResult =
            ctxResult !== null &&
            ctxResult !== prevResult &&
            !(prevResult === 'BOOKED' && ctxResult !== 'LOST');

          if (shouldUpdateResult) {
            updateData.botResult = ctxResult;
            updateData.botResultUpdatedAt = new Date();
          }

          await this.prisma.lead.update({ where: { id: existingLead.id }, data: updateData });
          this.logger.log(`✅ Lead ${existingLead.id} updated after duplicate prevention`);
          return null;
        }

        // If we still can't find the lead, something is very wrong
        this.logger.error(`❌ CRITICAL: Failed to find or create lead for client ${client.id} after unique constraint violation`);
        throw new Error(`Failed to find or create lead for client ${client.id}`);
      }

      // Other errors → rethrow
      throw error;
    }
  }

  // ═══════════════════════════════════════════════
  // STAGE 1 — PRIMARY DATA PARSERS
  // ═══════════════════════════════════════════════

  /**
   * PRICE EXTRACTOR — не изменять!
   * Работает для: 3990, 4990, 5000, 7000, "3990 тг", "4 990 ₸", "7к", "7 мың"
   */
  extractPrice(text: string): PriceResult | null {
    if (!text) return null;

    const normalized = text.toLowerCase().replace(/\s+/g, ' ');

    // Казахский "7к" / "7 к" → 7000
    const kMynMatch = normalized.match(/(^|\s)(\d+)\s*[кk]($|\s)/i);
    if (kMynMatch) {
      const val = parseInt(kMynMatch[2], 10) * 1000;
      if (val >= 1000 && val <= 500_000) return { price: val, currency: '₸' };
    }
    // "7 мың" / "7 мын" / "7мын" — казахский "тысяч"
    // \b не работает с кириллицей, используем lookahead/lookbehind
    const mynMatch = normalized.match(/(\d+)\s*м[ыи][нң][г]?(?!\d)/i);
    if (mynMatch) {
      const val = parseInt(mynMatch[1], 10) * 1000;
      if (val >= 1000 && val <= 500_000) return { price: val, currency: '₸' };
    }

    const patterns: RegExp[] = [
      /(\d[\d\s,]*\d|\d+)\s*(?:тг|₸|тенге|тнг|kzt)/i,
      /(?:за|всего|цена|стоимость|акция|акционная)\s+(\d[\d\s]*\d|\d+)/i,
      /\b(\d{1,3}\s\d{3})\b/,
      /\b([3-9]\d{3})\b/,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        const raw = (match[1] || match[0]).replace(/[\s,]/g, '');
        const price = parseInt(raw, 10);
        if (!isNaN(price) && price >= 100 && price <= 1_000_000) {
          this.logger.debug(`💰 Price: ${price} ₸`);
          return { price, currency: '₸' };
        }
      }
    }

    return null;
  }

  /**
   * DATE EXTRACTOR — отдельный метод для parsedDate.
   * Возвращает ISO строку "YYYY-MM-DD" или null.
   * НЕ смешивается с ценой.
   */
  extractDate(text: string): string | null {
    if (!text) return null;
    const t = text.toLowerCase().replace(/ё/g, 'е');

    const today = new Date();
    const tz = process.env.APP_TIMEZONE || 'Asia/Almaty';

    // Получаем сегодняшнюю дату в Asia/Almaty
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    const todayDate = new Date(todayStr);

    const addDays = (d: Date, n: number): string => {
      const result = new Date(d);
      result.setDate(result.getDate() + n);
      return result.toISOString().split('T')[0];
    };

    const dayOfWeekOffset = (targetDay: number): string => {
      const current = todayDate.getDay(); // 0=sun
      let diff = targetDay - current;
      if (diff <= 0) diff += 7;
      return addDays(todayDate, diff);
    };

    // сегодня / бүгін / бугин
    if (/(^|\s)(сегодня|бүгін|бугін|бугин|бүгінге|бугинге)(\s|$)/.test(t)) {
      return todayStr;
    }
    // завтра / ертең / ертен / ертеңге
    if (/(^|\s)(завтра|ертең|ертен|ертеңге|ертенге)(\s|$)/.test(t)) {
      return addDays(todayDate, 1);
    }
    // послезавтра
    if (/(^|\s)(послезавтра)(\s|$)/.test(t)) {
      return addDays(todayDate, 2);
    }
    // дни недели RU
    if (/(^|\s)(понедельник|дүйсенбі|дуйсенби)(\s|$)/.test(t)) return dayOfWeekOffset(1);
    if (/(^|\s)(вторник|сейсенбі|сейсенби)(\s|$)/.test(t))    return dayOfWeekOffset(2);
    if (/(^|\s)(среду?|сәрсенбі|сарсенби)(\s|$)/.test(t))     return dayOfWeekOffset(3);
    if (/(^|\s)(четверг|бейсенбі|бейсенби)(\s|$)/.test(t))    return dayOfWeekOffset(4);
    if (/(^|\s)(пятниц[ау]?|жұма|жума)(\s|$)/.test(t))        return dayOfWeekOffset(5);
    if (/(^|\s)(суббот[ау]?|сенбі|сенби)(\s|$)/.test(t))      return dayOfWeekOffset(6);
    if (/(^|\s)(воскресенье|жексенбі|жексенби)(\s|$)/.test(t)) return dayOfWeekOffset(0);

    // FIX: формат DD.MM — "22.08", "24.08" и т.д. — ищем ДО extractTime
    const dotDateMatches = [...t.matchAll(/\b(\d{1,2})\.(\d{2})\b/g)];
    for (const dm of dotDateMatches) {
      const day = parseInt(dm[1], 10);
      const month = parseInt(dm[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = todayDate.getFullYear();
        const d = new Date(year, month - 1, day);
        if (d < todayDate) d.setFullYear(year + 1);
        return d.toISOString().split('T')[0];
      }
    }

    // "15 августа" / "15 авг" / "2 сентябырьде" (казахский с окончанием) и т.д.
    const months: Record<string, number> = {
      'январ': 1, 'қаңтар': 1, 'кантар': 1,
      'феврал': 2, 'ақпан': 2, 'акпан': 2,
      'март': 3, 'наурыз': 3,
      'апрел': 4, 'сәуір': 4, 'сауир': 4,
      'май': 5, 'мая': 5, 'мамыр': 5,
      'июн': 6, 'маусым': 6,
      'июл': 7, 'шілде': 7, 'шилде': 7,
      'август': 8, 'тамыз': 8,
      'сентябр': 9, 'қыркүйек': 9, 'кыркуйек': 9,
      'октябр': 10, 'қазан': 10, 'казан': 10,
      'ноябр': 11, 'қараша': 11, 'караша': 11,
      'декабр': 12, 'желтоқсан': 12, 'желтоксан': 12,
    };
    for (const [name, month] of Object.entries(months)) {
      // FIX: ищем цифру + месяц с любыми окончаниями (де, да, та, ге и т.д.)
      const re = new RegExp(`(\\d{1,2})\\s*${name}[а-яөұіңғүқһәёы]*`, 'i');
      const m = t.match(re);
      if (m) {
        const day = parseInt(m[1], 10);
        const year = todayDate.getFullYear();
        const d = new Date(year, month - 1, day);
        // FIX: если дата в прошлом (более 5 дней назад), считаем что это следующий год
        const daysAgo = (todayDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo > 5) d.setFullYear(year + 1);
        return d.toISOString().split('T')[0];
      }
    }

    // FIX: формат DD.MM — "22.08", "24.08" и т.д.
    // Ищем паттерн: 1-2 цифры ТОЧКА 2 цифры (месяц 01-12)
    const dotDateMatch = t.match(/\b(\d{1,2})\.(\d{2})\b/g);
    if (dotDateMatch) {
      for (const dm of dotDateMatch) {
        const parts = dm.split('.');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        // Валидная дата: день 1-31, месяц 1-12
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          const year = todayDate.getFullYear();
          const d = new Date(year, month - 1, day);
          if (d < todayDate) d.setFullYear(year + 1);
          return d.toISOString().split('T')[0];
        }
      }
    }

    return null;
  }

  /**
   * TIME EXTRACTOR — отдельный метод для parsedTime.
   * Возвращает "HH:MM" или null.
   * НЕ смешивается с ценой (цена 3990 не попадёт сюда).
   * 
   * FIX: различаем дату DD.MM и время HH:MM:
   * - "22.08" → дата (месяц 01-12, день > 12 часто)
   * - "14:30" → время (разделитель ":")
   * - "18.30" → НЕОДНОЗНАЧНО → считаем временем только если h <= 23 AND m в {00,15,30,45}
   */
  extractTime(text: string): string | null {
    if (!text) return null;
    const t = text.toLowerCase().replace(/ё/g, 'е');

    // Шаг 1: Сначала найдём ВСЕ даты формата DD.MM чтобы исключить их
    const knownDates = new Set<string>();
    const dateMatches = t.matchAll(/\b(\d{1,2})\.(\d{2})\b/g);
    for (const dm of dateMatches) {
      const day = parseInt(dm[1], 10);
      const month = parseInt(dm[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        knownDates.add(dm[0]); // "22.08", "24.08" и т.д.
      }
    }

    // Шаг 2: Ищем ТОЛЬКО формат HH:MM с двоеточием — это всегда время!
    const colonTimeMatches = t.matchAll(/(\d{1,2}):(\d{2})(?!\d)/g);
    for (const match of colonTimeMatches) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // Шаг 3: Точка как разделитель HH.MM — только если НЕ дата
    const dotTimeMatches = t.matchAll(/(\d{1,2})\.(\d{2})(?!\d)/g);
    for (const match of dotTimeMatches) {
      if (knownDates.has(match[0])) continue; // Пропускаем известные даты
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      // Округлённые минуты: 00, 15, 30, 45 — явный признак времени
      const isRoundMinutes = (m === 0 || m === 15 || m === 30 || m === 45);
      // Час от 6 до 23, минуты округлённые → это время
      if (h >= 6 && h <= 23 && isRoundMinutes) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // "в 16" / "в 9" — только если явно "в X" и X от 6 до 23
    const inTimeMatch = t.match(/(^|\s)в\s+(\d{1,2})(\s|$)/);
    if (inTimeMatch) {
      const h = parseInt(inTimeMatch[2], 10);
      if (h >= 6 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    // "сағат 16" / "сағат 14"
    const sagatMatch = t.match(/сағат\s+(\d{1,2})/);
    if (sagatMatch) {
      const h = parseInt(sagatMatch[1], 10);
      if (h >= 1 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    // "4-те" / "4те" — казахские суффиксы времени
    const kzTimeMatch = t.match(/(\d{1,2})-?(?:те|де|да|та)(?!\w)/);
    if (kzTimeMatch) {
      const h = parseInt(kzTimeMatch[1], 10);
      if (h >= 1 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    return null;
  }

  /**
   * OFFER MATCHER — не изменять!
   * Scoring: +50 price match, +10 keyword, +20 category, +5 name words
   */
  async matchOffer(text: string, price?: number): Promise<OfferMatch | null> {
    if (!text && !price) return null;

    const normalized = this.normalizeText(text);

    const offers = await this.prisma.offer.findMany({ where: { active: true } });
    if (offers.length === 0) {
      this.logger.warn('⚠️ No active offers in DB!');
      return null;
    }

    let bestOffer: any = null;
    let bestScore = 0;

    for (const offer of offers) {
      let score = 0;

      if (price !== undefined && price !== null && offer.price === price) {
        score += 50;
      }

      const matchedKeywords = (offer.keywords as string[]).filter((kw) => {
        const kwNorm = kw.toLowerCase().trim();
        return kwNorm.length > 2 && normalized.includes(kwNorm);
      });
      score += matchedKeywords.length * 10;

      if (offer.category) {
        const catNorm = (offer.category as string).toLowerCase();
        if (normalized.includes(catNorm)) score += 20;
      }

      const nameWords = offer.name.toLowerCase().split(/[\s+,]+/).filter((w) => w.length > 3);
      score += nameWords.filter((w) => normalized.includes(w)).length * 5;

      if (score > bestScore) {
        bestScore = score;
        bestOffer = offer;
      }
    }

    const THRESHOLD = 10;
    if (bestScore >= THRESHOLD && bestOffer) {
      this.logger.log(`✅ Offer: "${bestOffer.name}" score=${bestScore} price=${bestOffer.price}₸`);
      return {
        offerId: bestOffer.id,
        offerName: bestOffer.name,
        price: bestOffer.price,
        procedures: this.splitProcedureName(bestOffer.name),
        score: bestScore,
      };
    }

    this.logger.log(`❌ No offer match (bestScore=${bestScore})`);
    return null;
  }

  // ═══════════════════════════════════════════════
  // STAGE 2 — RESULT PARSER
  // ═══════════════════════════════════════════════

  /**
   * STAGE 2 — RESULT PARSER
   *
   * Определяет итог диалога ТОЛЬКО по явным фразам клиента.
   * Запускается ПОСЛЕ сбора основных данных (procedure/price/date/time).
   *
   * BOOKED  — клиент явно подтвердил запись
   * LOST    — клиент явно отказался
   * UNKNOWN — недостаточно данных (клиент думает / откладывает)
   * null    — недостаточно данных (не угадываем)
   *
   * Короткие ответы "иа"/"да"/"барам" → null (без контекста бота нельзя определить).
   * Бот находится в другом проекте — OUTGOING не используем.
   */
  determineResult(fullConversation: string): 'BOOKED' | 'LOST' | 'UNKNOWN' | null {
    if (!fullConversation?.trim()) return null;

    // ══════════════════════════════════════════════════════════════════════
    // КРИТИЧЕСКИ: Сначала разделяем на сообщения, ПОТОМ нормализуем
    // ══════════════════════════════════════════════════════════════════════
    // replace(/\s+/g, ' ') УНИЧТОЖАЕТ \n → lastLine становится всей историей!
    
    // Шаг 1: Разделяем conversation на отдельные сообщения
    const rawLines = fullConversation
      .split(/\n|---/)
      .map((line) => line.trim())
      .filter(Boolean);

    // Шаг 2: Получаем последнее сообщение клиента
    const lastRawLine = rawLines[rawLines.length - 1] ?? '';

    // Шаг 3: Нормализация для анализа
    const normalizeResultText = (value: string) =>
      value
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();

    // lastMessage = ТОЛЬКО последнее сообщение (для RESULT)
    // text = вся история (для PRIMARY DATA: procedure/price/date/time)
    const lastMessage = normalizeResultText(lastRawLine);
    const text = normalizeResultText(fullConversation);

    // ══════════════════════════════════════════════════════════════════════
    // НОВАЯ ЛОГИКА (PRODUCTION FIX):
    // ══════════════════════════════════════════════════════════════════════
    // Scenario 1: Клиент спрашивает о процедурах → отказывается
    //   Message: "Хочу получить массаж" → "жоқ"
    //   Результат: null (НЕ LOST, т.к. не было попытки записи)
    //
    // Scenario 2: Клиент пытается записаться → отказывается
    //   Message: "Хочу записаться" → "дорого, не буду"
    //   Результат: LOST (была попытка записи, но отказался)
    //
    // Scenario 3: Клиент пытается записаться → нейтральное сообщение
    //   Message: "Хочу записаться" → "хорошо, спасибо"
    //   Результат: BOOKED (была попытка записи, оператор работает)
    //
    // Логика:
    //   1. Проверить ВСЕЙ ИСТОРИИ: пытался ли клиент записаться?
    //   2. Если НЕТ попытки записи → return null (игнорировать LOST/UNKNOWN)
    //   3. Если БЫЛА попытка → проверить lastMessage:
    //      - LOST фраза → LOST
    //      - UNKNOWN фраза → UNKNOWN
    //      - BOOKED фраза → BOOKED
    //      - Else → BOOKED (контакт установлен, оператор работает)
    // ══════════════════════════════════════════════════════════════════════

    // ── STEP 1: Проверяем, была ли ПОПЫТКА ЗАПИСИ во всей истории ─────────
    const BOOKING_INTENT_PHRASES = [
      // КАЗАХСКИЙ
      'жазылғым келеді', 'жазылгым келеді', 'жазылғым келед', 'жазылгым келед',
      'жазылуға келдім', 'жазылуга келдим',
      'жазылып алайын', 'жазып қой', 'жазып кой',
      'жазып қойыңыз', 'жазып койыңыз',
      'жазып беріңіз', 'жазып бериниз',
      'мені жазып қойыңыз', 'мени жазып койыныз',
      'жазып қояйын', 'жазып кояйын',
      'жазып қоя аласыз', 'жазып коя аласыз',
      'ертеңге жаза', 'ертенге жаза',
      'жазылдым',
      // РУССКИЙ
      'хочу записаться', 'хочу записатся',
      'запишите меня', 'запишите на', 'записывайте', 'записываюсь',
      'я записываюсь', 'подтверждаю запись',
      'можно меня записать',
    ];

    let hasBookingIntent = false;
    for (const phrase of BOOKING_INTENT_PHRASES) {
      if (text.includes(phrase)) {
        hasBookingIntent = true;
        this.logger.log(`📌 BOOKING INTENT found in history: "${phrase}"`);
        break;
      }
    }

    // Если НЕТ попытки записи → return null (просто вопросы, не лид)
    if (!hasBookingIntent) {
      this.logger.log(`⚪ NULL | no booking intent in conversation history`);
      return null;
    }

    // ── STEP 2: Была попытка записи → проверяем lastMessage ───────────────
    
    // ══════════════════════════════════════════════════════════════════════
    // NEW LOGIC: Check ONLY last 2 messages (ignore auto-ad)
    // ══════════════════════════════════════════════════════════════════════
    // Problem: Auto-ads contain "ХОЧУ ЗАПИСАТЬСЯ...3990 ТГ" → parser thinks BOOKED
    // Solution: Detect auto-ad, check only last 2 REAL client messages
    
    // Helper: detect auto-advertisement
    const isAutoAd = (msg: string): boolean => {
      const txt = msg.toLowerCase();
      return /хочу записаться/i.test(txt) && /\d{3,4}\s*тг/i.test(txt);
    };

    // Get last 2 real messages (excluding auto-ad if present)
    const startIndex = rawLines.length > 0 && isAutoAd(rawLines[0]) ? 1 : 0;
    const realMessages = rawLines.slice(startIndex);
    const last2Messages = realMessages.slice(-2);
    const last2Text = last2Messages.join(' ').toLowerCase();
    
    // FIX: Определяем last3Text и allText ЗДЕСЬ, чтобы использовать ниже
    const last3Messages = rawLines.slice(-3);
    const last3Text = last3Messages.join(' | ').toLowerCase();
    const allText = rawLines.join(' ').toLowerCase();

    this.logger.debug(`[LAST2] First is auto-ad: ${startIndex > 0}, real messages: ${realMessages.length}`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // КРИТИЧЕСКИ ВАЖНО: Если ТОЛЬКО авто-реклама (0 реальных сообщений) = NULL
    // ═══════════════════════════════════════════════════════════════════════
    if (realMessages.length === 0) {
      this.logger.log(`⚪ NULL | only auto-ad, no real client messages`);
      return null;
    }
    
    // ── 2.0. CITY/LOCATION CLARIFICATION (САМЫЙ ВЫСОКИЙ ПРИОРИТЕТ) ──────────
    // АКТОБЕ = можно записать (наш город)
    // АЛМАТЫ, другие города = LOST (отказ по региону)
    const REJECTION_CITIES = [
      'алматы', 'алмата', 'алма-ата', 'алмати',
      'шымкент', 'шимкент',
      'караганда', 'қарағанды',
      'павлодар', 'семей', 'семипалатинск',
      'петропавловск', 'костанай', 'қостанай',
      'тараз', 'атырау', 'ақтау', 'актау',
      'усть-каменогорск', 'өскемен', 'oskemen',
      'кызылорда', 'қызылорда',
      'талдыкорган', 'туркестан', 'темиртау',
      'астана', 'нұр-сұлтан', 'нур-султан',
    ];
    
    // NEW: Проверка "гость города" / "проездом"
    const GUEST_PHRASES = [
      'гость', 'гостья', 'гости',
      'проездом', 'проезжаю',
      'қонақ', 'конак', // казахский "гость"
    ];
    
    const LOCATION_PHRASES = [
      'проживаю в', 'живу в', 'я из', 'нахожусь в',
      'я в городе', 'я в области',
      'тұрамын', 'турамын',
    ];
    
    const BOOKING_CONFIRMATIONS = [
      'запішите', 'записывай', 'приду', 'прийду', 'да,', 'хорошо',
      'ок', 'окей', 'удобно', 'могу прийти', 'завтра', 'послезавтра',
      'жазып қой', 'жазып кой', 'жазып беріңіз', 'жазып бериниз',
      'жазыламын', 'жазыңызшы', 'бекітіңіз', // казахские подтверждения
    ];
    
    // Check ONLY last 2-3 messages for city rejection
    if (last2Messages.length > 0) {
      // NEW: Check "гость города" / "проездом" - immediate LOST
      for (const phrase of GUEST_PHRASES) {
        if (last2Text.includes(phrase)) {
          // Проверяем: был ли ОТКАЗ от оператора?
          const rejectionContext = last3Text;
          const hasRejectionPhrase = (
            rejectionContext.includes('только для жителей актобе') ||
            rejectionContext.includes('актюбинской области') ||
            rejectionContext.includes('акция действует только для') ||
            rejectionContext.includes('для гостей не действует') ||
            rejectionContext.includes('для гостей города не действует')
          );
          
          if (hasRejectionPhrase) {
            this.logger.log(`❌ LOST | guest phrase "${phrase}" + operator refusal`);
            return 'LOST';
          }
        }
      }
      
      // Check REJECTION cities (Almaty, Astana, etc.) - these are LOST (не обслуживаем)
      for (const city of REJECTION_CITIES) {
        if (last2Text.includes(city)) {
          // Проверяем: был ли ОТКАЗ от оператора в последних 3 сообщениях?
          const rejectionContext = last3Text;
          const hasRejectionPhrase = (
            rejectionContext.includes('только для жителей актобе') ||
            rejectionContext.includes('актюбинской области') ||
            rejectionContext.includes('акция действует только для') ||
            rejectionContext.includes('не оформляется') ||
            rejectionContext.includes('не подходите') ||
            rejectionContext.includes('не можем записать')
          );
          
          if (hasRejectionPhrase) {
            this.logger.log(`❌ LOST | rejection city "${city}" + operator refusal in last 3`);
            return 'LOST';
          }
          
          // Если ТОЛЬКО название города без отказа → UNKNOWN (уточняем)
          this.logger.log(`⏳ UNKNOWN | city "${city}" mentioned, but no refusal yet`);
          return 'UNKNOWN';
        }
      }
      
      // NEW: Check if client ONLY wrote "Aktobe" or city name without confirmation
      // This means they're thinking, not booking yet
      const isOnlyCityMention = last2Messages.length <= 2 && (
        last2Text.trim() === 'актобе' ||
        last2Text.trim() === 'алматы' ||
        last2Text.trim() === 'алмата' ||
        /^(актобе|алматы|алмата)[\s,\.]*$/i.test(last2Text) ||
        (last2Messages.length === 2 && 
         /^(актобе|алматы)$/i.test(last2Messages[0]) && 
         /^[а-яёА-ЯЁ]{2,20}$/i.test(last2Messages[1])) // город + имя
      );
      
      if (isOnlyCityMention) {
        const hasConfirmation = BOOKING_CONFIRMATIONS.some(phrase => last2Text.includes(phrase));
        const hasTime = /в\s*\d{1,2}[:.]?\d{0,2}|\d{1,2}[:\.]\d{2}|ға$|ге$|\d{1,2}\s*(числа|августа)/i.test(last2Text);
        
        if (!hasConfirmation && !hasTime) {
          this.logger.log(`⏳ UNKNOWN | only city name in last 2 WITHOUT confirmation (thinking)`);
          return 'UNKNOWN';
        }
      }
      
      // Check location phrases in last 2 (excluding Almaty/Aktobe)
      for (const phrase of LOCATION_PHRASES) {
        if (last2Text.includes(phrase)) {
          const contextMatch = last2Text.match(new RegExp(phrase + '\\s*([а-яөұң\\w\\s]{0,30})', 'i'));
          if (contextMatch && !contextMatch[0].includes('алмат') && !contextMatch[0].includes('актоб')) {
            this.logger.log(`⏳ UNKNOWN | location phrase in last 2 (not Almaty/Aktobe): "${phrase}"`);
            return 'UNKNOWN';
          }
        }
      }
    }
    
    // ── 2.1. LOST: явный отказ в КОНТЕКСТЕ последних 3 сообщений ──────────
    
    // ═══════════════════════════════════════════════════════════════════════
    // NEW: ОТКАЗ ПО ВОЗРАСТУ
    // ═══════════════════════════════════════════════════════════════════════
    // Проверяем: есть ли в истории ОТКАЗ по возрасту от оператора?
    const AGE_REJECTION_PATTERNS = [
      /до \d+ лет включительно/i,
      /от \d+ до \d+ лет/i,
      /на Вас запись.*не оформляется/i,
      /не оформляется.*возраст/i,
      /по условиям акции.*принимаем/i,
      /не подходите по возрасту/i,
      /возраст.*не подходит/i,
    ];

    for (const pattern of AGE_REJECTION_PATTERNS) {
      if (pattern.test(last3Text)) {
        this.logger.log(`❌ LOST | age rejection found in last 3: ${pattern}`);
        return 'LOST';
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // NEW: ОТМЕНА ЗАПИСИ КЛИЕНТОМ
    // ═══════════════════════════════════════════════════════════════════════
    const CANCELLATION_PATTERNS = [
      /отмените.*запись/i,
      /отменить.*запись/i,
      /не получается.*отмените/i,
      /не смогу.*отмените/i,
      /отмен[яи]/i,
      /передумал.*не приду/i,
      /передумала.*не приду/i,
      /извините.*не получается/i,
      /извините.*отмените/i,
    ];

    for (const pattern of CANCELLATION_PATTERNS) {
      if (pattern.test(lastMessage)) {
        this.logger.log(`❌ LOST | cancellation request in last message: ${pattern}`);
        return 'LOST';
      }
    }
    
    const LOST_PATTERNS = [
      /не надо.*(не пишите|все на этом)/,
      /не нужно.*не нужно/, // повторение = явный отказ
      /отмените/,
      /передумал|передумала/,
      /(я|mы).*(уже была|были).*(недовольн|плохо)/,
      /не пишите.*все на этом/,
      /ну ладно.*другой раз/,
      /если поменяю решение/,
      /не получится.*на работу/,    // "не получится, на работу вызвали"
      /не получиться.*на работу/,   // опечатка
      /на работу вызвали/,           // вызвали на работу = отмена
      /пусть кому.?то повезёт/,      // "пусть кому-то повезёт" = я отказываюсь
      /пусть кому.?то повезет/,      // без ё
      /не беспокоит/,                // "пусть не беспокоит меня"
      /менеджер.{0,10}рыбак/,        // негатив про менеджеров
      // КАЗАХСКИЙ
      /келмеймін|келмеймин/,        // не приду
      /бармаймын|бармаймин/,        // не пойду
      /керек емес/,                 // не надо
      /қолым бос емес|колым бос емес/, // я занят (нет времени)
      /қажет емес|кажет емес/,      // не нужно
      /жазбаңыз|жазбаныз/,          // не записывайте
    ];

    for (const pattern of LOST_PATTERNS) {
      if (pattern.test(last3Text)) {
        this.logger.log(`❌ LOST | refusal pattern in last 3: ${pattern}`);
        return 'LOST';
      }
    }

    // ── 2.3. UNKNOWN в последнем сообщении ───────────────────────────────────
    const UNKNOWN_PHRASES = [
      // КАЗАХСКИЙ
      'ойланам', 'ойланайын', 'ойланып алайын',
      'кейін айтам', 'кейін жазам', 'кейин айтам', 'кейин жазам',
      'білмеймін', 'білмим', 'билмеймин', 'билмим',
      'ақылдасам', 'ақылдасып алайын', 'акылдасам',
      // РУССКИЙ
      'я подумаю', 'подумаю', 'надо подумать',
      'позже', 'потом', 'позже скажу', 'позже напишу',
      'ещё не знаю', 'еще не знаю',
      'повременю',                      // откладывает решение
      'на работе',                      // занят на работе
      'пока не могу',                   // временно не может
      'напишу вам',                     // "напишу вам после отпуска"
      'напишу после',                   // откладывает
      'после отпуска',                  // откладывает на после отпуска
      'буду посвободнее',               // занят сейчас
      'потом напишу',                   // откладывает
      'не смогу сегодня',               // только сегодня не может
      'занята перед',                   // занята (временно)
    ];

    for (const p of UNKNOWN_PHRASES) {
      if (lastMessage.includes(p)) {
        this.logger.log(`⏳ UNKNOWN | thinking in last message: "${p}"`);
        return 'UNKNOWN';
      }
    }
    
    // ── 2.3.1. UNKNOWN: откладывает на будущее (месяцы) ──────────────────────
    if (/в\s+(сентябр|октябр|ноябр|декабр)/i.test(lastMessage)) {
      this.logger.log(`⏳ UNKNOWN | postponing to future month`);
      return 'UNKNOWN';
    }
    
    // ── 2.3.2. UNKNOWN: "пока" в начале сообщения ─────────────────────────────
    if (/^пока[,\s\.]/i.test(lastMessage.trim())) {
      this.logger.log(`⏳ UNKNOWN | "пока" at message start`);
      return 'UNKNOWN';
    }

    // ── 2.2. BOOKED: есть ВРЕМЯ или ЯВНОЕ ПОДТВЕРЖДЕНИЕ во ВСЕХ сообщениях ──
    // Проверяем ВСЕ сообщения, не только последнее!
    const TIME_PATTERNS = [
      /\d{1,2}[:\.]\d{2}/, // "14:30", "11.00"
      /в\s*\d{1,2}(?:\s|$|,)/, // "в 18", "в 14"
      /\d{1,2}\.\d{1,2}/, // "20.08", "22.08"
      /завтра|послезавтра|сегодня/,
      /ертең|ертен|бүгін|бугин/, // казахский: завтра, сегодня
    ];

    const CONFIRMATION_PATTERNS = [
      /вот удобно/,
      /могу прийти/,
      /хорошо,?\s*приду/,
      /записывайте/,
      /жазыламын|жазып қой|жазып кой/, // казахский: записываюсь, запишите
      /приду/,
      /буду/,
      // КАЗАХСКИЙ (подтверждение)
      /келемін|келемин/,    // приду
      /барамын|барамин/,    // пойду
      /келеді|келеди/,      // придёт
      /жақсы|жаксы/,        // хорошо (подтверждение)
      /жазып қойыңыз|жазып койыныз/, // запишите меня
      /жазып беріңіз|жазып бериниз/, // запишите (вежливо)
      // РУССКИЙ короткие подтверждения
      /\bда\b/,             // да
      /\bия\b/,             // да (разговорное)
      /\bиа\b/,             // да (разговорное)
    ];

    let hasTime = false;
    let hasConfirmation = false;

    for (const pattern of TIME_PATTERNS) {
      if (pattern.test(allText)) {
        hasTime = true;
        this.logger.log(`⏰ Time/date found: ${pattern}`);
        break;
      }
    }

    for (const pattern of CONFIRMATION_PATTERNS) {
      if (pattern.test(allText)) {
        hasConfirmation = true;
        this.logger.log(`✅ Confirmation found: ${pattern}`);
        break;
      }
    }

    if (hasTime || hasConfirmation) {
      this.logger.log(`✅ BOOKED | has time or explicit confirmation`);
      return 'BOOKED';
    }

    // ── 2.3. UNKNOWN думает, уточняет ──────────────────────────────────────────
    const UNKNOWN_PATTERNS_CONTEXT = [
      /вечером напишу/,
      /позже (скажу|напишу)/,
      /я подумаю/,
      /ойланам|ойланайын/, // казахский: подумаю
    ];

    for (const pattern of UNKNOWN_PATTERNS_CONTEXT) {
      if (pattern.test(last3Text)) {
        this.logger.log(`⏳ UNKNOWN | thinking/delaying: ${pattern}`);
        return 'UNKNOWN';
      }
    }

    // ── 2.4. ПО УМОЛЧАНИЮ: UNKNOWN (недостаточно данных для BOOKED) ──────────
    // Если была попытка записи, но НЕТ времени и НЕТ явного подтверждения
    // → UNKNOWN (клиент думает, уточняет, не подтвердил)
    this.logger.log(`⏳ UNKNOWN | booking intent found, but no time/confirmation`);
    return 'UNKNOWN';
  }

  // ═══════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════

  normalizeText(text: string): string {
    if (!text) return '';
    let t = text.toLowerCase().trim();

    const greetings = [
      'здравствуйте', 'здравствуй', 'добрый день', 'добрый вечер',
      'доброе утро', 'добрый утро', 'привет', 'хелло',
      'саламатсызба', 'саламатсыздарба', 'сәлеметсіз бе',
      'сәлеметсізбе', 'сәлем', 'салем',
      'ассалаумагалейкум', 'ассаламуалейкум', 'алейкумасалам', 'алло',
      'хочу записаться', 'хочу узнать', 'можно узнать',
      'скажите пожалуйста', 'заранее подготовленное сообщение', 'отправьте автотекст',
    ];
    for (const g of greetings) {
      t = t.replace(new RegExp(g, 'gi'), ' ');
    }
    return t
      .replace(/[^\wа-яёА-ЯЁәіңғүұқөһӘІҢҒҮҰҚӨҺ\s₸+]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  splitProcedureName(offerName: string): string[] {
    return offerName.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  }

  determinePeriod(): 'DAY' | 'NIGHT' {
    const timezone = process.env.APP_TIMEZONE || 'Asia/Almaty';
    const now = new Date();
    const hourStr = now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
    const hour = parseInt(hourStr, 10);
    return (hour >= 19 || hour < 9) ? 'NIGHT' : 'DAY';
  }

  normalizePhone(raw: string): string {
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('8') && digits.length === 11) digits = '7' + digits.slice(1);
    if (digits.length === 10) digits = '7' + digits;
    return '+' + digits;
  }

  /** Найти клиента по нормализованному телефону */
  async findClientByPhone(phone: string) {
    return this.prisma.client.findFirst({
      where: { OR: [{ normalizedPhone: phone }, { phone }] },
    });
  }
}
