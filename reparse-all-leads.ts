/**
 * REPARSE ALL LEADS
 * Пересчитывает botResult для ВСЕХ существующих лидов с новой логикой
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Копия determineResult() из whatsapp-parser.service.ts
function determineResult(fullConversation: string): 'BOOKED' | 'LOST' | 'UNKNOWN' | null {
  if (!fullConversation?.trim()) return null;

  const rawLines = fullConversation
    .split(/\n|---/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lastRawLine = rawLines[rawLines.length - 1] ?? '';

  const normalizeResultText = (value: string) =>
    value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();

  const lastMessage = normalizeResultText(lastRawLine);
  const text = normalizeResultText(fullConversation);

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
      break;
    }
  }

  // Если НЕТ попытки записи → return null
  if (!hasBookingIntent) {
    return null;
  }

  // ── STEP 2: Была попытка записи → проверяем lastMessage ───────────────
  // ── 2.1. LOST в последнем сообщении ──────────────────
  const LOST_PHRASES_SAFE = [
    // КАЗАХСКИЙ
    'бармаймын', 'бармайм', 'бармаим',
    'келмеймін', 'келмейм', 'келмим',
    'керек емес', 'керек жоқ', 'керек жок',
    'қымбат екен', 'кымбат екен',
    'ойымнан қайттым', 'ойымнан кайттым',
    'қаламаймын', 'каламаймын',
    'жоқ, керек емес', 'жок, керек емес',
    // РУССКИЙ
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
      return 'LOST';
    }
  }

  if (/\bне\s+подходит/.test(lastMessage) || lastMessage.startsWith('не подходит')) {
    return 'LOST';
  }
  
  if (/\bмне\s+не\s+подходит/.test(lastMessage)) {
    return 'LOST';
  }

  const kzShortLost = ['жоқ', 'жок', 'қымбат', 'кымбат'];
  for (const p of kzShortLost) {
    const cleaned = lastMessage.replace(/[.,!?]/g, '').trim();
    if (cleaned === p || cleaned.startsWith(p + ' ') || cleaned.endsWith(' ' + p)) {
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
      return 'UNKNOWN';
    }
  }

  // ── 2.3. BOOKED в последнем сообщении ────────────────────────────────────
  const BOOKED_PHRASES = [
    // КАЗАХСКИЙ — ХОЧУ ЗАПИСАТЬСЯ
    'жазылғым келеді', 'жазылгым келеді', 'жазылғым келед', 'жазылгым келед',
    'жазылғым келіп тұр', 'жазылгым келіп тур', 'жазылгым келип тур',
    'жазылуға келдім', 'жазылуга келдим',
    'жазылып алайын', 'жазылып алайыншы',
    'жазылып қояйын', 'жазылып кояйын',
    'жазып қояйын', 'жазып кояйын',
    // ЖАЗЫП ҚОЮ
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
    // ДАТА + ЗАПИСЬ
    'ертеңге жаза беріңіз', 'ертенге жаза бериниз',
    'ертеңге жазып қойыңыз', 'ертенге жазып койыныз',
    'ертеңге жазып қой', 'ертенге жазып кой',
    'бүгінге жазып қойыңыз', 'бугинге жазып койыныз',
    'сол күнге жазып қойыңыз', 'сол кунге жазып койыныз',
    // ВРЕМЯ + ЗАПИСЬ
    'ге жазып қойыңыз', 'ге жазып койыныз',
    'ке жазып қой', 'ке жазып кой',
    // ПОДТВЕРЖДЕНИЕ С КОНТЕКСТОМ
    'барамын, жаз', 'келемін, жаз',
    'иа, жазып', 'иә, жазып', 'да, жазып', 'ия, жазып',
    'барамын, запишите', 'келемін, запишите',
    // РУССКИЙ — ХОЧУ ЗАПИСАТЬСЯ
    'хочу записаться', 'хочу записаться на', 'хочу записаться к',
    'хочу записаться завтра', 'хочу записаться сегодня',
    'хочу записаться к вам', 'хочу записаться на процедуру',
    'хочу записаться на приём', 'хочу записаться на прием',
    // РУССКИЙ — ЗАПИШИТЕ (EXPLICIT)
    'запишите меня', 'запишите на', 'записывайте', 'записываюсь',
    'я записываюсь', 'подтверждаю запись',
    'да, записывайте', 'да, запишите',
    'можно меня записать',
    'запишите пожалуйста', 'запишите, пожалуйста',
    // РУССКИЙ — ПРИДУ
    'приеду на', 'я приду', 'буду завтра', 'буду сегодня',
  ];

  for (const p of BOOKED_PHRASES) {
    if (lastMessage.includes(p)) {
      return 'BOOKED';
    }
  }

  const timeBookingPatterns = [
    /сағат\s+\d+[:\-]?\d*\s*(ке|ге)\s*(жаз|жазып)/i,
    /\d+[:\-]\d+\s*(ке|ге)\s*(жаз|жазып)/i,
  ];
  for (const pattern of timeBookingPatterns) {
    if (lastMessage.match(pattern)) {
      return 'BOOKED';
    }
  }

  // ── 2.4. EDGE CASE: Короткий ответ ПОСЛЕ отказа в предпоследнем ─────────
  const SHORT_ANSWERS = ['иа', 'ия', 'ок', 'ok', 'жақсы', 'жаксы'];
  const lastTrimmed = lastMessage.replace(/[.,!?]/g, '').trim();
  
  if (SHORT_ANSWERS.includes(lastTrimmed) && rawLines.length >= 2) {
    const secondLastRawLine = rawLines[rawLines.length - 2] ?? '';
    const secondLastMessage = normalizeResultText(secondLastRawLine);
    
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
    
    const secondLastTrimmed = secondLastMessage.replace(/[.,!?]/g, '').trim();
    if (secondLastTrimmed === 'жоқ' || secondLastTrimmed === 'жок') {
      hasRefusalInSecondLast = true;
    }
    
    if (hasRefusalInSecondLast) {
      return 'LOST';
    }
  }

  // ── 2.5. Была попытка, но lastMessage нейтральное → BOOKED (по умолчанию) ──
  return 'BOOKED';
}

async function reparseAllLeads() {
  console.log('\n🔄 REPARSE ALL LEADS - НОВАЯ ЛОГИКА\n');
  console.log('═'.repeat(80));

  const leads = await prisma.lead.findMany({
    include: {
      client: {
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n📊 Найдено лидов: ${leads.length}`);

  let stats = {
    total: leads.length,
    updated: 0,
    unchanged: 0,
    // Changes
    nullToBooked: 0,
    lostToBooked: 0,
    unknownToBooked: 0,
    lostToNull: 0,
    unknownToNull: 0,
    bookedToLost: 0,
    bookedToNull: 0,
  };

  for (const lead of leads) {
    const msgs = lead.client.messages;
    const fullConv = msgs.map(m => m.message).join('\n');
    
    const oldResult = lead.botResult;
    const newResult = determineResult(fullConv);

    if (oldResult !== newResult) {
      stats.updated++;
      
      // Track specific changes
      if (oldResult === null && newResult === 'BOOKED') stats.nullToBooked++;
      else if (oldResult === 'LOST' && newResult === 'BOOKED') stats.lostToBooked++;
      else if (oldResult === 'UNKNOWN' && newResult === 'BOOKED') stats.unknownToBooked++;
      else if (oldResult === 'LOST' && newResult === null) stats.lostToNull++;
      else if (oldResult === 'UNKNOWN' && newResult === null) stats.unknownToNull++;
      else if (oldResult === 'BOOKED' && newResult === 'LOST') stats.bookedToLost++;
      else if (oldResult === 'BOOKED' && newResult === null) stats.bookedToNull++;

      // Update DB
      await prisma.lead.update({
        where: { id: lead.id },
        data: { botResult: newResult }
      });

      // Log first 10 changes
      if (stats.updated <= 10) {
        console.log(`\n  ✏️  ${lead.client.whatsappName} | ${lead.client.phone}`);
        console.log(`      ${oldResult || 'null'} → ${newResult || 'null'}`);
      }
    } else {
      stats.unchanged++;
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 ИТОГ:');
  console.log(`   Обновлено:    ${stats.updated}`);
  console.log(`   Без изменений: ${stats.unchanged}`);
  console.log('');
  console.log('📈 ИЗМЕНЕНИЯ:');
  if (stats.nullToBooked > 0) console.log(`   null → BOOKED:     ${stats.nullToBooked}`);
  if (stats.lostToBooked > 0) console.log(`   LOST → BOOKED:     ${stats.lostToBooked} ⭐ (КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ)`);
  if (stats.unknownToBooked > 0) console.log(`   UNKNOWN → BOOKED:  ${stats.unknownToBooked}`);
  if (stats.lostToNull > 0) console.log(`   LOST → null:       ${stats.lostToNull} ✅ (убраны ложные LOST)`);
  if (stats.unknownToNull > 0) console.log(`   UNKNOWN → null:    ${stats.unknownToNull} ✅ (убраны ложные UNKNOWN)`);
  if (stats.bookedToLost > 0) console.log(`   BOOKED → LOST:     ${stats.bookedToLost}`);
  if (stats.bookedToNull > 0) console.log(`   BOOKED → null:     ${stats.bookedToNull}`);
  console.log('\n' + '═'.repeat(80));

  await prisma.$disconnect();
}

reparseAllLeads().catch(console.error);
