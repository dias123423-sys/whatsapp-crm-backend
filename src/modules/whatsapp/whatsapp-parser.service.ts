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
      const fullConversation = allMessages
        .map((m) => `${m.direction.toLowerCase()}: ${m.message}`)
        .join('\n');
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

      // STEP 7.5: NEW PARSERS — age, gender, city, name
      const ctxAge = this.extractAge(fullConversation);
      const ctxGender = this.extractGender(fullConversation, ctxAge ?? undefined);
      const { city: ctxCity, isAktobe: ctxIsAktobe } = this.extractCityAndResident(fullConversation);
      const ctxName = this.extractName(allMessages.map(m => m.message));

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

      // Age: обновляем только если ещё нет
      if (ctxAge && !(recentLead as any).parsedAge) {
        updateData.parsedAge = ctxAge;
        this.logger.log(`👤 Age: ${ctxAge}`);
      }

      // Gender: обновляем только если ещё нет
      if (ctxGender && !(recentLead as any).parsedGender) {
        updateData.parsedGender = ctxGender;
        this.logger.log(`👤 Gender: ${ctxGender}`);
      }

      // City: обновляем только если ещё нет
      if (ctxCity && !(recentLead as any).parsedCity) {
        updateData.parsedCity = ctxCity;
        this.logger.log(`🏙️ City: ${ctxCity}`);
      }

      // Aktobe resident: обновляем только если ещё нет
      if (ctxIsAktobe !== undefined && (recentLead as any).isAktobeResident === null) {
        updateData.isAktobeResident = ctxIsAktobe;
        this.logger.log(`📍 Aktobe resident: ${ctxIsAktobe ? 'YES' : 'NO'}`);
      }

      // Name: обновляем только если ещё нет
      if (ctxName && !(recentLead as any).parsedName) {
        updateData.parsedName = ctxName;
        this.logger.log(`👤 Name: ${ctxName}`);
        
        // Обновляем имя клиента в Client, если его там нет
        if (!client.name) {
          await this.prisma.client.update({
            where: { id: client.id },
            data: { name: ctxName },
          });
          this.logger.log(`✅ Client name updated: ${ctxName}`);
        }
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
    const fullContext = prevMessages
      .map((m) => `${m.direction.toLowerCase()}: ${m.message}`)
      .join('\n');
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

    // Новые парсеры
    const parsedAge    = this.extractAge(fullContext);
    const parsedGender = this.extractGender(fullContext, parsedAge ?? undefined);
    const { city: parsedCity, isAktobe: isAktobeResident } = this.extractCityAndResident(fullContext);
    const parsedName   = this.extractName(prevMessages.map(m => m.message));

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
          parsedAge:         parsedAge ?? undefined,
          parsedGender:      parsedGender ?? undefined,
          parsedCity:        parsedCity ?? undefined,
          isAktobeResident:  isAktobeResident ?? undefined,
          parsedName:        parsedName ?? undefined,
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
          const fullConversation = allMessages
            .map((m) => `${m.direction.toLowerCase()}: ${m.message}`)
            .join('\n');
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

          // Новые парсеры
          const ctxAge = this.extractAge(fullConversation);
          const ctxGender = this.extractGender(fullConversation, ctxAge ?? undefined);
          const { city: ctxCity, isAktobe: ctxIsAktobe } = this.extractCityAndResident(fullConversation);
          const ctxName = this.extractName(allMessages.map(m => m.message));

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

          // Update age if not set
          if (ctxAge && !(existingLead as any).parsedAge) {
            updateData.parsedAge = ctxAge;
          }

          // Update gender if not set
          if (ctxGender && !(existingLead as any).parsedGender) {
            updateData.parsedGender = ctxGender;
          }

          // Update city if not set
          if (ctxCity && !(existingLead as any).parsedCity) {
            updateData.parsedCity = ctxCity;
          }

          // Update Aktobe resident flag if not set
          if (ctxIsAktobe !== undefined && (existingLead as any).isAktobeResident === null) {
            updateData.isAktobeResident = ctxIsAktobe;
          }

          // Update name if not set
          if (ctxName && !(existingLead as any).parsedName) {
            updateData.parsedName = ctxName;
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
  // ═══════════════════════════════════════════════
  // STAGE 2 — RESULT PARSER (SIMPLIFIED - Deploy #27)
  // ═══════════════════════════════════════════════
  /**
   * SIMPLIFIED RESULT PARSER (Deploy #27)
   *
   * НОВАЯ ЛОГИКА:
   * 1. BOOKED = ТОЛЬКО если OUTGOING содержит явное подтверждение записи
   * 2. LOST = явный отказ клиента или оператора
   * 3. Всё остальное = NULL (не определяем)
   * 4. OLD PARSER (procedure/price/date/time) НЕ ТРОГАЕМ
   */
  determineResult(fullConversation: string): 'BOOKED' | 'LOST' | 'UNKNOWN' | null {
    if (!fullConversation?.trim()) return null;

    const rawLines = fullConversation
      .split(/\n|---/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) return null;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: BOOKED — ТОЛЬКО ЯВНОЕ ПОДТВЕРЖДЕНИЕ ЗАПИСИ ОПЕРАТОРОМ/БОТОМ
    // ═══════════════════════════════════════════════════════════════════

    const BOOKED_PHRASES = [
      // RU - используем \b для поиска целых слов
      'записала вас',
      'записал вас',
      'я вас записала',
      'я вас записал',
      'записываю вас',
      'вы записаны',
      'запись подтверждена',
      'вас записал',
      'вас записала',
      'мы вас записали',
      'я записываю вас',
      'вы записаны на',
      'ваша запись подтверждена',
      // KZ
      'жазып қойдым',
      'жазып қоямын',
      'сізді жаздым',
      'сізді жазып қойдым',
      'жазып алдым',
      'жазылдыңыз',
      'сізді жазып қоямын',
      'сізді жазып алдым',
    ];

    for (const line of rawLines) {
      const lowerLine = line.toLowerCase();
      // BOOKED ищем ТОЛЬКО в OUTGOING.
      if (!lowerLine.startsWith('outgoing:')) {
        continue;
      }
      const msg = lowerLine.replace(/^outgoing:\s*/i, '').trim();
      
      // Проверяем каждую фразу как ЦЕЛОЕ слово (с границами слов)
      for (const phrase of BOOKED_PHRASES) {
        // Экранируем спецсимволы regex и добавляем границы слов
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(msg)) {
          this.logger.log(
            `✅ BOOKED | explicit confirmation: "${phrase}" in "${msg.substring(0, 100)}..."`,
          );
          return 'BOOKED';
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: НЕТ ЯВНОГО ПОДТВЕРЖДЕНИЯ → НЕ BOOKED
    // ═══════════════════════════════════════════════════════════════════
    //
    // Намерение клиента:
    //   "хочу записаться"
    //   "запишите меня"
    //   "можно записаться?"
    //
    // НЕ является подтверждением.
    //
    // Информация оператора:
    //   "менеджер с вами свяжется"
    //   "рабочее время 09:00–18:00"
    //   "можно записаться"
    //
    // НЕ является подтверждением.
    //
    // Поэтому здесь больше НЕ используем INTENT для определения BOOKED.

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: LOST — только явный отказ клиента / отказ оператора
    // ═══════════════════════════════════════════════════════════════════

    const clientMsgs = rawLines
      .filter((line) => line.toLowerCase().startsWith('incoming:'))
      .map((line) =>
        line.replace(/^incoming:\s*/i, '').trim().toLowerCase(),
      )
      .slice(-3)
      .join(' ');

    const LOST = [
      // RU
      'не буду',
      'не хочу',
      'не нужно',
      'дорого',
      'передумал',
      'передумала',
      'откажусь',
      'не интересно',
      'неинтересно',
      'не подходит',
      'занят',
      'занята',
      'нет времени',
      'отменить',
      'отмените',
      // KZ
      'жоқ',
      'болмайды',
      'қымбат',
      'кымбат',
      'келмеймін',
      'қажет емес',
      'жарамайды',
      'бос емес',
      'қызығушылық жоқ',
    ];

    for (const phrase of LOST) {
      if (clientMsgs.includes(phrase)) {
        this.logger.log(`❌ LOST | client refusal: "${phrase}"`);
        return 'LOST';
      }
    }

    // Отказ со стороны оператора.
    const operatorMsgs = rawLines
      .filter((line) => line.toLowerCase().startsWith('outgoing:'))
      .slice(-3)
      .map((line) =>
        line.replace(/^outgoing:\s*/i, '').trim().toLowerCase(),
      )
      .join(' ');

    const REJECTION = [
      'только для жителей актобе',
      'акция действует только для',
      'не оформляется',
      'не подходите по возрасту',
      'до 55 лет включительно',
      'до 60 лет включительно',
    ];

    for (const phrase of REJECTION) {
      if (operatorMsgs.includes(phrase)) {
        this.logger.log(`❌ LOST | operator rejection: "${phrase}"`);
        return 'LOST';
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: ВСЁ ОСТАЛЬНОЕ — НЕ ОПРЕДЕЛЯЕМ RESULT
    // ═══════════════════════════════════════════════════════════════════

    this.logger.log(`⚪ NULL | no explicit booking confirmation`);
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // НОВЫЕ ПАРСЕРЫ: ВОЗРАСТ, ПОЛ, ГОРОД, ИМЯ
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Извлекает возраст из сообщений клиента
   * Примеры: "58", "28 лет", "мне 21 год", "19"
   */
  extractAge(text: string): number | null {
    if (!text) return null;

    const t = text.toLowerCase();

    // Паттерны для возраста
    const patterns = [
      /(?:мне|возраст)\s*(\d{2})\s*(?:лет|год|жас)/i,  // "мне 28 лет", "возраст 58"
      /(?:^|\s)(\d{2})\s*(?:лет|год|жас)/i,            // "28 лет", "58 жас"
      /(?:^|\s)(\d{2})(?:\s|$)/,                        // просто "28" или "58"
    ];

    for (const pattern of patterns) {
      const match = t.match(pattern);
      if (match) {
        const age = parseInt(match[1], 10);
        // Валидация: 15-99 лет
        if (age >= 15 && age <= 99) {
          return age;
        }
      }
    }

    return null;
  }

  /**
   * Определяет пол по возрасту и ограничениям
   * Женщины: от 20 лет
   * Мужчины: от 30 лет
   */
  extractGender(text: string, age?: number): 'MALE' | 'FEMALE' | null {
    if (!text && !age) return null;

    const t = text.toLowerCase();

    // Прямые указания пола
    if (/женщин|әйел|ayel/i.test(t)) return 'FEMALE';
    if (/мужчин|еркек|erkek/i.test(t)) return 'MALE';

    // По возрасту
    if (age) {
      // Если возраст 20-29, скорее всего женщина (т.к. мужчины от 30)
      if (age >= 20 && age < 30) return 'FEMALE';
      // Если возраст 30+, может быть и мужчина и женщина
      // Смотрим на цену в тексте
      if (/7000|7\s*000|семь тысяч/i.test(t)) return 'MALE';
      if (/3990|3\s*990|три тысяч/i.test(t)) return 'FEMALE';
    }

    return null;
  }

  /**
   * Определяет город и является ли клиент жителем Актобе
   */
  extractCityAndResident(text: string): { city: string | null; isAktobe: boolean } {
    if (!text) return { city: null, isAktobe: false };

    const t = text.toLowerCase();

    // Актобе и область
    const aktobePatterns = [
      /актобе/i,
      /ақтөбе/i,
      /aktobe/i,
      /актюбинск/i,
      /хромтау/i,   // город в области
      /алга/i,       // город в области
      /кандыагаш/i,  // город в области
    ];

    for (const pattern of aktobePatterns) {
      if (pattern.test(t)) {
        const cityMatch = t.match(/(актобе|ақтөбе|aktobe|хромтау|алга|кандыагаш)/i);
        return {
          city: cityMatch ? cityMatch[1] : 'Актобе',
          isAktobe: true,
        };
      }
    }

    // Другие города
    const otherCities = [
      { pattern: /уральск/i, name: 'Уральск' },
      { pattern: /алматы/i, name: 'Алматы' },
      { pattern: /астана/i, name: 'Астана' },
      { pattern: /шымкент/i, name: 'Шымкент' },
      { pattern: /караганд/i, name: 'Караганда' },
      { pattern: /атырау/i, name: 'Атырау' },
    ];

    for (const { pattern, name } of otherCities) {
      if (pattern.test(t)) {
        return { city: name, isAktobe: false };
      }
    }

    return { city: null, isAktobe: false };
  }

  /**
   * Извлекает имя клиента из сообщений
   * Ищет после вопросов "Как Вас зовут?", "Ваше имя?"
   */
  extractName(messages: string[]): string | null {
    if (!messages || messages.length === 0) return null;

    // Ищем паттерн: вопрос оператора → ответ клиента
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i].toLowerCase();
      const nextMsg = messages[i + 1];

      // Вопросы оператора о имени
      if (
        /как.*зовут|как.*обращаться|ваше имя|атыңыз|есіміңіз/i.test(msg) &&
        nextMsg &&
        nextMsg.length > 0 &&
        nextMsg.length < 50  // Имя не должно быть слишком длинным
      ) {
        // Следующее сообщение должно быть коротким текстом (имя)
        const name = nextMsg.trim();
        // Проверяем что это похоже на имя (буквы, не URL, не номер)
        if (/^[а-яёa-zәіңғүұқөһ\s-]+$/i.test(name) && !/http|www|\d{5}/i.test(name)) {
          return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        }
      }
    }

    return null;
  }

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
