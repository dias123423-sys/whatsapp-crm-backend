/**
 * Appointment detection and parsing from WhatsApp messages.
 *
 * Supports Russian AND Kazakh date/time/name phrases:
 *
 * Russian:  "12.07", "12 июля", "завтра", "сегодня", "послезавтра"
 *           "14:00", "14ч", "в 14"
 *           "Спасибо, Айбек! Я записала Вас на..."
 *           "Записала Алину на завтра в 16:00"
 *           "Запись создана ✅"
 *
 * Kazakh:   "12 шілде", "ертең", "бүгін", "бүгін таңертең"
 *           "Жазып қойдым", "Сізді жаздым", "Жазылдыңыз"
 *           "Рахмет, Айбек! Сізді жаздым..."
 *           "Жазба расталды", "Кіру расталды"
 */

import { addDays, setHours, setMinutes, setSeconds, startOfDay } from 'date-fns';

// ─── BOT detection markers ────────────────────────────────────────────────────
// These phrases ONLY appear in automated bot confirmation messages.
// Operator-typed messages ("Записала Алину...") are NOT in this list.

const BOT_PHRASES_RU = [
  'спасибо',                                   // "Спасибо, Айбек! Я записала..."
  'я записала вас на',
  'я записал вас на',
  'мы уже готовимся к вашему визиту',
  'в ближайшее время с вами свяжется менеджер',
  'если планы изменятся',
  'запись подтверждена',
  'вы записаны',
  '[bot]',
  '🤖',
  '✅ запись',
];

// Казахские маркеры бота
const BOT_PHRASES_KZ = [
  'рахмет',                // "Рахмет, Айбек! Сізді жаздым..."
  'сізді жаздым',          // "Я записала вас" по-казахски
  'сізді жазып қойдым',
  'жазылдыңыз',            // "Вы записаны"
  'жазба расталды',        // "Запись подтверждена"
  'кіру расталды',         // "Визит подтверждён"
  'менеджер хабарласады',  // "Менеджер свяжется"
  'жоспарлар өзгерсе',     // "Если планы изменятся"
  '[bot]',
];

const BOT_EMOJIS = ['✅', '🤖', '📅', '🗓️'];

export type CreatedBy = 'BOT' | 'OPERATOR';

export function detectCreatedBy(text: string, fromMe: boolean): CreatedBy {
  const lower = text.toLowerCase();

  if (BOT_PHRASES_RU.some((p) => lower.includes(p))) return 'BOT';
  if (BOT_PHRASES_KZ.some((p) => lower.includes(p))) return 'BOT';
  if (BOT_EMOJIS.some((e) => text.includes(e))) return 'BOT';

  // "Запись создана" / "Жазба жасалды" — typical bot output
  if (/запись\s+создана/i.test(text)) return 'BOT';
  if (/жазба\s+жасалды/i.test(text)) return 'BOT';

  // fromMe without bot markers → operator typed manually
  if (fromMe) return 'OPERATOR';

  return 'OPERATOR';
}

// ─── Appointment detection ────────────────────────────────────────────────────

export function isAppointmentMessage(text: string): boolean {
  // ── Date patterns ──
  const hasDate =
    /\b\d{1,2}[./]\d{1,2}/.test(text) ||
    // RU relative
    /\b(сегодня|завтра|послезавтра)\b/i.test(text) ||
    // KZ relative
    /\b(бүгін|ертең|бүрсігүні)\b/i.test(text) ||
    // RU month name
    /\b\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i.test(text) ||
    // KZ month name
    /\b\d{1,2}\s+(қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүйек|қазан|қараша|желтоқсан)/i.test(text);

  // ── Time patterns ──
  const hasTime =
    /\b\d{1,2}:\d{2}\b/.test(text) ||
    /\b\d{1,2}ч\b/i.test(text) ||
    /\bв\s+\d{1,2}\b/i.test(text) ||
    /\bсағат\s+\d{1,2}/i.test(text); // KZ "сағат 14" = "в 14 часов"

  // ── Booking keyword gate (cuts false positives) ──
  const hasBookingPhrase =
    // RU
    /запис|записала|записал|спасибо|подтвержд|визит|менеджер|клиент|имя|телефон/i.test(text) ||
    // KZ — expanded list
    /жазып\s+қойдым|жаздым|жазылды|жазба|рахмет|расталды|менеджер|клиент|аты|телефон|сағат|ертең\s+сағат/i.test(text);

  return hasDate && hasTime && hasBookingPhrase;
}

