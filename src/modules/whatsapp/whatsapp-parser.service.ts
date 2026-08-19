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
        status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'FOLLOW_UP'] },
        // ❌ REMOVED: createdAt: { gte: oneDayAgo } — теперь проверяем ВСЕ активные лиды
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

      this.logger.debug(`📝 Context: ${allMessages.length} messages`);

      // STEP 6: OLD PARSER — procedure + price (приоритет над новыми данными)
      const ctxOffer = await this.matchOffer(fullConversation, this.extractPrice(fullConversation)?.price);
      const ctxPrice = this.extractPrice(fullConversation);

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

    // Загружаем все сообщения клиента за 24ч (включая текущее)
    const prevMessages = await this.prisma.message.findMany({
      where: { clientId: client.id, createdAt: { gte: oneDayAgo } },
      orderBy: { createdAt: 'asc' },
    });
    const fullContext = prevMessages.map((m) => m.message).join('\n');

    const priceResult  = this.extractPrice(fullContext);
    const offerMatch   = await this.matchOffer(fullContext, priceResult?.price);
    const parsedDate   = this.extractDate(fullContext);
    const parsedTime   = this.extractTime(fullContext);
    const result       = this.determineResult(fullContext);
    const period       = this.determinePeriod();

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

    // "15 августа" / "15 авг" и т.д.
    const months: Record<string, number> = {
      'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4,
      'май': 5,   'мая': 5,   'июн': 6,  'июл': 7,
      'август': 8,'сентябр': 9,'октябр': 10,'ноябр': 11,'декабр': 12,
    };
    for (const [name, month] of Object.entries(months)) {
      const re = new RegExp(`(\\d{1,2})\\s*(?:${name})`, 'i');
      const m = t.match(re);
      if (m) {
        const day = parseInt(m[1], 10);
        const year = todayDate.getFullYear();
        const d = new Date(year, month - 1, day);
        if (d < todayDate) d.setFullYear(year + 1);
        return d.toISOString().split('T')[0];
      }
    }

    return null;
  }

  /**
   * TIME EXTRACTOR — отдельный метод для parsedTime.
   * Возвращает "HH:MM" или null.
   * НЕ смешивается с ценой (цена 3990 не попадёт сюда).
   */
  extractTime(text: string): string | null {
    if (!text) return null;
    const t = text.toLowerCase().replace(/ё/g, 'е');

    // Формат "16:00" / "09:30"
    const exactMatch = t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (exactMatch) {
      const h = parseInt(exactMatch[1], 10);
      const m = parseInt(exactMatch[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    // "в 16" / "в 9" — только если явно "в X" и X ≤ 23
    const inTimeMatch = t.match(/(^|\s)в\s+(\d{1,2})(\s|$)/);
    if (inTimeMatch) {
      const h = parseInt(inTimeMatch[2], 10);
      if (h >= 6 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    // "сағат 16" / "сағат 4"
    const sagatMatch = t.match(/сағат\s+(\d{1,2})/);
    if (sagatMatch) {
      const h = parseInt(sagatMatch[1], 10);
      if (h >= 1 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    // "4-те" / "4те" / "төртте" — казахские суффиксы времени
    // Паттерн: цифра + опциональный дефис + казахский падежный суффикс
    const kzTimeMatch = t.match(/(\d{1,2})-?(?:те|де|да|та)(?!\w)/);
    if (kzTimeMatch) {
      const h = parseInt(kzTimeMatch[1], 10);
      // Только разумное время (не путаем с ценой типа 3990)
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
    // ── 2.1. LOST в последнем сообщении (ВЫСШИЙ ПРИОРИТЕТ) ──────────────────
    // ВАЖНО: Избегаем false positives типа "мне подходит" → "не подходит"
    
    // Сначала проверяем явные отказы БЕЗ риска substring collision
    const LOST_PHRASES_SAFE = [
      // КАЗАХСКИЙ
      'бармаймын', 'бармайм', 'бармаим',
      'келмеймін', 'келмейм', 'келмим',
      'керек емес', 'керек жоқ', 'керек жок',
      'қымбат екен', 'кымбат екен',
      'ойымнан қайттым', 'ойымнан кайттым',
      'қаламаймын', 'каламаймын',
      'жоқ, керек емес', 'жок, керек емес',
      // РУССКИЙ (без риска substring collision)
      'не буду', 'не хочу', 'не приду', 'не актуально',
      'отказываюсь', 'передумала', 'передумал',
      'не интересно', 'не нужно', 'не надо',
      'спасибо не надо', 'спасибо, не надо',
      'запишусь в другом', 'слишком дорого', 'дороговато',
      'нет, дорого', 'это дорого', 'нет спасибо',
      'дорого',
    ];

    for (const p of LOST_PHRASES_SAFE) {
      if (lastMessage.includes(p)) {
        this.logger.log(`❌ LOST | refusal in last message: "${p}"`);
        return 'LOST';
      }
    }

    // Проверяем "не подходит" с word boundary (избегаем "мне подходит")
    if (/\bне\s+подходит/.test(lastMessage) || lastMessage.startsWith('не подходит')) {
      this.logger.log(`❌ LOST | refusal: "не подходит"`);
      return 'LOST';
    }
    
    if (/\bмне\s+не\s+подходит/.test(lastMessage)) {
      this.logger.log(`❌ LOST | refusal: "мне не подходит"`);
      return 'LOST';
    }

    // Короткие KZ слова отказа — только если lastMessage именно это слово
    const kzShortLost = ['жоқ', 'жок', 'қымбат', 'кымбат'];
    for (const p of kzShortLost) {
      const cleaned = lastMessage.replace(/[.,!?]/g, '').trim();
      if (cleaned === p || cleaned.startsWith(p + ' ') || cleaned.endsWith(' ' + p)) {
        this.logger.log(`❌ LOST | short KZ refusal: "${p}"`);
        return 'LOST';
      }
    }

    // ── 2.2. UNKNOWN в последнем сообщении ───────────────────────────────────
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
    ];

    for (const p of UNKNOWN_PHRASES) {
      if (lastMessage.includes(p)) {
        this.logger.log(`⏳ UNKNOWN | thinking in last message: "${p}"`);
        return 'UNKNOWN';
      }
    }

    // ── 2.3. BOOKED в последнем сообщении ────────────────────────────────────
    const BOOKED_PHRASES = [
      // ══════════════════════════════════════════════════
      // КАЗАХСКИЙ — ХОЧУ ЗАПИСАТЬСЯ
      // ══════════════════════════════════════════════════
      'жазылғым келеді', 'жазылгым келеді', 'жазылғым келед', 'жазылгым келед',
      'жазылғым келіп тұр', 'жазылгым келіп тур', 'жазылгым келип тур',
      'жазылуға келдім', 'жазылуга келдим',
      'жазылып алайын', 'жазылып алайыншы',
      'жазылып қояйын', 'жазылып кояйын',
      'жазып қояйын', 'жазып кояйын', // Краткая форма

      // ══════════════════════════════════════════════════
      // ЖАЗЫП ҚОЮ — ВАРИАНТЫ
      // ══════════════════════════════════════════════════
      'жазып қойыңыз', 'жазып койыңыз', 'жазып қойыныз', 'жазып коюыныз',
      'жазып қой', 'жазып кой',
      'жазып қоя беріңіз', 'жазып коя бериниз', 'жазып қоя бериниз',
      'жаза беріңіз', 'жаза бериниз',
      'жазып қойыңызшы', 'жазып койыңызшы',
      'жазып алыңыз', 'жазып алыныз',
      'жазып беріңіз', 'жазып бериниз', 'жазып беріңізші',
      'жаза бер',
      'жазылдым',
      'мені жазып қойыңыз', 'мени жазып койыныз',
      'жазып қоя аласыз ба', 'жазып коя аласыз ба',

      // ══════════════════════════════════════════════════
      // ДАТА + ЗАПИСЬ
      // ══════════════════════════════════════════════════
      'ертеңге жаза беріңіз', 'ертенге жаза бериниз',
      'ертеңге жазып қойыңыз', 'ертенге жазып койыныз',
      'ертеңге жазып қой', 'ертенге жазып кой',
      'бүгінге жазып қойыңыз', 'бугинге жазып койыныз',
      'сол күнге жазып қойыңыз', 'сол кунге жазып койыныз',

      // ══════════════════════════════════════════════════
      // ВРЕМЯ + ЗАПИСЬ (частичные паттерны)
      // ══════════════════════════════════════════════════
      'ге жазып қойыңыз', 'ге жазып койыныз',
      'ке жазып қой', 'ке жазып кой',

      // ══════════════════════════════════════════════════
      // ПОДТВЕРЖДЕНИЕ С КОНТЕКСТОМ
      // ══════════════════════════════════════════════════
      'барамын, жаз', 'келемін, жаз',
      'иа, жазып', 'иә, жазып', 'да, жазып', 'ия, жазып',
      'барамын, запишите', 'келемін, запишите',

      // ══════════════════════════════════════════════════
      // РУССКИЙ — ХОЧУ ЗАПИСАТЬСЯ
      // ══════════════════════════════════════════════════
      'хочу записаться', 'хочу записаться на', 'хочу записаться к',
      'хочу записаться завтра', 'хочу записаться сегодня',
      'хочу записаться к вам', 'хочу записаться на процедуру',
      'хочу записаться на приём', 'хочу записаться на прием',

      // ══════════════════════════════════════════════════
      // РУССКИЙ — ЗАПИШИТЕ (EXPLICIT)
      // ══════════════════════════════════════════════════
      'запишите меня', 'запишите на', 'записывайте', 'записываюсь',
      'я записываюсь', 'подтверждаю запись',
      'да, записывайте', 'да, запишите',
      'можно меня записать', // EXPLICIT: "можно МЕНЯ записать" = подтверждение
      'запишите пожалуйста', 'запишите, пожалуйста',

      // ══════════════════════════════════════════════════
      // РУССКИЙ — ПРИДУ
      // ══════════════════════════════════════════════════
      'приеду на', 'я приду', 'буду завтра', 'буду сегодня',
    ];

    // Сначала проверяем BOOKED в lastMessage (последнее сообщение = приоритет)
    for (const p of BOOKED_PHRASES) {
      if (lastMessage.includes(p)) {
        this.logger.log(`✅ BOOKED | phrase in last message: "${p}"`);
        return 'BOOKED';
      }
    }

    // Проверяем специфические паттерны времени в lastMessage: "сағат 4-ке жазып қой"
    const timeBookingPatterns = [
      /сағат\s+\d+[:\-]?\d*\s*(ке|ге)\s*(жаз|жазып)/i,
      /\d+[:\-]\d+\s*(ке|ге)\s*(жаз|жазып)/i,
    ];
    for (const pattern of timeBookingPatterns) {
      if (lastMessage.match(pattern)) {
        this.logger.log(`✅ BOOKED | time+booking pattern in last message`);
        return 'BOOKED';
      }
    }

    // ── 2.4. EDGE CASE: Короткий ответ ПОСЛЕ отказа в предпоследнем ─────────
    // Scenario:
    //   Message 1: "Хочу записаться"
    //   Message 2: "не успею"  ← явный отказ
    //   Message 3: "иа"        ← короткий ответ (прощание, не подтверждение!)
    //
    // Без этой проверки: lastMessage="иа" → BOOKED (ошибка!)
    // С этой проверкой: secondLast="не успею" (отказ) + last="иа" → LOST
    
    const SHORT_ANSWERS = ['иа', 'ия', 'ок', 'ok', 'жақсы', 'жаксы'];
    const lastTrimmed = lastMessage.replace(/[.,!?]/g, '').trim();
    
    if (SHORT_ANSWERS.includes(lastTrimmed) && rawLines.length >= 2) {
      // Получаем ПРЕДПОСЛЕДНЕЕ сообщение
      const secondLastRawLine = rawLines[rawLines.length - 2] ?? '';
      const secondLastMessage = normalizeResultText(secondLastRawLine);
      
      // Проверяем: предпоследнее = явный отказ?
      const REFUSAL_PHRASES = [
        'дорого', 'не буду', 'не успею', 'не хочу', 'передумала', 'передумал',
        'не надо', 'не нужно', 'нет спасибо',
        'бармайм', 'келмейм', 'керек емес', 'қымбат', 'кымбат', 'улгермеймин',
      ];
      
      let hasRefusalInSecondLast = false;
      for (const p of REFUSAL_PHRASES) {
        if (secondLastMessage.includes(p)) {
          hasRefusalInSecondLast = true;
          break;
        }
      }
      
      // Проверяем "жоқ"/"жок" как одиночное слово в предпоследнем
      const secondLastTrimmed = secondLastMessage.replace(/[.,!?]/g, '').trim();
      if (secondLastTrimmed === 'жоқ' || secondLastTrimmed === 'жок') {
        hasRefusalInSecondLast = true;
      }
      
      if (hasRefusalInSecondLast) {
        this.logger.log(`❌ LOST | short answer "${lastTrimmed}" after refusal in second-last message`);
        return 'LOST';
      }
    }

    // ── 2.5. Была попытка, но lastMessage нейтральное → BOOKED (по умолчанию) ──
    // Клиент пытался записаться, lastMessage не содержит явного LOST/UNKNOWN/BOOKED
    // → Считаем контакт установленным, оператор должен работать с ним
    this.logger.log(`✅ BOOKED | booking intent found, no explicit refusal/delay in last message`);
    return 'BOOKED';
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
