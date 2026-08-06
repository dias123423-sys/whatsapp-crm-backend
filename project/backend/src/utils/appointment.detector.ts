/**
 * Appointment detection and parsing from WhatsApp messages.
 *
 * Supports Russian and Kazakh date/time phrases:
 *   "12.07", "12 июля", "завтра", "сегодня", "послезавтра"
 *   "14:00", "14ч", "в 14", "14.00"
 */

import { addDays, setHours, setMinutes, setSeconds, startOfDay } from 'date-fns';

// ─── Bot detection markers ───────────────────────────────────────────────────

const BOT_PHRASES = [
  'спасибо',
  'я записала вас на',
  'я записал вас на',
  'записала на',
  'записал на',
  'мы уже готовимся к вашему визиту',
  'в ближайшее время с вами свяжется менеджер',
  'если планы изменятся',
  'запись создана',
  'запись подтверждена',
  '[bot]',
  '🤖',
  '✅ запись',
  'вы записаны',
];

const BOT_EMOJIS = ['✅', '🤖', '📅', '🗓️'];

export type CreatedBy = 'BOT' | 'OPERATOR';

export function detectCreatedBy(
  text: string,
  fromMe: boolean,
): CreatedBy {
  const lower = text.toLowerCase();

  // Explicit bot markers
  if (BOT_PHRASES.some((p) => lower.includes(p))) return 'BOT';
  if (BOT_EMOJIS.some((e) => text.includes(e))) return 'BOT';

  // fromMe messages without bot markers → OPERATOR typed manually
  if (fromMe) return 'OPERATOR';

  // Incoming message without bot markers → OPERATOR (client reply or manual)
  return 'OPERATOR';
}

// ─── Appointment detection ───────────────────────────────────────────────────

/**
 * Returns true if the message looks like an appointment confirmation.
 * We require BOTH a date-like token AND a time-like token to avoid false
 * positives on generic messages.
 */
export function isAppointmentMessage(text: string): boolean {
  const hasDate =
    /\b\d{1,2}[./]\d{1,2}/.test(text) ||              // 12.07 / 12/07
    /\b(сегодня|завтра|послезавтра)\b/i.test(text) ||  // relative dates
    /\b\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i.test(text);

  const hasTime =
    /\b\d{1,2}:\d{2}\b/.test(text) ||   // 14:00  ← most reliable
    /\b\d{1,2}ч\b/i.test(text) ||       // 14ч
    /\bв\s+\d{1,2}\b/i.test(text);      // в 14  (removed dot-time to avoid date/time ambiguity)

  // Extra check: must contain a bot/booking-related phrase OR "запись" keyword
  // to reduce false positives on random messages with dates
  const hasBookingPhrase =
    /запис|записала|записал|спасибо|подтвержд|визит|менеджер|salon|запись|клиент|имя|телефон/i.test(text);

  return hasDate && hasTime && hasBookingPhrase;
}

// ─── Date extraction ─────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  января: 0, февраля: 1, марта: 2, апреля: 3,
  мая: 4, июня: 5, июля: 6, августа: 7,
  сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

export function extractDate(text: string): Date | null {
  const now = new Date();

  // "сегодня"
  if (/\bсегодня\b/i.test(text)) return startOfDay(now);

  // "завтра"
  if (/\bзавтра\b/i.test(text)) return startOfDay(addDays(now, 1));

  // "послезавтра"
  if (/\bпослезавтра\b/i.test(text)) return startOfDay(addDays(now, 2));

  // "12 июля" / "12июля"
  const textMonth = text.match(
    /\b(\d{1,2})\s*(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i,
  );
  if (textMonth) {
    const day = parseInt(textMonth[1], 10);
    const month = MONTH_MAP[textMonth[2].toLowerCase()];
    const year = now.getFullYear();
    const d = new Date(year, month, day);
    // Roll to next year if the date is in the past (> 30 days ago)
    if (d < addDays(now, -30)) d.setFullYear(year + 1);
    return d;
  }

  // "12.07" / "12/07" / "12.07.2025"
  const numericDate = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (numericDate) {
    const day = parseInt(numericDate[1], 10);
    const month = parseInt(numericDate[2], 10) - 1;
    const rawYear = numericDate[3];
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

// ─── Time extraction ─────────────────────────────────────────────────────────

export function extractTime(text: string): string | null {
  // "14:00" / "14:30" — most specific, check first
  const colon = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // "14ч" or "в 14" — before dot check to avoid matching dates
  const hourOnly =
    text.match(/\b(\d{1,2})ч\b/i) ??
    text.match(/\bв\s+(\d{1,2})\b/i);
  if (hourOnly) {
    const h = parseInt(hourOnly[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }

  // "14.00" — only match if looks like time (hour <= 23, minutes <= 59)
  // Avoid matching date patterns like "12.07"
  const dot = text.match(/\b(\d{1,2})\.(\d{2})\b/);
  if (dot) {
    const h = parseInt(dot[1], 10);
    const m = parseInt(dot[2], 10);
    // Only treat as time if minutes < 60 AND doesn't look like a date (month 1-12, day 1-31)
    const looksLikeDate = h >= 1 && h <= 31 && m >= 1 && m <= 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && !looksLikeDate) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return null;
}

// ─── Phone extraction ─────────────────────────────────────────────────────────

export function extractPhone(text: string): string | null {
  // Match +7, 8, or 7 followed by 10 digits
  const match = text.match(/(?:\+7|8|7)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  if (!match) return null;
  // Normalise to +7XXXXXXXXXX
  const digits = match[0].replace(/\D/g, '');
  if (digits.length === 11) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
}

// ─── Client name extraction ───────────────────────────────────────────────────

const NAME_PREFIXES = [
  'клиент:', 'клиент', 'имя:', 'имя', 'записала', 'записал',
  'спасибо,', 'спасибо', 'здравствуйте,', 'здравствуйте',
];

export function extractClientName(text: string): string {
  const lower = text.toLowerCase();

  // "Спасибо, Айбек!" / "Спасибо, Диас Б.!"
  const thankYou = text.match(/спасибо[,!]?\s+([А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z\-\.]{1,30}(?:\s+[А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z\-\.]{1,30})?)/i);
  if (thankYou) return thankYou[1].trim();

  // "Клиент: Айбек" / "Имя: Диас"
  for (const prefix of NAME_PREFIXES) {
    if (lower.startsWith(prefix) || lower.includes(`\n${prefix}`)) {
      const afterPrefix = text
        .replace(new RegExp(prefix, 'i'), '')
        .trim()
        .split(/[\n,!?]/)[0]
        .trim();
      if (afterPrefix.length > 1 && afterPrefix.length < 60) return afterPrefix;
    }
  }

  // "Записала Алину на завтра" → extract name after verb
  const wroteMatch = text.match(/[Зз]аписал[аи]?\s+([А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z\-]{1,25}(?:\s+[А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z\-]{1,25})?)/);
  if (wroteMatch) return wroteMatch[1].trim();

  // Fallback: first capitalised word token that looks like a name
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    const clean = token.replace(/[^А-ЯЁA-Za-zа-яё\-\.]/g, '');
    if (clean.length >= 2 && /^[А-ЯЁA-Z]/.test(clean)) return clean;
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
    clientName: extractClientName(text),
    phone: extractPhone(text),
    appointmentDate: extractDate(text),
    appointmentTime: extractTime(text),
    createdBy: detectCreatedBy(text, fromMe),
  };
}

// ─── Apply time to a date ─────────────────────────────────────────────────────

export function applyTimeToDate(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  return setSeconds(setMinutes(setHours(date, h), m), 0);
}