// ─── Date extraction ──────────────────────────────────────────────────────────

// RU months → 0-indexed
const MONTH_MAP_RU: Record<string, number> = {
  января: 0, февраля: 1, марта: 2, апреля: 3,
  мая: 4, июня: 5, июля: 6, августа: 7,
  сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

// KZ months → 0-indexed
const MONTH_MAP_KZ: Record<string, number> = {
  қаңтар: 0, ақпан: 1, наурыз: 2, сәуір: 3,
  мамыр: 4, маусым: 5, шілде: 6, тамыз: 7,
  қыркүйек: 8, қазан: 9, қараша: 10, желтоқсан: 11,
};

export function extractDate(text: string): Date | null {
  const now = new Date();

  // ── RU relative ──
  if (/\bсегодня\b/i.test(text)) return startOfDay(now);
  if (/\bзавтра\b/i.test(text)) return startOfDay(addDays(now, 1));
  if (/\bпослезавтра\b/i.test(text)) return startOfDay(addDays(now, 2));

  // ── KZ relative ──
  if (/\bбүгін\b/i.test(text)) return startOfDay(now);
  if (/\bертең\b/i.test(text)) return startOfDay(addDays(now, 1));
  if (/\bбүрсігүні\b/i.test(text)) return startOfDay(addDays(now, 2));

  // ── RU month name: "12 июля" / "12июля" ──
  const ruMonth = text.match(
    /\b(\d{1,2})\s*(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i,
  );
  if (ruMonth) {
    const day = parseInt(ruMonth[1], 10);
    const month = MONTH_MAP_RU[ruMonth[2].toLowerCase()];
    return buildDate(day, month, now);
  }

  // ── KZ month name: "12 шілде" ──
  const kzMonth = text.match(
    /\b(\d{1,2})\s*(қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүйек|қазан|қараша|желтоқсан)/i,
  );
  if (kzMonth) {
    const day = parseInt(kzMonth[1], 10);
    const month = MONTH_MAP_KZ[kzMonth[2].toLowerCase()];
    return buildDate(day, month, now);
  }

  // ── Numeric: "12.07" / "12/07" / "12.07.2025" ──
  const numDate = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (numDate) {
    const day = parseInt(numDate[1], 10);
    const month = parseInt(numDate[2], 10) - 1;
    const rawYear = numDate[3];
    let year = now.getFullYear();
    if (rawYear) {
      year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10);
    }
    const d = new Date(year, month, day);
    if (!rawYear && d < addDays(now, -30)) d.setFullYear(year + 1);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function buildDate(day: number, month: number, now: Date): Date {
  const year = now.getFullYear();
  const d = new Date(year, month, day);
  if (d < addDays(now, -30)) d.setFullYear(year + 1);
  return d;
}

// ─── Time extraction ──────────────────────────────────────────────────────────

export function extractTime(text: string): string | null {
  // "14:00" — most specific, always first
  const colon = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // "14ч" / "в 14" / "сағат 14" (KZ)
  const hourOnly =
    text.match(/\b(\d{1,2})ч\b/i) ??
    text.match(/\bв\s+(\d{1,2})\b/i) ??
    text.match(/\bсағат\s+(\d{1,2})\b/i);
  if (hourOnly) {
    const h = parseInt(hourOnly[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }

  // "14.00" — only if clearly a time (minutes 00/15/30/45 and hour ≤23)
  // Avoid matching dates like "12.07"
  const dot = text.match(/\b(\d{1,2})\.(\d{2})\b/);
  if (dot) {
    const h = parseInt(dot[1], 10);
    const m = parseInt(dot[2], 10);
    const looksLikeDate = h >= 1 && h <= 31 && m >= 1 && m <= 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && !looksLikeDate)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

// ─── Phone extraction ─────────────────────────────────────────────────────────

export function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+7|8|7)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  if (digits.length === 11) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
}

// ─── Client name extraction ───────────────────────────────────────────────────

export function extractClientName(text: string): string {
  // ── "Спасибо, Айбек!" / "Рахмет, Диас!" ──
  const thankYou = text.match(
    /(?:спасибо|рахмет)[,!]?\s+([А-ЯЁA-ZҒҚҢӨҰҮІЁа-яёa-zғқңөұүі][а-яёa-zА-ЯЁA-ZҒҚҢӨҰҮІғқңөұүі\-\.]{1,30}(?:\s+[А-ЯЁA-ZҒҚҢӨҰҮІа-яёa-zҒҚҢӨҰҮІ][а-яёa-zА-ЯЁA-ZҒҚҢӨҰҮІ\-\.]{1,30})?)/i,
  );
  if (thankYou) return thankYou[1].trim();

  // ── "Клиент: Айбек" / "Аты: Диас" (KZ) / "Имя: Амина" ──
  const labelMatch = text.match(
    /(?:клиент|имя|аты(?:-жөні)?|аты)\s*[:\-]\s*([А-ЯЁA-ZҒҚҢӨҰҮІа-яёa-zҒҚҢӨҰҮІ][^\n\r,!?]{1,40})/i,
  );
  if (labelMatch) {
    // Trim to first word-boundary — stop at \n, comma, digit-sequence, or "телефон"
    const raw = labelMatch[1].trim();
    const name = raw.split(/[\n\r,!?\d]|телефон/i)[0].trim();
    if (name.length >= 2) return name;
  }

  // ── RU: "Записала Алину на завтра" / "Записал Диаса в 14:00" ──
  const wroteRu = text.match(
    /[Зз]аписал[аи]?\s+([А-ЯЁа-яё][а-яёА-ЯЁ\-\.]{1,20}(?:\s+[А-ЯЁ][а-яё\-\.]{1,20})?)\s+(?:на\s|в\s|\d)/u,
  );
  if (wroteRu) return wroteRu[1].trim();

  // ── KZ: "Жазып қойдым Айбекті" / "Жаздым Диасты" ──
  const wroteKz = text.match(
    /(?:жазып\s+қойдым|жаздым|сізді\s+жаздым)\s+([А-ЯЁA-ZҒҚҢӨҰҮІа-яёa-zҒҚҢӨҰҮІ][а-яёа-яА-ЯҒҚҢӨҰҮІ\-\.]{1,30})/i,
  );
  if (wroteKz) return wroteKz[1].trim();

  // ── Fallback: first token that starts with uppercase (skip verb-like words) ──
  const SKIP_WORDS = /^(записала?|спасибо|рахмет|здравствуйте|добрый|если|когда|вас|вам|я|мы|жазып|жаздым)$/i;
  for (const token of text.split(/\s+/)) {
    const clean = token.replace(/[^А-ЯЁA-Za-zа-яёҒҚҢӨҰҮІғқңөұүі\-\.]/g, '');
    if (clean.length >= 2 && /^[А-ЯЁA-ZҒҚҢӨҰҮІ]/.test(clean) && !SKIP_WORDS.test(clean))
      return clean;
  }

  return 'Клиент';
}

// ─── Full parse ───────────────────────────────────────────────────────────────

export interface ParsedAppointment {
  clientName: string;
  phone: string | null;
  appointmentDate: Date | null;
  appointmentTime: string | null;
  createdBy: CreatedBy;
}

export function parseAppointmentFromMessage(
  text: string,
  fromMe: boolean,
): ParsedAppointment {
  return {
    clientName:      extractClientName(text),
    phone:           extractPhone(text),
    appointmentDate: extractDate(text),
    appointmentTime: extractTime(text),
    createdBy:       detectCreatedBy(text, fromMe),
  };
}

// ─── Apply time to a date ─────────────────────────────────────────────────────

export function applyTimeToDate(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  return setSeconds(setMinutes(setHours(date, h), m), 0);
}
