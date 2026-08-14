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
      // CONTEXT LAYER: анализируем диалог с direction
      // Собираем сообщения с direction INCOMING/OUTGOING
      // ═══════════════════════════════════════════════
      const conversationMessages = await this.prisma.message.findMany({
        where: {
          clientId: client.id,
          createdAt: { gte: oneDayAgo },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Объединяем все INCOMING сообщения в единый контекст для старого parser
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

      // ─────────────────────────────────────────────────
      // НОВЫЙ СЛОЙ: определяем botResult через direction-based анализ
      // Передаём Messages с direction для понимания кто что написал
      // ─────────────────────────────────────────────────
      const botResult = this.determineBotResult(fullConversation, conversationMessages, messageText);

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
    // STEP 6: Determine Bot Result from message (новый лид — только из текущего сообщения)
    // ─────────────────────────────────────────────────
    const botResult = this.determineBotResult(messageText, [], messageText);

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
  // PUBLIC HELPERS (используются из webhook controller)
  // ═══════════════════════════════════════════════

  /** Найти клиента по нормализованному телефону */
  async findClientByPhone(phone: string) {
    return this.prisma.client.findFirst({
      where: { OR: [{ normalizedPhone: phone }, { phone }] },
    });
  }

  /** Сохранить OUTGOING сообщение бота для контекстного анализа */
  async saveOutgoingMessage(input: {
    clientId: string;
    messageId: string;
    messageText: string;
    instanceName: string;
  }) {
    await this.prisma.message.upsert({
      where: { messageId: input.messageId },
      update: {},
      create: {
        messageId: input.messageId,
        clientId: input.clientId,
        message: input.messageText,
        direction: 'OUTGOING',
        metadata: { instanceName: input.instanceName },
      },
    });
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
  // CONTEXT + INTENT LAYER (rule-based, no AI)
  // ═══════════════════════════════════════════════

  /**
   * Определяет тип сообщения бота (intent).
   *
   * BOOKING_REQUEST   — бот спрашивает о записи
   * PRICE_QUESTION    — бот уточняет цену
   * DATE_QUESTION     — бот спрашивает удобную дату
   * TIME_QUESTION     — бот спрашивает удобное время
   * GENERAL_INFO      — информационное сообщение, не вопрос
   * UNKNOWN           — не определено
   */
  private detectBotIntent(
    botMessage: string,
  ): 'BOOKING_REQUEST' | 'PRICE_QUESTION' | 'DATE_QUESTION' | 'TIME_QUESTION' | 'GENERAL_INFO' | 'UNKNOWN' {
    const t = botMessage.toLowerCase().replace(/ё/g, 'е');

    // ─────────────────────────────────────────────
    // BOOKING_REQUEST patterns (KZ)
    // Правило: слово записи + вопрос/призыв
    // ─────────────────────────────────────────────
    const BOOKING_KZ = [
      // жазайын ба? / жазайық па?
      /жазай[ыи]н\s*(ба|бе)\??/,
      /жазай[ыи]қ\s*(па|пе)\??/,
      // жазып қояйын ба? / жазып қоямыз ба?
      /жазып\s*қояй[ыи]н\s*(ба|бе)\??/,
      /жазып\s*қоям[ыы]з\s*(ба|бе)\??/,
      /жазып\s*қоя[ыи]н/,
      // жазылуға болады ма? / жазыласыз ба?
      /жазылу[ғг]а\s*болады\s*(ма|ме)\??/,
      /жазылас[ыи]з\s*(ба|бе)\??/,
      /жазылам[ыы]з\s*(ба|бе)\??/,
      // белгілейін бе? / белгілеп қояйын ба?
      /белгілей[іи]н\s*(бе|ба)\??/,
      /белгілеп\s*қояй[ыи]н\s*(ба|бе)\??/,
      /белгілеп\s*қоя[ыи]н/,
      // сізді жазайын / сізді ертеңге белгілейін
      /сізді?\s*(жазай[ыи]н|жазып|белгілей[іи]н)/,
      // қай күнге жазайық? / қай уақытқа жазайық?
      /қай\s+(күн[ге]*|уақыт[қа]*)\s*жазай[ыи]қ/,
      // осы уақытқа жазайық па?
      /осы\s+уақыт[қа]*\s*жазай[ыи]қ/,
      // жаза аламыз ба? / жазып бере аламыз ба?
      /жаза\s*ала[мы]+з\s*(ба|бе)\??/,
      // ыңғайлы уақытқа жазайық?
      /[ыіі]ңғайлы\s+уақыт[қа]*\s*жазай[ыи]қ/,
      // жазылғыңыз келе ме?
      /жазылғ[ыіі]ңыз\s*келе\s*(ме|ма)\??/,
    ];

    // ─────────────────────────────────────────────
    // BOOKING_REQUEST patterns (RU)
    // ─────────────────────────────────────────────
    const BOOKING_RU = [
      // записать вас / вас записать
      /записать\s+вас/,
      /вас\s+записать/,
      /запишем\s+вас/,
      /вас\s+запишем/,
      /записываем\s+вас/,
      /вас\s+записываем/,
      // могу вас записать / можно вас записать
      /мо[гж][уы]\s+вас\s+записать/,
      /можно\s+вас\s+записать/,
      // хотите записаться / хотите оформить запись
      /хотите\s+записаться/,
      /хотите\s+оформить\s+запись/,
      // оформить запись / оформим запись
      /оформить\s+запись/,
      /оформим\s+запись/,
      /оформляем\s+запись/,
      // забронировать вам время
      /забронировать\s+вам\s+врем/,
      /забронировать\s+время/,
      // записать на + (завтра/время/процедуру/прием)
      /записать\s+на\s+(завтра|сегодня|прием|процедур|\d)/,
      /записать\s+на\s+какое/,
      // на какое время вас записать / когда вас записать
      /на\s+какое\s+время\s+вас\s+записать/,
      /на\s+какой\s+день\s+вас\s+записать/,
      /когда\s+вас\s+записать/,
      /вас\s+на\s+завтра\s+записать/,
      // подобрать время для записи
      /подобрать\s+время\s+для\s+записи/,
      // записаться к нам / записаться на процедуру
      /записаться\s+(к\s+нам|на\s+процедур|на\s+прием)/,
      // подтвердить запись
      /подтвердить\s+запись/,
    ];

    for (const re of BOOKING_KZ) {
      if (re.test(t)) return 'BOOKING_REQUEST';
    }
    for (const re of BOOKING_RU) {
      if (re.test(t)) return 'BOOKING_REQUEST';
    }

    // ─────────────────────────────────────────────
    // PRICE_QUESTION patterns (KZ + RU)
    // Правило: ценовое слово + вопрос или явная цена
    // ─────────────────────────────────────────────
    const PRICE_KZ = [
      /бағасы\s*\d/,                         // "Бағасы 7000"
      /бағасы\s*(қандай|қанша|неше|ма|ме)\?/, // "Бағасы қандай?"
      /қанша\s+тұрады\??/,                    // "Қанша тұрады?"
      /баға\s+туралы/,                        // "Баға туралы"
      /\d+\s*(теңге|тнг|тг)\s*(ма|ме|па|ба)\?/, // "7000 теңге ме?"
    ];
    const PRICE_RU = [
      /цена\s*\d/,                            // "Цена 7000"
      /стоимость\s*\d/,                       // "Стоимость 7000"
      /сколько\s+стоит\??/,                   // "Сколько стоит?"
      /стоит\s+\d/,                           // "Стоит 7000"
      /цена\s+(составляет|акции|акционная)/,  // "Цена акции"
      /акцион[нн]ая\s+цена/,
      /специальная\s+цена/,
      /\d+\s*(тенге|тг|₸)\s*(ма|ме)?\??/,    // "7000 тг?"
      /(цена|стоимость).{0,20}\?/,            // "Цена ... ?"
    ];

    for (const re of PRICE_KZ) {
      if (re.test(t)) return 'PRICE_QUESTION';
    }
    for (const re of PRICE_RU) {
      if (re.test(t)) return 'PRICE_QUESTION';
    }

    // ─────────────────────────────────────────────
    // DATE_QUESTION (без контекста записи)
    // ─────────────────────────────────────────────
    if (
      /қай\s+(күн|күні)[^ге]*\??/.test(t) ||
      /қашан\s+(келесіз|барасыз|ыңғайлы)\??/.test(t) ||
      /қандай\s+күн\??/.test(t) ||
      /какой\s+день/.test(t) ||
      /когда\s+вам\s+удобно/.test(t) ||
      /удобн[аы][ей]?\s+дат/.test(t) ||
      /на\s+какой\s+день\??/.test(t) ||
      /на\s+какое\s+число\??/.test(t) ||
      /выберите\s+дату/.test(t)
    ) {
      return 'DATE_QUESTION';
    }

    // ─────────────────────────────────────────────
    // TIME_QUESTION (без контекста записи)
    // ─────────────────────────────────────────────
    if (
      /қай\s+уақыт[^қа]/.test(t) ||
      /сағат\s+неше\??/.test(t) ||
      /қай\s+сағат\??/.test(t) ||
      /уақыты\s+ыңғайлы\??/.test(t) ||
      /какое\s+время\s+вам/.test(t) ||
      /удобн[аы][ей]?\s+врем/.test(t) ||
      /во\s+сколько\??/.test(t) ||
      /в\s+котором\s+часу\??/.test(t) ||
      /выберите\s+время/.test(t)
    ) {
      return 'TIME_QUESTION';
    }

    if (t.length > 0) return 'GENERAL_INFO';
    return 'UNKNOWN';
  }

  /**
   * ГЛАВНАЯ ФУНКЦИЯ определения botResult.
   *
   * Использует:
   *   1. Messages с direction (OUTGOING = бот, INCOMING = клиент)
   *   2. Intent последнего сообщения бота
   *   3. Ответ клиента в этом контексте
   *   4. Весь диалог для сильных фраз
   *
   * Принцип:
   *   "иа" + бот спрашивал о записи   → BOOKED
   *   "иа" + бот спрашивал о цене     → IN_PROGRESS
   *   "барам" + бот спрашивал о записи → BOOKED
   *   "барам" + другой контекст        → IN_PROGRESS
   */
  determineBotResult(
    fullConversation: string,
    messages: Array<{ message: string; direction: string }>,
    lastClientMessage: string,
  ): 'BOOKED' | 'IN_PROGRESS' | 'LOST' {
    const norm = (s: string) =>
      s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

    const lastMsg = norm(lastClientMessage);

    // ─────────────────────────────────────────────────
    // 1. Сильные фразы записи — BOOKED без context
    //    Клиент САМИ явно говорит "запишите меня"
    // ─────────────────────────────────────────────────
    if (this.isStrongBookingPhrase(lastMsg)) {
      this.logger.log(`✅ BOOKED | strong_booking_phrase | "${lastMsg}"`);
      return 'BOOKED';
    }

    // ─────────────────────────────────────────────────
    // 2. Явный отказ — LOST
    // ─────────────────────────────────────────────────
    if (this.isLostResponse(lastMsg)) {
      this.logger.log(`❌ LOST | explicit_refusal | "${lastMsg}"`);
      return 'LOST';
    }

    // ─────────────────────────────────────────────────
    // 3. Явный IN_PROGRESS — клиент думает/откладывает
    // ─────────────────────────────────────────────────
    if (this.isInProgressResponse(lastMsg)) {
      this.logger.log(`⏳ IN_PROGRESS | thinking_response | "${lastMsg}"`);
      return 'IN_PROGRESS';
    }

    // ─────────────────────────────────────────────────
    // 4. Intent-based анализ:
    //    Находим последнее OUTGOING сообщение (бота)
    //    Определяем его intent
    //    Интерпретируем ответ клиента в этом контексте
    // ─────────────────────────────────────────────────
    if (messages.length > 0) {
      // Ищем последнее OUTGOING сообщение перед текущим ответом клиента
      const outgoingMessages = messages.filter((m) => m.direction === 'OUTGOING');
      const lastBotMessage = outgoingMessages[outgoingMessages.length - 1]?.message ?? '';

      if (lastBotMessage) {
        const intent = this.detectBotIntent(lastBotMessage);

        this.logger.log(
          `🔍 Intent: ${intent} | botMsg: "${lastBotMessage.slice(0, 60)}" | clientReply: "${lastMsg}"`,
        );

        if (intent === 'BOOKING_REQUEST') {
          // Бот спрашивал о записи
          if (this.isWeakAgreement(lastMsg)) {
            this.logger.log(`✅ BOOKED | weak_agreement + BOOKING_REQUEST | "${lastMsg}"`);
            return 'BOOKED';
          }
          // Клиент назвал дату/время в ответ на вопрос о записи → BOOKED
          if (this.hasDateTime(lastMsg)) {
            this.logger.log(`✅ BOOKED | datetime_reply + BOOKING_REQUEST | "${lastMsg}"`);
            return 'BOOKED';
          }
        }

        if (intent === 'PRICE_QUESTION') {
          // "иа" в ответ на вопрос о цене → НЕ BOOKED
          if (this.isWeakAgreement(lastMsg)) {
            this.logger.log(`⏳ IN_PROGRESS | weak_agreement + PRICE_QUESTION | "${lastMsg}"`);
            return 'IN_PROGRESS';
          }
        }

        if (intent === 'DATE_QUESTION' || intent === 'TIME_QUESTION') {
          // Клиент назвал дату/время в ответ на соответствующий вопрос
          if (this.hasDateTime(lastMsg) || lastMsg.match(/\d/)) {
            this.logger.log(`⏳ IN_PROGRESS | date_or_time_reply | "${lastMsg}" — ждём финального подтверждения`);
            return 'IN_PROGRESS';
          }
        }
      }
    }

    // ─────────────────────────────────────────────────
    // 5. Fallback: смягчённое согласие + datetime в ПОЛНОМ диалоге
    // ─────────────────────────────────────────────────
    const fullText = norm(fullConversation);
    if (this.isSoftAgreement(lastMsg) && this.hasDateTime(fullText)) {
      this.logger.log(`✅ BOOKED | soft_agreement + datetime_in_context | "${lastMsg}"`);
      return 'BOOKED';
    }

    // ─────────────────────────────────────────────────
    // 6. По умолчанию — IN_PROGRESS
    // ─────────────────────────────────────────────────
    this.logger.log(`⏳ IN_PROGRESS | default | "${lastMsg}"`);
    return 'IN_PROGRESS';
  }

  // ─────────────────────────────────────────────────
  // PATTERN HELPERS
  // ─────────────────────────────────────────────────

  /**
   * Сильные фразы записи — BOOKED независимо от контекста.
   * Клиент явно говорит "запишите меня", "записываюсь" и т.д.
   */
  private isStrongBookingPhrase(line: string): boolean {
    const phrases = [
      // Казахский — явные фразы записи
      'жазып қойыңыз', 'жазып коюыныз', 'жазып койыныз', 'жазып қойыныз',
      'жазып алыңыз',  'жазып алыныз',  'жазылдым',
      'жазып қой',     'жазып кой',
      // Казахский — "барамын/келемін" только как самостоятельное подтверждение
      'барамын, жаз',  'келемін, жаз',  'барамын жаз',
      // Смешанный
      'иа, жазып', 'иә, жазып', 'да, жазып', 'ия, жазып',
      'да, запишите', 'барамын, запишите', 'келемін, запишите',
      // Русский
      'запишите меня',  'запишите на',    'записывайте',
      'записываюсь',    'я записываюсь',  'подтверждаю запись',
      'приеду на',      'я приду',        'приду в',
      'приеду в',       'буду завтра',    'буду сегодня',
    ];
    for (const p of phrases) {
      if (line.includes(p)) return true;
    }
    return false;
  }

  /**
   * Слабые согласия — BOOKED только если бот спрашивал о записи (BOOKING_REQUEST).
   * "иа", "ок", "барам", "болады" и т.д.
   */
  private isWeakAgreement(line: string): boolean {
    const trimmed = line.trim().replace(/[,.!?]$/, '');

    // Точные короткие ответы (казахский + русский + смешанный)
    const exactMatches = [
      'иа', 'иә', 'ия', 'иаа', 'ха',
      'барам', 'барамын', 'келем', 'келемін', 'келемн',
      'болады', 'бола берсін', 'жарайды', 'мақұл',
      'ок', 'окей', 'ok', 'okay',
      'да', 'хорошо', 'давайте', 'ладно', 'согласна', 'согласен',
    ];
    if (exactMatches.includes(trimmed)) return true;

    // Комбинации: "иа болады", "иа жарайды", "барам жарайды"
    if (/^(иа|иә|ия)\s+(болады|жарайды|мақұл|барам|келем|ок|хорошо|ладно)/.test(trimmed)) return true;
    if (/^(барам|келем)(ын|ін)?\s+(жарайды|болады|мақұл|ок)/.test(trimmed)) return true;

    return false;
  }

  /** Мягкое согласие — для комбинации с datetime */
  private isSoftAgreement(line: string): boolean {
    return /\b(да|давайте|хорошо|ок|окей|ладно|подходит|согласна|согласен|мақұл|иә|болады|жарайды|иа|барам|келем)\b/.test(line);
  }

  /** Явный отказ */
  private isLostResponse(line: string): boolean {
    // Казахский — точные совпадения
    const kzLost = [
      'жоқ', 'жок',
      'бармаймын', 'бармайм', 'бармаим', 'бармай',
      'келмеймін', 'келмейм', 'келмим',
      'керек емес', 'керек жоқ', 'керек жок',
      'қымбат', 'қымбат екен', 'кымбат', 'кымбат екен',
      'ойымнан қайттым', 'ойымнан кайттым',
      'қаламаймын', 'каламаймын',
      'жоқ, керек емес',
    ];
    // Русский
    const ruLost = [
      'не буду', 'не хочу', 'не приду', 'не актуально', 'отказываюсь',
      'передумала', 'передумал', 'не интересно', 'не нужно', 'не надо',
      'спасибо не надо', 'спасибо, не надо', 'не подходит', 'мне не подходит',
      'запишусь в другом', 'в другом месте', 'дорого', 'слишком дорого',
      'дороговато', 'нет, дорого', 'это дорого', 'нет спасибо',
    ];
    for (const p of [...kzLost, ...ruLost]) {
      if (line.includes(p)) return true;
    }
    return false;
  }

  /** Явный IN_PROGRESS — клиент думает или откладывает */
  private isInProgressResponse(line: string): boolean {
    const patterns = [
      // Казахский
      'ойланам', 'ойланайын', 'ойланып алайын',
      'кейін', 'кейин', 'кейін айтам', 'кейин айтам',
      'кейін жазам', 'кейин жазам',
      'білмеймін', 'білмим', 'билмеймін',
      'әзірге жоқ', 'азірге жоқ',
      'ақылдасам', 'ақылдасып алайын', 'акылдасам',
      // Русский
      'я подумаю', 'подумаю', 'надо подумать', 'надо подумать',
      'позже', 'потом', 'позже напишу', 'позже скажу',
      'ещё не знаю', 'не знаю', 'подумаем',
    ];
    for (const p of patterns) {
      if (line.includes(p)) return true;
    }
    return false;
  }

  /** Есть ли конкретная дата или время в тексте? */
  private hasDateTime(text: string): boolean {
    return (
      // Казахский: ертең, ертен, бүгін + дни недели
      /\b(ертең|ертен|ертеңге|ертенге|бүгін|бугін|бугин|жұма|сенбі|дүйсенбі|сейсенбі|сәрсенбі|бейсенбі)\b/.test(text) ||
      // Русский: завтра, сегодня + дни недели
      /\b(завтра|послезавтра|сегодня|понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/.test(text) ||
      // Время: "в 16:00", "в 16", "16:00", "4те", "4-те", "сағат 4"
      /в\s+\d{1,2}(:\d{2})?/.test(text) ||
      /\b\d{1,2}:\d{2}\b/.test(text) ||
      /\b\d{1,2}(:\d{2})?\s*(те|де|да|та)\b/.test(text) ||
      /сағат\s+\d/.test(text) ||
      // Дата: "15 августа", "15-го"
      /\b\d{1,2}[\s-](января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/.test(text)
    );
  }
}
