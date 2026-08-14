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

  /**
   * ГЛАВНАЯ ФУНКЦИЯ: обработка входящего сообщения и создание/обновление лида.
   * Принцип: НИКОГДА не терять лид.
   */
  async createLeadFromWebhook(input: WebhookLeadInput) {
    const { phone, senderName, messageText, messageId, whatsappAccountId, whatsappOwnerId } =
      input;

    this.logger.log(`📱 Processing: phone=${phone} text="${messageText.slice(0, 80)}"`);

    // ─────────────────────────────────────────────────
    // STEP 1: Find or Create Client (dedup by normalizedPhone)
    // ─────────────────────────────────────────────────
    let client = await this.prisma.client.findFirst({
      where: {
        OR: [{ normalizedPhone: phone }, { phone }],
      },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: {
          phone,
          normalizedPhone: phone,
          whatsappName: senderName || null,
        },
      });
      this.logger.log(`✅ New client created: ${phone}`);
    } else if (senderName && client.whatsappName !== senderName) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { whatsappName: senderName },
      });
    }

    // ─────────────────────────────────────────────────
    // STEP 2: Save Message (idempotent by messageId)
    // ─────────────────────────────────────────────────
    const _msgSaved = await this.prisma.message.upsert({
      where: { messageId },
      update: {},
      create: {
        messageId,
        clientId: client.id,
        message: messageText || '',
        direction: 'INCOMING',
        metadata: {
          instanceName: input.instanceName,
          whatsappAccountId,
          senderName,
        },
      },
    });

    // ─────────────────────────────────────────────────
    // STEP 2.5: Check for RECENT lead from same client (last 24h)
    // ПРАВИЛО: Если клиент писал недавно (менее 24ч назад) — ОБНОВЛЯЕМ существующий лид.
    // Если клиент пишет через несколько дней — создаём НОВЫЙ лид.
    // Активные статусы: NEW, ASSIGNED, CALLING, FOLLOW_UP
    // ─────────────────────────────────────────────────
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActiveLead = await this.prisma.lead.findFirst({
      where: {
        clientId: client.id,
        status: { in: ['NEW', 'ASSIGNED', 'CALLING', 'FOLLOW_UP'] },
        createdAt: { gte: oneDayAgo }, // только за последние 24ч
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentActiveLead) {
      this.logger.log(
        `♻️  Client ${phone} has recent active lead ${recentActiveLead.id} (${recentActiveLead.status}) — updating existing lead`,
      );

      // ═══════════════════════════════════════════════
      // КОНТЕКСТНЫЙ АНАЛИЗ: собираем ВСЕ сообщения за последние 24ч
      // ═══════════════════════════════════════════════
      const conversationMessages = await this.prisma.message.findMany({
        where: {
          clientId: client.id,
          createdAt: { gte: oneDayAgo },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Объединяем все сообщения в единый контекст
      const fullConversation = conversationMessages
        .map((m) => m.message)
        .join('\n') + '\n' + messageText;

      this.logger.debug(`📝 Full conversation context: ${conversationMessages.length + 1} messages`);

      // ─────────────────────────────────────────────────
      // СТАРЫЙ PARSER: анализируем ПОЛНЫЙ контекст диалога
      // Но НЕ ЗАМЕНЯЕМ то, что уже определено ранее
      // ─────────────────────────────────────────────────
      const contextPrice = this.extractPrice(fullConversation);
      const contextOffer = await this.matchOffer(fullConversation, contextPrice?.price);

      // НОВЫЙ СЛОЙ: определяем botResult из полного диалога
      const botResult = this.determineBotResult(fullConversation);

      const updateData: any = {
        // Всегда дополняем историю сообщений (не заменяем)
        originalMessage: recentActiveLead.originalMessage
          ? `${recentActiveLead.originalMessage}\n---\n${messageText}`
          : messageText,
        updatedAt: new Date(),
      };

      // ─────────────────────────────────────────────────
      // ПРАВИЛО: старый parser имеет ПРИОРИТЕТ
      // Обновляем процедуру/цену ТОЛЬКО если их ещё НЕТ
      // Например: "Озон капельница + БРТ" → 4990 уже определены → НЕ ТРОГАЕМ
      // ─────────────────────────────────────────────────
      if (contextOffer) {
        // Обновляем процедуру только если её ещё нет
        const hasProcedure =
          recentActiveLead.parsedProcedures &&
          recentActiveLead.parsedProcedures.length > 0;
        if (!hasProcedure) {
          updateData.parsedProcedures = contextOffer.procedures;
          updateData.offerId = contextOffer.offerId;
          this.logger.log(`📋 Procedure enriched: "${contextOffer.offerName}"`);
        }

        // Обновляем цену только если её ещё нет
        const hasPrice =
          recentActiveLead.parsedPrice && recentActiveLead.parsedPrice > 0;
        if (!hasPrice) {
          updateData.parsedPrice = contextOffer.price;
          updateData.parsedCurrency = 'KZT';
          this.logger.log(`💰 Price enriched: ${contextOffer.price} ₸`);
        }
      } else if (contextPrice && (!recentActiveLead.parsedPrice || recentActiveLead.parsedPrice === 0)) {
        // Если оффер не найден, но есть цена — сохраняем только цену
        updateData.parsedPrice = contextPrice.price;
        updateData.parsedCurrency = 'KZT';
        this.logger.log(`💰 Price-only enriched: ${contextPrice.price} ₸`);
      }

      // ─────────────────────────────────────────────────
      // НОВЫЙ СЛОЙ: обновляем botResult
      // IN_PROGRESS не перезаписывает BOOKED (если уже записался)
      // ─────────────────────────────────────────────────
      const prevResult = recentActiveLead.botResult;
      const shouldUpdateResult =
        botResult !== prevResult &&
        // Не деградируем: BOOKED → IN_PROGRESS не допускаем
        !(prevResult === 'BOOKED' && botResult === 'IN_PROGRESS');

      if (shouldUpdateResult) {
        updateData.botResult = botResult;
        updateData.botResultUpdatedAt = new Date();
        this.logger.log(`🎯 Bot result: ${prevResult ?? 'null'} → ${botResult}`);
      }

      await this.prisma.lead.update({
        where: { id: recentActiveLead.id },
        data: updateData,
      });

      this.logger.log(
        `✅ Lead ${recentActiveLead.id} updated | procedure=${contextOffer?.offerName ?? (recentActiveLead.parsedProcedures?.[0] ?? 'unchanged')} | price=${updateData.parsedPrice ?? recentActiveLead.parsedPrice ?? 'unchanged'} | result=${botResult}`,
      );

      return null; // Не создаём дубликат
    }

    // ─────────────────────────────────────────────────
    // STEP 3: Parse Price (deterministic, no AI)
    // ─────────────────────────────────────────────────
    const priceResult = this.extractPrice(messageText);

    // ─────────────────────────────────────────────────
    // STEP 4: Match Offer (scoring by keywords + price)
    // ─────────────────────────────────────────────────
    const offerMatch = await this.matchOffer(messageText, priceResult?.price);

    // ─────────────────────────────────────────────────
    // STEP 5: Determine Period (DAY / NIGHT) — Asia/Almaty
    // ─────────────────────────────────────────────────
    const period = this.determinePeriod();

    // ─────────────────────────────────────────────────
    // STEP 6: Determine Bot Result from message
    // ─────────────────────────────────────────────────
    const botResult = this.determineBotResult(messageText);

    // ─────────────────────────────────────────────────
    // STEP 7: Create Lead — ALWAYS (even if no procedure)
    // ─────────────────────────────────────────────────
    const lead = await this.prisma.lead.create({
      data: {
        clientId: client.id,
        whatsappAccountId: whatsappAccountId ?? undefined,
        whatsappOwnerId: whatsappOwnerId ?? undefined,
        originalMessage: messageText || '',
        parsedProcedures: offerMatch?.procedures ?? [],
        parsedPrice: offerMatch?.price ?? priceResult?.price ?? null,
        parsedCurrency: 'KZT',
        offerId: offerMatch?.offerId ?? undefined,
        status: 'NEW',          // Admin назначает оператора вручную
        source: 'WHATSAPP',
        period,
        botResult,
        botResultUpdatedAt: botResult ? new Date() : undefined,
      },
      include: {
        client: true,
        whatsappAccount: true,
        whatsappOwner: true,
        offer: true,
      },
    });

    this.logger.log(
      `✅ Lead created: ${lead.id} | procedure=${offerMatch?.offerName ?? 'UNKNOWN'} | price=${offerMatch?.price ?? priceResult?.price ?? 'NULL'} | result=${botResult ?? 'IN_PROGRESS'} | period=${period}`,
    );

    return lead;
  }

  // ═══════════════════════════════════════════════
  // PRICE EXTRACTOR (deterministic, no AI)
  // ═══════════════════════════════════════════════

  /**
   * Извлекает цену из текста.
   * Поддерживает: 3990 тг, 3990 ₸, 3990 тенге, 3 990 ₸, за 3990, и т.д.
   * Валюта ВСЕГДА KZT — игнорируем $ и другие символы.
   */
  extractPrice(text: string): PriceResult | null {
    if (!text) return null;

    const normalized = text.toLowerCase().replace(/\s+/g, ' ');

    // Паттерны цен (в порядке приоритета):
    const patterns: RegExp[] = [
      // 3990 тг / 3990тг / 3990 ₸ / 3990₸ / 3990 тенге / 3990 тнг
      /(\d[\d\s,]*\d|\d+)\s*(?:тг|₸|тенге|тнг|kzt)/i,
      // за 3990 / всего 3990 / цена 3990 / стоимость 3990
      /(?:за|всего|цена|стоимость|акция|акционная)\s+(\d[\d\s]*\d|\d+)/i,
      // 3 990 (число с пробелом внутри, 4-6 цифр всего)
      /\b(\d{1,3}\s\d{3})\b/,
      // Просто большое число 3990 / 7000 / 4990
      /\b([3-9]\d{3})\b/,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        // Берём первую захватывающую группу или весь матч
        const raw = (match[1] || match[0]).replace(/[\s,]/g, '');
        const price = parseInt(raw, 10);

        // Валидация: разумная цена (0 = бесплатно, до 1 000 000)
        if (!isNaN(price) && price >= 0 && price <= 1_000_000) {
          this.logger.debug(`💰 Price found: ${price} ₸ (pattern: ${pattern})`);
          return { price, currency: '₸' };
        }
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════
  // OFFER MATCHER (scoring system, no AI)
  // ═══════════════════════════════════════════════

  /**
   * Матчинг оффера по ключевым словам и цене.
   * Scoring:
   *   +50 — цена совпадает точно
   *   +10 — каждое совпавшее ключевое слово
   *   +20 — совпадение категории (мужчины/женщины)
   *   +5  — каждое слово из названия оффера найдено в тексте
   * Порог: score >= 10
   */
  async matchOffer(text: string, price?: number): Promise<OfferMatch | null> {
    if (!text && !price) return null;

    const normalized = this.normalizeText(text);

    const offers = await this.prisma.offer.findMany({
      where: { active: true },
    });

    if (offers.length === 0) {
      this.logger.warn('⚠️ No active offers in DB! Run: npx ts-node prisma/seed-offers.ts');
      return null;
    }

    let bestOffer: any = null;
    let bestScore = 0;

    for (const offer of offers) {
      let score = 0;

      // 1. Точное совпадение цены: +50
      if (price !== undefined && price !== null && offer.price === price) {
        score += 50;
      }

      // 2. Keyword matching: +10 per keyword
      const matchedKeywords = (offer.keywords as string[]).filter((kw) => {
        const kwNorm = kw.toLowerCase().trim();
        return kwNorm.length > 2 && normalized.includes(kwNorm);
      });
      score += matchedKeywords.length * 10;

      // 3. Category matching: +20
      if (offer.category) {
        const catNorm = (offer.category as string).toLowerCase();
        if (normalized.includes(catNorm)) {
          score += 20;
        }
      }

      // 4. Name words matching: +5 per word
      const nameWords = offer.name.toLowerCase().split(/[\s+,]+/).filter((w) => w.length > 3);
      const matchedNameWords = nameWords.filter((w) => normalized.includes(w));
      score += matchedNameWords.length * 5;

      if (score > bestScore) {
        bestScore = score;
        bestOffer = offer;
      }
    }

    const SCORE_THRESHOLD = 10;

    if (bestScore >= SCORE_THRESHOLD && bestOffer) {
      const procedures = this.splitProcedureName(bestOffer.name);
      this.logger.log(
        `✅ Offer matched: "${bestOffer.name}" score=${bestScore} price=${bestOffer.price}₸`,
      );
      return {
        offerId: bestOffer.id,
        offerName: bestOffer.name,
        price: bestOffer.price,
        procedures,
        score: bestScore,
      };
    }

    this.logger.log(`❌ No offer match (bestScore=${bestScore}) — lead will be UNKNOWN`);
    return null;
  }

  // ═══════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════

  /**
   * Нормализация текста: lowercase, удаление приветствий и лишних символов.
   * Русский + Казахский.
   */
  normalizeText(text: string): string {
    if (!text) return '';

    let t = text.toLowerCase().trim();

    // Удаляем приветствия (русские + казахские)
    const greetings = [
      'здравствуйте',
      'здравствуй',
      'добрый день',
      'добрый вечер',
      'доброе утро',
      'добрый утро',
      'привет',
      'хелло',
      'саламатсызба',
      'саламатсыздарба',
      'сәлеметсіз бе',
      'сәлеметсізбе',
      'сәлем',
      'салем',
      'ассалаумагалейкум',
      'ассаламуалейкум',
      'алейкумасалам',
      'алло',
      'хочу записаться',
      'хочу узнать',
      'можно узнать',
      'скажите пожалуйста',
      'заранее подготовленное сообщение',
      'отправьте автотекст',
    ];

    for (const g of greetings) {
      t = t.replace(new RegExp(g, 'gi'), ' ');
    }

    // Убираем лишние пробелы и спецсимволы
    t = t
      .replace(/[^\wа-яёА-ЯЁәіңғүұқөһӘІҢҒҮҰҚӨҺ\s₸+]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return t;
  }

  /**
   * Разбивает название оффера на отдельные процедуры
   * "Подтяжка лица + Чистка лица" → ["Подтяжка лица", "Чистка лица"]
   */
  splitProcedureName(offerName: string): string[] {
    return offerName
      .split('+')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Определяет период (DAY/NIGHT) по времени Asia/Almaty
   * NIGHT: 19:00 – 08:59
   * DAY:   09:00 – 18:59
   */
  determinePeriod(): 'DAY' | 'NIGHT' {
    const timezone = process.env.APP_TIMEZONE || 'Asia/Almaty';

    // Получаем текущий час в нужной таймзоне
    const now = new Date();
    const hourStr = now.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const hour = parseInt(hourStr, 10);

    if (hour >= 19 || hour < 9) {
      return 'NIGHT';
    }
    return 'DAY';
  }

  /**
   * Нормализация телефона:
   * +7 777 123 45 67 → +77771234567
   * 8 777 123 45 67  → +77771234567
   * 77771234567      → +77771234567
   */
  normalizePhone(raw: string): string {
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('8') && digits.length === 11) {
      digits = '7' + digits.slice(1);
    }
    if (digits.length === 10) {
      digits = '7' + digits;
    }
    return '+' + digits;
  }

  // ═══════════════════════════════════════════════
  // BOT RESULT DETECTOR (context-aware, no AI)
  // ═══════════════════════════════════════════════

  /**
   * Определяет результат диалога по ВСЕМУ контексту диалога.
   *
   * Принцип:
   *   1. Смотрим последнее сообщение БОТА — о чём он спросил?
   *   2. Смотрим ответ КЛИЕНТА — что он ответил?
   *   3. Короткий ответ ("иа", "барам") имеет смысл ТОЛЬКО в контексте вопроса бота.
   *
   * BOOKED  — явное подтверждение записи
   * LOST    — явный отказ
   * IN_PROGRESS — всё остальное
   *
   * Важно:
   *   "иа" в ответ на "запишем вас?" → BOOKED
   *   "иа" в ответ на "цена 7000?"   → IN_PROGRESS (подтверждение цены, не записи)
   *   "барам" без контекста записи   → IN_PROGRESS
   */
  determineBotResult(fullConversation: string): 'BOOKED' | 'IN_PROGRESS' | 'LOST' {
    if (!fullConversation || !fullConversation.trim()) return 'IN_PROGRESS';

    // Нормализуем: убираем ё→е, казахские буквы оставляем, lowercase
    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();

    const text = normalize(fullConversation);

    // Разбиваем диалог на строки
    const lines = text
      .split(/\n|---/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Последнее сообщение клиента (последняя строка)
    const lastLine = lines[lines.length - 1] || '';

    // Предпоследняя строка — скорее всего сообщение бота
    const prevLine = lines[lines.length - 2] || '';

    this.logger.debug(`🔍 lastLine: "${lastLine}" | prevLine: "${prevLine}"`);

    // ─────────────────────────────────────────────────
    // Определяем: бот спрашивал про ЗАПИСЬ?
    // (ертеңге жазайын ба? / записать вас? / жазайық па?)
    // ─────────────────────────────────────────────────
    const botAskedAboutBooking = this.botLineIsBookingQuestion(prevLine) ||
      this.conversationHasBookingQuestion(text);

    // ─────────────────────────────────────────────────
    // Определяем: бот спрашивал про ЦЕНУ/СТОИМОСТЬ?
    // (чтобы НЕ путать "иа" на вопрос о цене с BOOKED)
    // ─────────────────────────────────────────────────
    const botAskedAboutPrice = this.botLineIsPriceQuestion(prevLine);

    // ─────────────────────────────────────────────────
    // LOST: Явный отказ — проверяем первым
    // ─────────────────────────────────────────────────
    if (this.isLostResponse(lastLine, text)) {
      this.logger.debug(`❌ LOST detected`);
      return 'LOST';
    }

    // ─────────────────────────────────────────────────
    // BOOKED: Явное подтверждение записи
    // ─────────────────────────────────────────────────

    // A) Сильные фразы записи — BOOKED без контекста
    if (this.isStrongBookingPhrase(lastLine)) {
      this.logger.debug(`✅ BOOKED by strong phrase`);
      return 'BOOKED';
    }

    // B) Слабые согласия ("иа", "ок", "барам") — только если бот спрашивал про запись
    //    НО не если бот спрашивал про цену
    if (botAskedAboutBooking && !botAskedAboutPrice) {
      if (this.isWeakAgreement(lastLine)) {
        this.logger.debug(`✅ BOOKED by weak agreement in booking context`);
        return 'BOOKED';
      }
    }

    // C) Мягкое согласие + конкретная дата/время = BOOKED
    if (this.isSoftAgreement(lastLine) && this.hasDateTime(text)) {
      this.logger.debug(`✅ BOOKED by soft agreement + datetime`);
      return 'BOOKED';
    }

    // ─────────────────────────────────────────────────
    // IN_PROGRESS: всё остальное
    // ─────────────────────────────────────────────────
    this.logger.debug(`⏳ IN_PROGRESS`);
    return 'IN_PROGRESS';
  }

  // ─────────────────────────────────────────────────
  // HELPERS для determineBotResult
  // ─────────────────────────────────────────────────

  /** Бот в данной строке спрашивает про запись? */
  private botLineIsBookingQuestion(line: string): boolean {
    // Казахский: "жазайын ба?", "жазайық па?", "жазып қояйын ба?"
    // Русский: "записать вас?", "записываем?", "хотите записаться?"
    return /жазай[ыи]н\s*ба|жазай[ыи]қ\s*па|жазып\s*қояй[ыи]н|жазып\s*қо[йй]ай[ыи]н/.test(line) ||
      /запис[ауе]|записыва|хотите\s+записаться|записать\s+вас|записываем\s+вас/.test(line);
  }

  /** В диалоге ВООБЩЕ был вопрос про запись? */
  private conversationHasBookingQuestion(fullText: string): boolean {
    return /жазай[ыи]н\s*ба|жазай[ыи]қ\s*па|жазып\s*қояй[ыи]н/.test(fullText) ||
      /записат[ьь]\s+вас|хотите\s+записаться|записываем\s+вас|записать\s+на/.test(fullText);
  }

  /** Бот спрашивает про цену? */
  private botLineIsPriceQuestion(line: string): boolean {
    return /бағасы|бага|сколько\s+стоит|цена|стоимость|теңге|тenge|тг/.test(line);
  }

  /** Явный LOST ответ */
  private isLostResponse(lastLine: string, fullText: string): boolean {
    // Казахский — точные совпадения коротких слов
    const kzLostExact = [
      'жоқ', 'жок', 'бармаймын', 'бармайм', 'бармаим', 'бармай',
      'келмеймін', 'келмейм', 'келмим', 'керек емес', 'керек жоқ',
      'қымбат', 'қымбат екен', 'ойымнан қайттым', 'қаламаймын',
    ];
    for (const phrase of kzLostExact) {
      if (lastLine.includes(phrase)) return true;
    }

    // Русский — фразы отказа
    const ruLostPhrases = [
      'не буду', 'не хочу', 'не приду', 'не актуально', 'отказываюсь',
      'передумала', 'передумал', 'не интересно', 'не нужно', 'не надо',
      'спасибо не надо', 'спасибо, не надо', 'не подходит', 'мне не подходит',
      'запишусь в другом', 'в другом месте', 'дорого', 'слишком дорого',
      'дороговато', 'нет, дорого', 'это дорого', 'нет спасибо',
    ];
    for (const phrase of ruLostPhrases) {
      if (lastLine.includes(phrase) || fullText.includes(phrase)) return true;
    }

    return false;
  }

  /**
   * Сильные фразы записи — BOOKED независимо от контекста бота.
   * Клиент сам явно говорит "запишите меня", "записываюсь" и т.д.
   */
  private isStrongBookingPhrase(line: string): boolean {
    const strong = [
      // Русский
      'запишите меня', 'запишите на', 'записывайте', 'записываюсь',
      'я записываюсь', 'подтверждаю запись', 'приеду на', 'я приду',
      'приду в', 'приеду в', 'буду завтра', 'буду сегодня',
      // Казахский — явные фразы записи
      'жазып қойыңыз', 'жазып коюыныз', 'жазып койыныз', 'жазып қойыныз',
      'жазып алыңыз', 'жазылдым', 'жазып қой', 'жазып кой',
      'барамын', 'келемін',
      // Смешанный
      'иа, жазып', 'иә, жазып', 'да, жазып', 'да, запишите',
      'барамын, запишите', 'келемін, запишите',
    ];
    for (const phrase of strong) {
      if (line.includes(phrase)) return true;
    }
    return false;
  }

  /**
   * Слабые согласия — BOOKED только если бот спрашивал про запись.
   * "иа", "ок", "барам", "болады" и т.д.
   */
  private isWeakAgreement(line: string): boolean {
    // Казахский — короткие согласия
    const kzWeak = [
      'иа', 'иә', 'ия', 'иаа', 'ха',
      'барам', 'барамын', 'келем', 'келемін', 'келемн',
      'болады', 'бола берсін', 'жарайды', 'мақұл',
    ];
    // Русский/универсальный
    const ruWeak = ['ок', 'окей', 'ok', 'okay', 'хорошо', 'давайте', 'ладно'];

    const trimmed = line.trim();

    // Точное совпадение (короткий ответ)
    for (const w of [...kzWeak, ...ruWeak]) {
      if (trimmed === w || trimmed === w + ',' || trimmed.startsWith(w + ' ')) return true;
    }

    // "иа болады", "иа жарайды" и т.д.
    if (/^(иа|иә|ия)\s+(болады|жарайды|мақұл|барам|келем|ок)/.test(trimmed)) return true;

    return false;
  }

  /** Мягкое согласие (для комбинации с датой/временем) */
  private isSoftAgreement(line: string): boolean {
    return /\b(да|давайте|хорошо|ок|окей|ладно|подходит|согласна|согласен|мақұл|иә|болады|жарайды)\b/.test(line);
  }

  /** Есть ли в тексте конкретная дата или время? */
  private hasDateTime(text: string): boolean {
    return (
      // Казахский: ертең, ертен, бүгін, бугин + дни недели
      /\b(ертең|ертен|ертеңге|ертенге|бүгін|бугин|бугинге|жұма|сенбі|дүйсенбі|сейсенбі|сәрсенбі|бейсенбі)\b/.test(text) ||
      // Русский: завтра, сегодня + дни недели
      /\b(завтра|послезавтра|сегодня|понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)\b/.test(text) ||
      // Время: "в 16:00", "в 16", "4те", "4-те", "сағат 4", "16"
      /в\s+\d{1,2}(:\d{2})?/.test(text) ||
      /\b\d{1,2}(:\d{2})?\s*(те|де|да|та)\b/.test(text) ||
      /сағат\s+\d/.test(text) ||
      // Дата: "15 августа"
      /\b\d{1,2}[\s-](января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/.test(text)
    );
  }
}
