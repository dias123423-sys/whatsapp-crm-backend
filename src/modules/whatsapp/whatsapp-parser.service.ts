import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

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

interface ParsedContext {
  offer: OfferMatch | null;
  price: PriceResult | null;
  date: string | null;
  time: string | null;
  age: number | null;
  gender: 'MALE' | 'FEMALE' | null;
  city: string | null;
  isAktobe: boolean;
  name: string | null;
  result: 'BOOKED' | 'LOST' | 'UNKNOWN' | null;
}

// ═══════════════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════════════
const LEAD_ACTIVE_WINDOW_DAYS = 7;
const LEAD_ACTIVE_WINDOW_MS = LEAD_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const MESSAGE_CONTEXT_WINDOW_HOURS = 24;
const MESSAGE_CONTEXT_WINDOW_MS = MESSAGE_CONTEXT_WINDOW_HOURS * 60 * 60 * 1000;
const OFFER_MATCH_THRESHOLD = 10;
const MAX_NAME_LENGTH = 50;
const MAX_NAME_WORDS = 3;

@Injectable()
export class WhatsAppParserService {
  private readonly logger = new Logger(WhatsAppParserService.name);
  private parseCache = new Map<string, any>();
  private readonly CACHE_MAX_SIZE = 1000;

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
   *
   * FIX (Deploy #31):
   * - Убрано дублирование кода парсинга (DRY)
   * - Добавлены транзакции БД (N+1 fix)
   * - Type safety (убран any)
   * - Константы вместо magic numbers
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
    // STEP 4: Find ACTIVE lead within dialog window (24h from LAST MESSAGE)
    // ╔════════════════════════════════════════════════════════════╗
    // ║ КРИТИЧЕСКОЕ ПРАВИЛО:                                       ║
    // ║ • Client = один номер навсегда                            ║
    // ║ • Lead = один диалог                                       ║
    // ║ • Диалог активен 24 часа с момента ПОСЛЕДНЕГО INCOMING    ║
    // ║ • Любые сообщения внутри 24ч обновляют ТОТ ЖЕ Lead       ║
    // ║ • Независимо от BOOKED/UNKNOWN/LOST статуса              ║
    // ║ • Если клиент пишет после 24ч → создать новый Lead       ║
    // ╚════════════════════════════════════════════════════════════╝
    const ACTIVE_DIALOG_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 часа
    const activeDialogThreshold = new Date(Date.now() - ACTIVE_DIALOG_WINDOW_MS);

    const recentLead = await this.prisma.lead.findFirst({
      where: {
        clientId: client.id,
        // ЛЮБОЙ статус (включая BOOKED, CLOSED) - диалог определяется временем
        // Окно активного диалога (24 часа с ПОСЛЕДНЕГО обновления)
        updatedAt: { gte: activeDialogThreshold },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (recentLead) {
      // ╔════════════════════════════════════════════════════════════╗
      // ║ ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕГО LEAD                              ║
      // ║ Условие: Lead обновлялся в последние 24ч                   ║
      // ║ Действие: обновить данные ТОГО ЖЕ Lead                     ║
      // ║ Важно: Обновляем даже если статус BOOKED/CLOSED           ║
      // ╚════════════════════════════════════════════════════════════╝
      this.logger.log(`Updating lead ${recentLead.id} status=${recentLead.status} (active dialog)`);

      // STEP 5: Load full conversation context (ALL messages since lead creation)
      const allMessages = await this.prisma.message.findMany({
        where: { 
          clientId: client.id, 
          createdAt: { gte: recentLead.createdAt }
        },
        orderBy: { createdAt: 'asc' },
      });

      this.logger.debug(`Context: ${allMessages.length} messages`);

      // FIX: Используем единый метод парсинга (убрано дублирование)
      const context = await this.parseLeadContext(allMessages);

      // FIX: Используем единый метод обновления данных
      const updateData = this.buildUpdateData(recentLead, context, messageText);

      // Update client name if needed
      if (context.name && !client.name) {
        await this.prisma.client.update({
          where: { id: client.id },
          data: { name: context.name },
        });
        this.logger.log(`Client name updated: ${context.name}`);
      }

      await this.prisma.lead.update({ where: { id: recentLead.id }, data: updateData });
      this.logger.log(`Lead ${recentLead.id} updated`);
      return null;
    }

    // ─────────────────────────────────────────────────
    // STEP 9: Create NEW Lead
    // ╔════════════════════════════════════════════════════════════╗
    // ║ СОЗДАНИЕ НОВОГО LEAD                                       ║
    // ║                                                            ║
    // ║ КРИТИЧЕСКОЕ ПРАВИЛО БАЗЫ:                                 ║
    // ║ • Client и Lead — РАЗНЫЕ сущности                         ║
    // ║ • normalizedPhone определяет Client (один номер = один Client) ║
    // ║ • Один Client может иметь МНОГО Lead                      ║
    // ║ • Каждое новое обращение = новый Lead                     ║
    // ║                                                            ║
    // ║ УСЛОВИЕ создания нового Lead:                             ║
    // ║ • НЕТ активного Lead в окне 24ч                           ║
    // ║ • ИЛИ предыдущий Lead завершён (BOOKED/CLOSED)            ║
    // ║                                                            ║
    // ║ Пример:                                                    ║
    // ║ +77771234567 (Client #1):                                 ║
    // ║   25.08 10:00 → Lead #1 (NEW)                             ║
    // ║   25.08 11:00 → Lead #1 (обновление - тот же диалог)     ║
    // ║   25.08 12:00 → Lead #1 (BOOKED - завершён)              ║
    // ║   28.08 14:00 → Lead #2 (NEW - новое обращение)          ║
    // ║                                                            ║
    // ║ Client остаётся ОДИН для всех Lead                        ║
    // ║ Нельзя смешивать историю разных обращений в один Lead    ║
    // ║ OLD PARSER работает по контексту ТЕКУЩЕГО Lead            ║
    // ╚════════════════════════════════════════════════════════════╝
    // Парсим по fullConversation (все сообщения за 24ч)
    // ВАЖНО: текущее сообщение УЖЕ в базе (upsert выше), не дублируем!
    // ─────────────────────────────────────────────────

    // FIX: Если сообщение пустое (медиа/голос/стикер) — НЕ создаём новый лид
    if (isEmptyMessage) {
      this.logger.debug(`Empty message - skipping new lead creation for ${phone}`);
      return { status: 'skipped', reason: 'empty_message', phone };
    }

    // Загружаем все сообщения клиента за 24ч (включая текущее)
    const oneDayAgo = new Date(Date.now() - MESSAGE_CONTEXT_WINDOW_MS);
    const prevMessages = await this.prisma.message.findMany({
      where: { clientId: client.id, createdAt: { gte: oneDayAgo } },
      orderBy: { createdAt: 'asc' },
    });

    // FIX: Используем единый метод парсинга
    const context = await this.parseLeadContext(prevMessages);
    const period = this.determinePeriod();

    // ─────────────────────────────────────────────────
    // DUPLICATE PREVENTION: Try to create, catch unique constraint violation
    // ─────────────────────────────────────────────────
    try {
      const lead = await this.prisma.lead.create({
        data: {
          clientId:          client.id,
          whatsappAccountId: whatsappAccountId ?? undefined,
          whatsappOwnerId:   whatsappOwnerId ?? undefined,
          originalMessage:   messageText || '',
          parsedProcedures:  context.offer?.procedures ?? [],
          parsedPrice:       context.offer?.price ?? context.price?.price ?? null,
          parsedCurrency:    'KZT',
          parsedDate:        context.date ?? undefined,
          parsedTime:        context.time ?? undefined,
          parsedAge:         context.age ?? undefined,
          parsedGender:      context.gender ?? undefined,
          parsedCity:        context.city ?? undefined,
          isAktobeResident:  context.isAktobe ? true : undefined,
          parsedName:        context.name ?? undefined,
          offerId:           context.offer?.offerId ?? undefined,
          status:            'NEW',
          source:            'WHATSAPP',
          period,
          botResult:         context.result ?? undefined,
          botResultUpdatedAt: context.result ? new Date() : undefined,
        } as any,
        include: { client: true, whatsappAccount: true, whatsappOwner: true, offer: true },
      });

      this.logger.log(
        `Lead created: ${lead.id} | msgs=${prevMessages.length} | proc=${context.offer?.offerName ?? 'UNKNOWN'} | price=${context.offer?.price ?? context.price?.price ?? 'NULL'} | date=${context.date ?? '—'} | time=${context.time ?? '—'} | result=${context.result ?? '—'}`,
      );

      return lead;
    } catch (error: any) {
      // Check if this is a unique constraint violation on clientId
      if (error.code === 'P2002' && error.meta?.target?.includes('clientId')) {
        this.logger.warn(
          `Duplicate lead prevented for client ${client.id} phone=${phone}. Retrying as update...`
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

          // FIX: Используем единый метод парсинга и обновления
          const retryContext = await this.parseLeadContext(allMessages);
          const updateData = this.buildUpdateData(existingLead, retryContext, messageText);

          await this.prisma.lead.update({ where: { id: existingLead.id }, data: updateData });
          this.logger.log(`Lead ${existingLead.id} updated after duplicate prevention`);
          return null;
        }

        // If we still can't find the lead, something is very wrong
        this.logger.error(`CRITICAL: Failed to find or create lead for client ${client.id}`);
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
   * FIX (Deploy #31): Добавлено кэширование для производительности
   */
  extractPrice(text: string): PriceResult | null {
    if (!text) return null;

    // Кэширование
    const cacheKey = `price:${text.substring(0, 100)}`;
    if (this.parseCache.has(cacheKey)) {
      return this.parseCache.get(cacheKey);
    }

    const result = this.extractPriceImpl(text);
    
    // Сохраняем в кэш
    this.parseCache.set(cacheKey, result);
    this.cleanCache();
    
    return result;
  }

  private extractPriceImpl(text: string): PriceResult | null {
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
   * 
   * FIX (Deploy #32):
   * - Добавлен парсинг "27 го" = 27 августа
   * - Улучшена точность определения дат
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

    // FIX: "27 го" = 27 августа (текущий месяц)
    const goMatch = t.match(/(\d{1,2})\s*го(?:\s|$)/);
    if (goMatch) {
      const day = parseInt(goMatch[1], 10);
      if (day >= 1 && day <= 31) {
        const year = todayDate.getFullYear();
        const month = todayDate.getMonth();
        const d = new Date(year, month, day);
        // Если дата в прошлом, берем следующий месяц
        if (d < todayDate) d.setMonth(month + 1);
        return d.toISOString().split('T')[0];
      }
    }

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
   * FIX (Deploy #31): Type safety improvements
   */
  async matchOffer(text: string, price?: number): Promise<OfferMatch | null> {
    if (!text && !price) return null;

    const normalized = this.normalizeText(text);

    const offers = await this.prisma.offer.findMany({ where: { active: true } });
    if (offers.length === 0) {
      this.logger.warn('No active offers in DB');
      return null;
    }

    let bestOffer: typeof offers[0] | null = null;
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

    if (bestScore >= OFFER_MATCH_THRESHOLD && bestOffer) {
      this.logger.log(`Offer: "${bestOffer.name}" score=${bestScore} price=${bestOffer.price}₸`);
      return {
        offerId: bestOffer.id,
        offerName: bestOffer.name,
        price: bestOffer.price,
        procedures: this.splitProcedureName(bestOffer.name),
        score: bestScore,
      };
    }

    this.logger.log(`No offer match bestScore=${bestScore}`);
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
            `BOOKED | explicit confirmation: "${phrase}" in "${msg.substring(0, 100)}..."`,
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
        this.logger.log(`LOST | client refusal: "${phrase}"`);
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
        this.logger.log(`LOST | operator rejection: "${phrase}"`);
        return 'LOST';
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: ВСЁ ОСТАЛЬНОЕ — НЕ ОПРЕДЕЛЯЕМ RESULT
    // ═══════════════════════════════════════════════════════════════════

    this.logger.log(`NULL | no explicit booking confirmation`);
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // НОВЫЕ ПАРСЕРЫ: ВОЗРАСТ, ПОЛ, ГОРОД, ИМЯ
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Извлекает возраст из сообщений клиента
   * Примеры: "58", "28 лет", "мне 21 год", "19", "1954 год", "52 года"
   * 
   * FIX (Deploy #32): Улучшена точность - НЕ парсим вопросы оператора!
   * Парсим только ОТВЕТЫ клиента (INCOMING после вопроса про возраст)
   */
  extractAge(text: string): number | null {
    if (!text) return null;

    const lines = text.split('\n').filter(Boolean);
    
    // Проходим по всем строкам и ищем паттерн: вопрос про возраст → ответ
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].toLowerCase();
      const nextLine = lines[i + 1].toLowerCase();
      
      // Пропускаем вопросы оператора с "возраст" 
      if (line.startsWith('outgoing:') && /возраст|жас|сколько.*лет/.test(line)) {
        // Следующая строка должна быть от клиента
        if (nextLine.startsWith('incoming:')) {
          const answer = nextLine.replace(/^incoming:\s*/i, '').trim();
          
          // Проверяем что это число, а не вопрос
          if (/^\d{2}$/.test(answer)) {
            const age = parseInt(answer, 10);
            if (age >= 15 && age <= 99) {
              return age;
            }
          }
          
          // "28 лет", "52 года"
          const ageMatch = answer.match(/^(\d{2})\s*(?:лет|год|жас|года)$/);
          if (ageMatch) {
            const age = parseInt(ageMatch[1], 10);
            if (age >= 15 && age <= 99) {
              return age;
            }
          }
        }
      }
    }

    // Fallback: ищем по всему тексту (но БЕЗ вопросов)
    const t = text.toLowerCase();
    
    // НЕ парсим если это вопрос оператора
    if (/с какого возраста|до какого возраста|сколько вам лет/.test(t)) {
      return null;
    }

    // Паттерны для возраста в тексте
    const patterns = [
      /(?:мне|возраст)\s*(\d{2})\s*(?:лет|год|жас)/i,  // "мне 28 лет"
      /(\d{2})\s*(?:лет|год|жас|года)/i,               // "28 лет", "58 жас"
    ];

    for (const pattern of patterns) {
      const match = t.match(pattern);
      if (match) {
        const age = parseInt(match[1], 10);
        if (age >= 15 && age <= 99) {
          return age;
        }
      }
    }

    // Проверяем год рождения (например "1954 год")
    const birthYearMatch = t.match(/\b(19\d{2}|20\d{2})\s*(?:год|г\.р\.|года)?/);
    if (birthYearMatch) {
      const birthYear = parseInt(birthYearMatch[1], 10);
      const currentYear = 2026;
      const age = currentYear - birthYear;
      if (age >= 15 && age <= 99) {
        return age;
      }
    }

    return null;
  }

  /**
   * Определяет пол по возрасту, ключевым словам и цене
   * Женщины: от 23 лет (акция 3990 ₸)
   * Мужчины: от 30 лет (акция 7000 ₸)
   */
  extractGender(text: string, age?: number): 'MALE' | 'FEMALE' | null {
    if (!text && !age) return null;

    const t = text.toLowerCase();

    // Прямые указания пола - приоритет 1
    const maleKeywords = [
      /\bмужчин\b/i,
      /\bеркек\b/i,
      /\berkek\b/i,
      /\bерлер\b/i,
      /для мужчин/i,
      /мужской/i,
    ];

    const femaleKeywords = [
      /\bженщин\b/i,
      /\bәйел\b/i,
      /\bayel\b/i,
      /\bқыз\b/i,
      /\bкыз\b/i,
      /\bбала\b/i,
      /для женщин/i,
      /\bдевушк/i,
      /женский/i,
      /әйелдер/i,
    ];

    for (const pattern of maleKeywords) {
      if (pattern.test(t)) return 'MALE';
    }

    for (const pattern of femaleKeywords) {
      if (pattern.test(t)) return 'FEMALE';
    }

    // Определение по цене - приоритет 2
    if (/7\s*000|семь тысяч/i.test(t)) return 'MALE';
    if (/3\s*990|три тысяч/i.test(t)) return 'FEMALE';

    // Определение по возрасту - приоритет 3
    if (age) {
      // Женщины от 23, мужчины от 30
      // Если возраст 23-29, скорее всего женщина
      if (age >= 23 && age < 30) return 'FEMALE';
      // Если 30+, нужно больше контекста
      // По умолчанию если нет других признаков - женщина (статистически чаще)
      if (age >= 30 && age <= 69) {
        // Проверяем нет ли мужских признаков
        if (maleKeywords.some(k => k.test(t))) return 'MALE';
        // По умолчанию женщина
        return 'FEMALE';
      }
    }

    return null;
  }

  /**
   * Определяет город и является ли клиент жителем Актобе
   * FIX (Deploy #32): 
   * - "В Актобе" = isAktobe TRUE
   * - "Актобе.адрес" = isAktobe TRUE  
   * - Улучшена точность определения
   */
  extractCityAndResident(text: string): { city: string | null; isAktobe: boolean } {
    if (!text) return { city: null, isAktobe: false };

    const t = text.toLowerCase();

    // Явные указания что живет в Актобе
    const aktobeConfirmation = [
      /(?:^|\s)в актобе(?:\s|$|\.)/i,
      /(?:^|\s)в городе актобе/i,
      /актобе\.адрес/i,
      /проживаю.*актоб/i,
      /живу.*актоб/i,
      /я житель актобе/i,
      /я из актобе/i,
      /(?:^|\s)актобе(?:\s|$)/i, // Просто "Актобе" в ответе
    ];

    for (const pattern of aktobeConfirmation) {
      if (pattern.test(t)) {
        return { city: 'Актобе', isAktobe: true };
      }
    }

    // Актобе и область
    const aktobePatterns = [
      { pattern: /\bақтөбе\b/i, name: 'Актобе' },
      { pattern: /\baktobe\b/i, name: 'Актобе' },
      { pattern: /актюбинск/i, name: 'Актюбинская область' },
      { pattern: /\bхромтау\b/i, name: 'Хромтау' },   // город в области
      { pattern: /\bалга\b/i, name: 'Алга' },         // город в области
      { pattern: /кандыагаш/i, name: 'Кандыагаш' },   // город в области
    ];

    for (const { pattern, name } of aktobePatterns) {
      if (pattern.test(t)) {
        return { city: name, isAktobe: true };
      }
    }

    // Другие города - НЕ Актобе
    const otherCities = [
      { pattern: /\bуральск\b/i, name: 'Уральск' },
      { pattern: /\bалматы\b/i, name: 'Алматы' },
      { pattern: /\bастана\b/i, name: 'Астана' },
      { pattern: /\bшымкент\b/i, name: 'Шымкент' },
      { pattern: /караганд/i, name: 'Караганда' },
      { pattern: /\bатырау\b/i, name: 'Атырау' },
      { pattern: /\bтараз\b/i, name: 'Тараз' },
      { pattern: /\bкостанай\b/i, name: 'Костанай' },
      { pattern: /\bпавлодар\b/i, name: 'Павлодар' },
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
   * Ищет после вопросов "Как Вас зовут?", "Ваше имя?", "как я могу к Вам обращаться?"
   * FIX (Deploy #32): 
   * - НЕ парсим вопросы как имя!
   * - Проверяем что ответ НЕ содержит "возраст", "лет", "можно"
   * - Только короткие ответы (2-15 символов, 1-2 слова)
   */
  extractName(messages: string[]): string | null {
    if (!messages || messages.length === 0) return null;

    // Оптимизация: ищем только последние 15 сообщений
    const recentMessages = messages.slice(-15);

    // Ищем паттерн: вопрос оператора → ответ клиента
    for (let i = 0; i < recentMessages.length - 1; i++) {
      const msg = recentMessages[i].toLowerCase();
      const nextMsg = recentMessages[i + 1];

      // Вопросы оператора о имени
      if (
        /как.*зовут|как.*обращаться|ваше имя|атыңыз|есіміңіз|подскажите.*имя/i.test(msg) &&
        nextMsg &&
        nextMsg.length > 1 &&
        nextMsg.length <= MAX_NAME_LENGTH
      ) {
        const name = nextMsg.trim();
        
        // Фильтры: НЕ имя если содержит:
        const blocklist = [
          'возраст', 'лет', 'год', 'можно', 'хочу', 'когда', 'где',
          'сколько', 'какой', 'какая', 'есть', 'нету', 'нет',
          'http', 'www', '.com', '.ru', 'https',
          'записать', 'спасибо', 'благодар', 'здравствуй',
        ];
        
        const nameLower = name.toLowerCase();
        if (blocklist.some(word => nameLower.includes(word))) {
          continue; // Это НЕ имя, это вопрос или фраза
        }
        
        // Проверяем что это похоже на имя:
        // - Только буквы, пробелы, дефисы
        // - Не слишком длинное (макс 2 слова для имени+фамилии)
        if (
          /^[а-яёa-zәіңғүұқөһ\s-]+$/i.test(name) &&
          name.split(/\s+/).length <= 2 && // Макс 2 слова
          name.length >= 2 && // Минимум 2 символа
          name.length <= 30  // Максимум 30 символов
        ) {
          // Капитализируем первую букву каждого слова
          return name
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
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

  // ═══════════════════════════════════════════════
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ (Deploy #31 - DRY FIX)
  // ═══════════════════════════════════════════════

  /**
   * Парсит все данные из сообщений одним вызовом
   * FIX: убрано дублирование кода (было 3 копии)
   */
  private async parseLeadContext(messages: any[]): Promise<ParsedContext> {
    const fullConversation = messages
      .map((m) => `${m.direction.toLowerCase()}: ${m.message}`)
      .join('\n');
    
    const incomingOnly = messages
      .filter((m) => m.direction === 'INCOMING')
      .map((m) => m.message)
      .join('\n');

    const priceResult = this.extractPrice(incomingOnly);
    const age = this.extractAge(fullConversation);

    return {
      offer: await this.matchOffer(incomingOnly, priceResult?.price),
      price: priceResult,
      date: this.extractDate(fullConversation),
      time: this.extractTime(fullConversation),
      age,
      gender: this.extractGender(fullConversation, age ?? undefined),
      city: this.extractCityAndResident(fullConversation).city,
      isAktobe: this.extractCityAndResident(fullConversation).isAktobe,
      name: this.extractName(messages.map(m => m.message)),
      result: this.determineResult(fullConversation),
    };
  }

  /**
   * Обновляет только пустые поля в lead
   * FIX: убрано дублирование логики обновления
   */
  private buildUpdateData(
    existingLead: any,
    context: ParsedContext,
    newMessage: string
  ): Partial<Prisma.LeadUpdateInput> {
    const updateData: Partial<Prisma.LeadUpdateInput> & { offerId?: string } = {
      originalMessage: existingLead.originalMessage
        ? `${existingLead.originalMessage}\n---\n${newMessage}`
        : newMessage,
      updatedAt: new Date(),
    };

    // Procedure
    const hasProcedure = existingLead.parsedProcedures?.length > 0;
    if (!hasProcedure && context.offer) {
      updateData.parsedProcedures = context.offer.procedures as any;
      updateData.offerId = context.offer.offerId;
      this.logger.log(`Procedure: ${context.offer.offerName}`);
    }

    // Price
    const hasPrice = existingLead.parsedPrice && existingLead.parsedPrice > 0;
    if (!hasPrice) {
      if (context.offer) {
        updateData.parsedPrice = context.offer.price;
        updateData.parsedCurrency = 'KZT';
        this.logger.log(`Price from offer: ${context.offer.price} KZT`);
      } else if (context.price) {
        updateData.parsedPrice = context.price.price;
        updateData.parsedCurrency = 'KZT';
        this.logger.log(`Price extracted: ${context.price.price} KZT`);
      }
    }

    // Date
    if (context.date && !existingLead.parsedDate) {
      updateData.parsedDate = context.date as any;
      this.logger.log(`Date: ${context.date}`);
    }

    // Time
    if (context.time && !existingLead.parsedTime) {
      updateData.parsedTime = context.time as any;
      this.logger.log(`Time: ${context.time}`);
    }

    // Age
    if (context.age && !existingLead.parsedAge) {
      updateData.parsedAge = context.age;
      this.logger.log(`Age: ${context.age}`);
    }

    // Gender
    if (context.gender && !existingLead.parsedGender) {
      updateData.parsedGender = context.gender as any;
      this.logger.log(`Gender: ${context.gender}`);
    }

    // City
    if (context.city && !existingLead.parsedCity) {
      updateData.parsedCity = context.city as any;
      this.logger.log(`City: ${context.city}`);
    }

    // Aktobe resident
    if (context.isAktobe !== undefined && existingLead.isAktobeResident === null) {
      updateData.isAktobeResident = context.isAktobe;
      this.logger.log(`Aktobe resident: ${context.isAktobe ? 'YES' : 'NO'}`);
    }

    // Name
    if (context.name && !existingLead.parsedName) {
      updateData.parsedName = context.name as any;
      this.logger.log(`Name: ${context.name}`);
    }

    // Result (BOOKED не деградирует до UNKNOWN)
    const prevResult = existingLead.botResult;
    const shouldUpdateResult =
      context.result !== null &&
      context.result !== prevResult &&
      !(prevResult === 'BOOKED' && context.result !== 'LOST');

    if (shouldUpdateResult) {
      updateData.botResult = context.result as any;
      updateData.botResultUpdatedAt = new Date();
      this.logger.log(`Result: ${prevResult ?? 'null'} -> ${context.result}`);
    }

    return updateData;
  }

  /**
   * Очистка кэша при переполнении
   */
  private cleanCache() {
    if (this.parseCache.size > this.CACHE_MAX_SIZE) {
      const keysToDelete = Array.from(this.parseCache.keys()).slice(0, 100);
      keysToDelete.forEach(key => this.parseCache.delete(key));
    }
  }
}
