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
    // STEP 4: Find recent active lead (last 24h) → UPDATE or CREATE
    // ─────────────────────────────────────────────────
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLead = await this.prisma.lead.findFirst({
      where: {
        clientId: client.id,
        status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'FOLLOW_UP'] },
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentLead) {
      this.logger.log(`♻️  Updating lead ${recentLead.id} (${recentLead.status})`);

      // STEP 5: Load full conversation context (all messages last 24h)
      const allMessages = await this.prisma.message.findMany({
        where: { clientId: client.id, createdAt: { gte: oneDayAgo } },
        orderBy: { createdAt: 'asc' },
      });
      const fullConversation = allMessages.map((m) => m.message).join('\n') + '\n' + messageText;

      this.logger.debug(`📝 Context: ${allMessages.length + 1} messages`);

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
    // ─────────────────────────────────────────────────
    const priceResult  = this.extractPrice(messageText);
    const offerMatch   = await this.matchOffer(messageText, priceResult?.price);
    const parsedDate   = this.extractDate(messageText);
    const parsedTime   = this.extractTime(messageText);
    const result       = this.determineResult(messageText);
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
      `✅ Lead created: ${lead.id} | proc=${offerMatch?.offerName ?? 'UNKNOWN'} | price=${offerMatch?.price ?? priceResult?.price ?? 'NULL'} | date=${parsedDate ?? '—'} | time=${parsedTime ?? '—'} | result=${result ?? '—'}`,
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
   * Определяет итог диалога по INCOMING сообщениям клиента.
   *
   * BOOKED  — клиент явно подтвердил запись
   * LOST    — клиент явно отказался
   * UNKNOWN — недостаточно данных (клиент думает, уточняет)
   * null    — нет значимого контента для определения
   *
   * НЕ использует OUTGOING сообщения бота (бот в другом проекте).
   * Анализирует только то, что написал клиент.
   */
  determineResult(fullConversation: string): 'BOOKED' | 'LOST' | 'IN_PROGRESS' | null {
    if (!fullConversation?.trim()) return null;

    const text = fullConversation.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

    // Берём последнюю строку клиента
    const lines = text.split(/\n|---/).map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1] ?? '';

    // ── 1. BOOKED: сильные явные фразы записи ─────────────────────
    const BOOKED_STRONG = [
      // Казахский
      'жазып қойыңыз', 'жазып коюыныз', 'жазып койыныз', 'жазып қойыныз',
      'жазып алыңыз', 'жазып алыныз', 'жазылдым',
      'жазып қой', 'жазып кой',
      'барамын, жаз', 'келемін, жаз',
      'иа, жазып', 'иә, жазып', 'да, жазып', 'ия, жазып',
      // Русский
      'запишите меня', 'запишите на', 'записывайте', 'записываюсь',
      'я записываюсь', 'подтверждаю запись',
      'приеду на', 'я приду', 'буду завтра', 'буду сегодня',
      'да, записывайте', 'да, запишите', 'барамын, запишите', 'келемін, запишите',
    ];
    for (const p of BOOKED_STRONG) {
      if (lastLine.includes(p) || text.includes(p)) {
        this.logger.log(`✅ BOOKED | strong phrase: "${p}"`);
        return 'BOOKED';
      }
    }

    // ── 2. LOST: явный отказ ──────────────────────────────────────
    const LOST_PHRASES = [
      // Казахский
      'жоқ', 'жок',
      'бармаймын', 'бармайм', 'бармаим', 'бармай',
      'келмеймін', 'келмейм', 'келмим',
      'керек емес', 'керек жоқ', 'керек жок',
      'қымбат', 'қымбат екен', 'кымбат',
      'ойымнан қайттым', 'қаламаймын',
      'жоқ, керек емес',
      // Русский
      'не буду', 'не хочу', 'не приду', 'не актуально', 'отказываюсь',
      'передумала', 'передумал', 'не интересно', 'не нужно', 'не надо',
      'спасибо не надо', 'спасибо, не надо', 'не подходит', 'мне не подходит',
      'запишусь в другом', 'дорого', 'слишком дорого', 'дороговато',
      'нет, дорого', 'это дорого', 'нет спасибо',
    ];
    for (const p of LOST_PHRASES) {
      if (lastLine.includes(p)) {
        this.logger.log(`❌ LOST | refusal: "${p}"`);
        return 'LOST';
      }
    }

    // ── 3. IN_PROGRESS: клиент думает / уточняет ─────────────────
    const INPROG_PHRASES = [
      // Казахский
      'ойланам', 'ойланайын', 'ойланып алайын',
      'кейін айтам', 'кейін жазам', 'кейин айтам', 'кейін',
      'білмеймін', 'білмим', 'ақылдасам', 'ақылдасып алайын',
      // Русский
      'я подумаю', 'подумаю', 'надо подумать',
      'позже', 'потом', 'позже скажу',
      'ещё не знаю',
    ];
    for (const p of INPROG_PHRASES) {
      if (lastLine.includes(p)) {
        this.logger.log(`⏳ IN_PROGRESS | thinking: "${p}"`);
        return 'IN_PROGRESS';
      }
    }

    // ── 4. Если диалог есть, но ничего явного → null (не угадываем) ─
    return null;
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
