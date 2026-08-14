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

      // Анализируем ПОЛНЫЙ контекст, а не только текущее сообщение
      const contextPrice = this.extractPrice(fullConversation);
      const contextOffer = await this.matchOffer(fullConversation, contextPrice?.price);

      // Определяем botResult из полного диалога
      const botResult = this.determineBotResult(fullConversation);

      const updateData: any = {
        // Всегда дополняем историю сообщений
        originalMessage: recentActiveLead.originalMessage
          ? `${recentActiveLead.originalMessage}\n---\n${messageText}`
          : messageText,
        updatedAt: new Date(),
      };

      // Обновляем процедуру ТОЛЬКО если новая найдена И (старой нет ИЛИ старая пустая)
      if (contextOffer) {
        if (!recentActiveLead.parsedProcedures || recentActiveLead.parsedProcedures.length === 0) {
          updateData.parsedProcedures = contextOffer.procedures;
          updateData.offerId = contextOffer.offerId;
        }
        if (!recentActiveLead.parsedPrice || recentActiveLead.parsedPrice === 0) {
          updateData.parsedPrice = contextOffer.price;
          updateData.parsedCurrency = 'KZT';
        }
      }

      // Обновляем botResult если он изменился
      if (botResult && botResult !== recentActiveLead.botResult) {
        updateData.botResult = botResult;
        updateData.botResultUpdatedAt = new Date();
        this.logger.log(`🎯 Bot result updated: ${recentActiveLead.botResult ?? 'NULL'} → ${botResult}`);
      }

      await this.prisma.lead.update({
        where: { id: recentActiveLead.id },
        data: updateData,
      });

      this.logger.log(
        `✅ Updated lead ${recentActiveLead.id} | procedure=${contextOffer?.offerName ?? 'unchanged'} | result=${botResult ?? 'unchanged'}`,
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
  // BOT RESULT DETECTOR (deterministic, no AI)
  // ═══════════════════════════════════════════════

  /**
   * Определяет результат диалога по всему контексту.
   * 
   * BOOKED: явное согласие на запись
   * LOST: явный отказ
   * IN_PROGRESS: всё остальное (по умолчанию)
   * 
   * Приоритет:
   * 1. BOOKED (если есть явное подтверждение)
   * 2. LOST (если есть явный отказ)
   * 3. IN_PROGRESS (если неопределённо)
   */
  determineBotResult(fullConversation: string): 'BOOKED' | 'IN_PROGRESS' | 'LOST' | null {
    if (!fullConversation) return 'IN_PROGRESS';

    const normalized = fullConversation.toLowerCase();

    // ─────────────────────────────────────────────────
    // BOOKED: Явное согласие на запись
    // ─────────────────────────────────────────────────
    const bookedPatterns = [
      // Русский
      /\b(да|давайте|хорошо|согласен|согласна|подходит|подтверждаю|запиш[иы])/i,
      /\b(запишите\s+меня|я\s+приду|буду|записываюсь)/i,
      /\b(запишите\s+на|записать\s+на|хочу\s+записаться\s+на)/i,
      // Казахский
      /\b(иә|жазып\s+қойыңыз|жазылыңыз|жазылғым\s+келеді|келемін)/i,
      /\b(жазып\s+алыңыз|мақұл|келісемін)/i,
    ];

    for (const pattern of bookedPatterns) {
      if (pattern.test(normalized)) {
        // Дополнительная проверка: есть ли контекст записи?
        // (чтобы избежать false positive на простое "да" вне контекста)
        const hasBookingContext = /запис|хочу|можно|время|дата|завтра|сегодня|жазы/i.test(normalized);
        if (hasBookingContext) {
          return 'BOOKED';
        }
      }
    }

    // ─────────────────────────────────────────────────
    // LOST: Явный отказ
    // ─────────────────────────────────────────────────
    const lostPatterns = [
      // Русский
      /\b(нет|не\s+буду|не\s+хочу|не\s+приду|не\s+актуально|отказываюсь)/i,
      /\b(дорого|слишком\s+дорого|передумал|передумала|не\s+интересно)/i,
      /\b(не\s+подходит|мне\s+не\s+подходит|запишусь\s+в\s+другом)/i,
      /\b(спасибо\s+не\s+нужно|не\s+надо)/i,
      // Казахский
      /\b(жоқ|қымбат|керек\s+емес|бармаймын|қаламаймын)/i,
      /\b(ойымнан\s+қайттым|қызықты\s+емес)/i,
    ];

    for (const pattern of lostPatterns) {
      if (pattern.test(normalized)) {
        return 'LOST';
      }
    }

    // ─────────────────────────────────────────────────
    // IN_PROGRESS: всё остальное
    // ─────────────────────────────────────────────────
    return 'IN_PROGRESS';
  }
}
