#!/usr/bin/env tsx
/**
 * REPARSE ALL LEADS WITH FIXED LOGIC
 * Обновляет botResult для всех лидов с правильной логикой парсинга
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reparseAllLeads() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 STARTING REPARSE WITH FIXED LOGIC');
    console.log('═══════════════════════════════════════════════════════\n');

    // Получаем все лиды с сообщениями
    const leads = await prisma.lead.findMany({
      where: {
        botResult: { not: null },
      },
      include: {
        client: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    console.log(`📊 Found ${leads.length} leads to reparse\n`);

    let updated = 0;
    let unchanged = 0;
    const changes: Array<{ phone: string; old: string; new: string }> = [];

    for (const lead of leads) {
      if (!lead.client?.messages || lead.client.messages.length === 0) {
        unchanged++;
        continue;
      }

      // Собираем все сообщения клиента
      const fullConversation = lead.client.messages
        .filter((m) => !m.fromBot)
        .map((m) => m.message)
        .join('\n');

      if (!fullConversation.trim()) {
        unchanged++;
        continue;
      }

      // Применяем НОВУЮ логику парсинга
      const newResult = determineResultFixed(fullConversation);
      const oldResult = lead.botResult;

      if (newResult !== oldResult) {
        // Обновляем только если результат изменился
        await prisma.lead.update({
          where: { id: lead.id },
          data: { botResult: newResult },
        });

        changes.push({
          phone: lead.client.phone,
          old: oldResult || 'NULL',
          new: newResult || 'NULL',
        });

        updated++;
      } else {
        unchanged++;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ REPARSE COMPLETED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📈 Updated: ${updated}`);
    console.log(`📊 Unchanged: ${unchanged}`);
    console.log(`📞 Total: ${leads.length}\n`);

    if (changes.length > 0) {
      console.log('📋 CHANGES (first 20):');
      changes.slice(0, 20).forEach((c) => {
        console.log(`   ${c.phone}: ${c.old} → ${c.new}`);
      });
    }

    // Показываем новую статистику
    console.log('\n📊 NEW STATISTICS:');
    const stats = await prisma.lead.groupBy({
      by: ['botResult'],
      _count: true,
    });

    const total = stats.reduce((sum, s) => sum + s._count, 0);
    stats.forEach((s) => {
      const pct = ((s._count / total) * 100).toFixed(1);
      console.log(`   ${s.botResult || 'NULL'}: ${s._count} (${pct}%)`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('ERROR:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

/**
 * ПРАВИЛЬНАЯ ЛОГИКА ПАРСИНГА (идентична whatsapp-parser.service.ts)
 */
function determineResultFixed(fullConversation: string): 'BOOKED' | 'LOST' | 'UNKNOWN' | null {
  if (!fullConversation?.trim()) return null;

  // Разделяем на сообщения
  const rawLines = fullConversation
    .split(/\n|---/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lastRawLine = rawLines[rawLines.length - 1] ?? '';

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();

  const lastMessage = normalizeText(lastRawLine);
  const text = normalizeText(fullConversation);

  // Проверяем попытку записи
  const BOOKING_INTENT_PHRASES = [
    'жазылғым келеді', 'жазылгым келеді', 'жазылуға келдім', 'жазылуга келдим',
    'жазылып алайын', 'жазып қой', 'жазып кой', 'жазып қойыңыз', 'жазып койыңыз',
    'жазып беріңіз', 'жазып бериниз', 'мені жазып қойыңыз', 'мени жазып койыныз',
    'хочу записаться', 'хочу записатся', 'запишите меня', 'запишите на',
    'записывайте', 'записываюсь', 'я записываюсь', 'можно меня записать',
  ];

  let hasBookingIntent = false;
  for (const phrase of BOOKING_INTENT_PHRASES) {
    if (text.includes(phrase)) {
      hasBookingIntent = true;
      break;
    }
  }

  if (!hasBookingIntent) {
    return null;
  }

  // Пропускаем авто-рекламу
  const isAutoAd = (msg: string): boolean => {
    const txt = msg.toLowerCase();
    return /хочу записаться/i.test(txt) && /\d{3,4}\s*тг/i.test(txt);
  };

  const startIndex = rawLines.length > 0 && isAutoAd(rawLines[0]) ? 1 : 0;
  const realMessages = rawLines.slice(startIndex);

  if (realMessages.length === 0) {
    return null;
  }

  const last3Messages = realMessages.slice(-3);
  const last3Text = last3Messages.join(' | ').toLowerCase();
  const allText = rawLines.join(' ').toLowerCase();

  // 1. LOST: явный отказ в контексте
  const LOST_PATTERNS = [
    /не надо.*(не пишите|все на этом)/,
    /не нужно.*не нужно/,
    /отмените/,
    /передумал|передумала/,
    /(я|мы).*(уже была|были).*(недовольн|плохо)/,
    /не пишите.*все на этом/,
    /ну ладно.*другой раз/,
    /если поменяю решение/,
  ];

  for (const pattern of LOST_PATTERNS) {
    if (pattern.test(last3Text)) {
      return 'LOST';
    }
  }

  // 2. UNKNOWN: думает
  const UNKNOWN_PHRASES = [
    'ойланам', 'ойланайын', 'кейін айтам', 'кейін жазам',
    'я подумаю', 'подумаю', 'позже', 'потом', 'позже скажу', 'позже напишу',
  ];

  for (const p of UNKNOWN_PHRASES) {
    if (lastMessage.includes(p)) {
      return 'UNKNOWN';
    }
  }

  // 3. BOOKED: есть ВРЕМЯ или ПОДТВЕРЖДЕНИЕ
  const TIME_PATTERNS = [
    /\d{1,2}[:\.]\d{2}/,
    /в\s*\d{1,2}(?:\s|$|,)/,
    /\d{1,2}\.\d{1,2}/,
    /завтра|послезавтра|сегодня/,
    /ертең|ертен|бүгін|бугин/,
  ];

  const CONFIRMATION_PATTERNS = [
    /вот удобно/,
    /могу прийти/,
    /хорошо,?\s*приду/,
    /записывайте/,
    /жазыламын|жазып қой|жазып кой/,
    /приду/,
    /буду/,
  ];

  for (const pattern of TIME_PATTERNS) {
    if (pattern.test(allText)) {
      return 'BOOKED';
    }
  }

  for (const pattern of CONFIRMATION_PATTERNS) {
    if (pattern.test(allText)) {
      return 'BOOKED';
    }
  }

  // 4. UNKNOWN: думает (контекст)
  const UNKNOWN_PATTERNS_CONTEXT = [
    /вечером напишу/,
    /позже (скажу|напишу)/,
    /я подумаю/,
    /ойланам|ойланайын/,
  ];

  for (const pattern of UNKNOWN_PATTERNS_CONTEXT) {
    if (pattern.test(last3Text)) {
      return 'UNKNOWN';
    }
  }

  // По умолчанию: UNKNOWN (нет времени/подтверждения)
  return 'UNKNOWN';
}

// Запускаем
reparseAllLeads();
