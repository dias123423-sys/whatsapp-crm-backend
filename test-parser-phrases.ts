/**
 * PARSER PHRASE TEST
 * Проверяет determineResult() logic локально без DB
 * - LONG messages
 * - MULTI-MESSAGE scenarios (BOOKED → LOST → BOOKED)
 * - ANTI-COLLISION (questions, not confirmations)
 */

// ════════════════════════════════════════════════════════════
// MOCK determineResult
// ════════════════════════════════════════════════════════════

function determineResult(fullConversation: string): 'BOOKED' | 'LOST' | 'UNKNOWN' | null {
  if (!fullConversation?.trim()) return null;

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
  // Проверяем, была ли ПОПЫТКА ЗАПИСИ в истории
  // Если НЕТ → return null (игнорируем LOST/UNKNOWN)
  // Если ДА → проверяем lastMessage → LOST/UNKNOWN/BOOKED
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
      break;
    }
  }

  // Если НЕТ попытки записи → return null (просто вопросы, не лид)
  if (!hasBookingIntent) {
    return null;
  }

  // ── STEP 2: Была попытка записи → проверяем lastMessage ───────────────
  // ── 2.1. LOST в последнем сообщении (ВЫСШИЙ ПРИОРИТЕТ) ──────────────────
  // ВАЖНО: Избегаем false positives типа "мне подходит" → "не подходит"
  
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
      return 'LOST';
    }
  }

  // Проверяем "не подходит" с word boundary (избегаем "мне подходит")
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

    // ВРЕМЯ + ЗАПИСЬ (частичные паттерны)
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
    'можно меня записать', // EXPLICIT
    'запишите пожалуйста', 'запишите, пожалуйста',

    // РУССКИЙ — ПРИДУ
    'приеду на', 'я приду', 'буду завтра', 'буду сегодня',
  ];

  // Сначала проверяем BOOKED в lastMessage (последнее сообщение = приоритет)
  for (const p of BOOKED_PHRASES) {
    if (lastMessage.includes(p)) {
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
  // Клиент пытался записаться, lastMessage не содержит явного LOST/UNKNOWN/BOOKED
  // → Считаем контакт установленным, оператор должен работать с ним
  return 'BOOKED';
}

// ════════════════════════════════════════════════════════════
// TEST CASES
// ════════════════════════════════════════════════════════════

const tests: Array<{ text: string; expected: 'BOOKED' | 'LOST' | 'UNKNOWN' | null }> = [
  // ══════════════════════════════════════════════════════════
  // BOOKED — КАЗАХСКИЙ
  // ══════════════════════════════════════════════════════════
  { text: 'жазылғым келеді', expected: 'BOOKED' },
  { text: 'жазылгым келед', expected: 'BOOKED' },
  { text: 'жазып қойыныз', expected: 'BOOKED' },
  { text: 'жазып койыныз', expected: 'BOOKED' },
  { text: 'жазып қойыңыз', expected: 'BOOKED' },
  { text: 'ертеңге жаза бериниз', expected: 'BOOKED' },
  { text: 'жазып қояйын', expected: 'BOOKED' },
  { text: 'жазылып алайын', expected: 'BOOKED' },
  { text: 'сағат 4-ке жазып қойыңыз', expected: 'BOOKED' },
  { text: '16:00-ге жазып қой', expected: 'BOOKED' },
  { text: 'мені жазып қойыңыз', expected: 'BOOKED' },
  { text: 'жазып қоя аласыз ба', expected: 'BOOKED' },

  // ══════════════════════════════════════════════════════════
  // BOOKED — РУССКИЙ SHORT
  // ══════════════════════════════════════════════════════════
  { text: 'хочу записаться', expected: 'BOOKED' },
  { text: 'хочу записаться на подтяжку лица', expected: 'BOOKED' },
  { text: 'запишите меня', expected: 'BOOKED' },
  { text: 'да, записывайте', expected: 'BOOKED' },
  { text: 'можно меня записать', expected: 'BOOKED' },
  { text: 'можно записаться', expected: null }, // ВОПРОС, не подтверждение!

  // ══════════════════════════════════════════════════════════
  // BOOKED — РУССКИЙ LONG (КРИТИЧЕСКИЙ ТЕСТ!)
  // ══════════════════════════════════════════════════════════
  { text: 'ХОЧУ ЗАПИСАТЬСЯ ПОДТЯЖКУ ЛИЦА ВСЕГО ЗА 3990 ТГ', expected: 'BOOKED' },
  { text: 'Здравствуйте, хочу записаться на процедуру', expected: 'BOOKED' },
  { text: 'Здравствуйте! Хочу записаться на подтяжку лица всего за 3990', expected: 'BOOKED' },
  { text: 'Можно меня записать на завтра?', expected: 'BOOKED' },
  { text: 'Мне всё подходит, запишите меня пожалуйста', expected: 'BOOKED' },

  // ══════════════════════════════════════════════════════════
  // BOOKED — КАЗАХСКИЙ LONG
  // ══════════════════════════════════════════════════════════
  { text: 'Сәлеметсіз бе, ертеңге жазып қоя аласыз ба?', expected: 'BOOKED' },
  { text: 'Здравствуйте! Хочу записаться на приём и узнать всё о здоровье', expected: 'BOOKED' },

  // ══════════════════════════════════════════════════════════
  // LOST (ТОЛЬКО ПОСЛЕ "хочу записаться"!)
  // ══════════════════════════════════════════════════════════
  { text: 'Хочу записаться\nбармайм', expected: 'LOST' },
  { text: 'Хочу записаться\nқымбат', expected: 'LOST' },
  { text: 'Хочу записаться\nжоқ', expected: 'LOST' },
  { text: 'Хочу записаться\nне буду', expected: 'LOST' },
  { text: 'Хочу записаться\nдорого', expected: 'LOST' },
  { text: 'Хочу записаться\nпередумала', expected: 'LOST' },

  // ══════════════════════════════════════════════════════════
  // UNKNOWN (ТОЛЬКО ПОСЛЕ "хочу записаться"!)
  // ══════════════════════════════════════════════════════════
  { text: 'Хочу записаться\nойланам', expected: 'UNKNOWN' },
  { text: 'Хочу записаться\nподумаю', expected: 'UNKNOWN' },
  { text: 'Хочу записаться\nпотом', expected: 'UNKNOWN' },
  { text: 'Хочу записаться\nкейін айтам', expected: 'UNKNOWN' },

  // ══════════════════════════════════════════════════════════
  // NULL / NEUTRAL (short replies, questions)
  // ══════════════════════════════════════════════════════════
  { text: 'иа', expected: null },
  { text: 'да', expected: null },
  { text: 'барам', expected: null },
  { text: 'келем', expected: null },
  { text: 'Привет! Можно узнать об этом подробнее?', expected: null },

  // ══════════════════════════════════════════════════════════
  // ANTI-COLLISION (НЕ ДОЛЖНО БЫТЬ BOOKED!)
  // ══════════════════════════════════════════════════════════
  { text: 'сағат нешеде?', expected: null },
  { text: 'қай уақытта?', expected: null },
  { text: 'жазу туралы сұрайын', expected: null },
  { text: 'можно узнать про запись?', expected: null },
  { text: 'что нужно для записи?', expected: null },

  // ══════════════════════════════════════════════════════════
  // MULTI-MESSAGE SCENARIOS (КРИТИЧЕСКИЙ ТЕСТ!)
  // ══════════════════════════════════════════════════════════
  // Scenario A: BOOKED → LOST
  { text: 'Хочу записаться', expected: 'BOOKED' },
  { text: 'Хочу записаться\nДорого, не буду', expected: 'LOST' },
  
  // Scenario B: BOOKED → UNKNOWN
  { text: 'Хочу записаться\nЯ подумаю', expected: 'UNKNOWN' },
  
  // Scenario C: BOOKED → LOST → BOOKED
  { text: 'Хочу записаться\nДорого\nЛадно, записывайте', expected: 'BOOKED' },
  
  // Scenario D: BOOKED → neutral reply (БЫЛА попытка → BOOKED по умолчанию)
  { text: 'Хочу записаться\nСпасибо', expected: 'BOOKED' },
  { text: 'Хочу записаться\nОк', expected: 'BOOKED' },
  
  // Scenario E: BOOKED → отказ → короткий ответ (EDGE CASE!)
  { text: 'Хочу записаться\nне успею\nиа', expected: 'LOST' },
  { text: 'Хочу записаться\nжоқ\nок', expected: 'LOST' },
  { text: 'Хочу записаться\nдорого\nия', expected: 'LOST' },
  { text: 'Хочу записаться\nкерек емес\nжақсы', expected: 'LOST' },
  
  // Scenario E: Time pattern после BOOKED
  { text: 'сағат 4-ке жазып қойыңыз', expected: 'BOOKED' },

  // ── Scenario F: CITY CLARIFICATION (клиент из другого города) ──
  { text: 'Хочу записаться на массаж лица 3990 тг\nЗдравствуйте. Я проживаю в г.Актобе\nЕлена', expected: 'UNKNOWN' },
  { text: 'Хочу записаться\nЯ из Шымкента', expected: 'UNKNOWN' },
  { text: 'Жазылғым келеді\nМен Қарағандыда тұрамын', expected: 'UNKNOWN' },
  { text: 'Хочу записаться\nЯ живу в Алматы', expected: 'BOOKED' }, // Алматы = наш город
];

// ════════════════════════════════════════════════════════════
// RUN TESTS
// ════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════');
console.log('  RESULT PARSER TEST — LONG + SHORT + ANTI-COLLISION');
console.log('═══════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

tests.forEach(({ text, expected }, idx) => {
  const result = determineResult(text);
  const ok = result === expected;

  if (ok) {
    passed++;
    console.log(`✅ Test ${idx + 1}: "${text}" → ${result}`);
  } else {
    failed++;
    console.log(`❌ Test ${idx + 1}: "${text}"`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Got:      ${result}`);
  }
});

console.log('\n═══════════════════════════════════════════════════');
console.log(`  PASSED: ${passed} / ${tests.length}`);
console.log(`  FAILED: ${failed}`);
console.log('═══════════════════════════════════════════════════');

if (failed > 0) {
  process.exit(1);
}
