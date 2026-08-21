#!/usr/bin/env tsx
/**
 * РУЧНОЙ ТЕСТ ПАРСЕРА
 * Проверь любой диалог и увидишь пошаговый анализ
 */

// ═══════════════════════════════════════════════════════════════════════════
// ВСТАВЬ СВОИ СООБЩЕНИЯ СЮДА:
// ═══════════════════════════════════════════════════════════════════════════

const TEST_DIALOG = [
  "ХОЧУ ЗАПИСАТЬСЯ НА МАССАЖ ЛИЦА 3990 ТГ",  // Message 1
  "Здравствуйте",                             // Message 2
  "18.00",                                    // Message 3
  "Нет",                                      // Message 4 (ответ на противопоказания)
];

// ═══════════════════════════════════════════════════════════════════════════
// ЛОГИКА ПАРСЕРА (копия из whatsapp-parser.service.ts)
// ═══════════════════════════════════════════════════════════════════════════

function determineResult(messages: string[]): string {
  console.log('\n🔍 ПОШАГОВЫЙ АНАЛИЗ:\n');
  console.log('═'.repeat(80));
  
  const fullText = messages.join('\n');
  const normalizeText = (t: string) => t.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  
  const text = normalizeText(fullText);
  const lastMessage = normalizeText(messages[messages.length - 1] || '');
  
  // ── STEP 1: BOOKING INTENT ──
  console.log('\n1️⃣ ПРОВЕРКА: Есть попытка записи? (BOOKING_INTENT)');
  
  const BOOKING_INTENT = [
    'хочу записаться', 'запишите меня', 'записывайте',
    'жазылғым келеді', 'жазып қойыңыз', 'жазып беріңіз',
  ];
  
  let hasIntent = false;
  for (const p of BOOKING_INTENT) {
    if (text.includes(p)) {
      console.log(`   ✅ НАЙДЕНО: "${p}"`);
      hasIntent = true;
      break;
    }
  }
  
  if (!hasIntent) {
    console.log('   ❌ НЕТ попытки записи');
    console.log('\n📊 РЕЗУЛЬТАТ: NULL (просто вопросы, не лид)\n');
    return 'NULL';
  }
  
  // ── STEP 2: LOST ──
  console.log('\n2️⃣ ПРОВЕРКА: Явный отказ в последних 3 сообщениях? (LOST)');
  
  const last3 = messages.slice(-3).join(' | ').toLowerCase();
  console.log(`   Last 3: "${last3.substring(0, 100)}..."`);
  
  const LOST_PATTERNS = [
    /не надо.*(не пишите|все на этом)/,
    /не нужно.*не нужно/,
    /отмените/,
    /келмеймін|келмеймин/,
    /бармаймын|бармаймин/,
    /керек емес/,
    /жазбаңыз|жазбаныз/,
  ];
  
  for (const pattern of LOST_PATTERNS) {
    if (pattern.test(last3)) {
      console.log(`   ✅ НАЙДЕН отказ: ${pattern}`);
      console.log('\n📊 РЕЗУЛЬТАТ: LOST (явный отказ)\n');
      return 'LOST';
    }
  }
  console.log('   ❌ Отказа НЕТ');
  
  // ── STEP 3: UNKNOWN ──
  console.log('\n3️⃣ ПРОВЕРКА: Думает/откладывает в последнем сообщении? (UNKNOWN)');
  console.log(`   Last message: "${lastMessage}"`);
  
  const UNKNOWN_PHRASES = [
    'я подумаю', 'подумаю', 'позже', 'потом',
    'ойланам', 'ойланайын', 'кейін айтам',
  ];
  
  for (const p of UNKNOWN_PHRASES) {
    if (lastMessage.includes(p)) {
      console.log(`   ✅ НАЙДЕНО: "${p}"`);
      console.log('\n📊 РЕЗУЛЬТАТ: UNKNOWN (думает)\n');
      return 'UNKNOWN';
    }
  }
  console.log('   ❌ Не думает');
  
  // ── STEP 4: BOOKED ──
  console.log('\n4️⃣ ПРОВЕРКА: Есть ВРЕМЯ или ПОДТВЕРЖДЕНИЕ во ВСЕХ сообщениях? (BOOKED)');
  console.log(`   All messages: "${text.substring(0, 150)}..."`);
  
  const TIME_PATTERNS = [
    /\d{1,2}[:\.]\d{2}/,
    /в\s*\d{1,2}(?:\s|$|,)/,
    /завтра|послезавтра|сегодня/,
    /ертең|ертен|бүгін|бугин/,
  ];
  
  for (const pattern of TIME_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`   ✅ НАЙДЕНО ВРЕМЯ: ${pattern}`);
      const match = text.match(pattern);
      console.log(`      Совпадение: "${match?.[0]}"`);
      console.log('\n📊 РЕЗУЛЬТАТ: BOOKED (есть время)\n');
      return 'BOOKED';
    }
  }
  
  const CONFIRMATION_PATTERNS = [
    /вот удобно/, /могу прийти/, /записывайте/, /приду/, /буду/,
    /\bда\b/, /\bия\b/, /\bиа\b/,
    /келемін|келемин/, /барамын|барамин/, /жақсы|жаксы/,
    /жазып қойыңыз|жазып койыныз/,
  ];
  
  for (const pattern of CONFIRMATION_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`   ✅ НАЙДЕНО ПОДТВЕРЖДЕНИЕ: ${pattern}`);
      console.log('\n📊 РЕЗУЛЬТАТ: BOOKED (есть подтверждение)\n');
      return 'BOOKED';
    }
  }
  
  console.log('   ❌ Времени НЕТ');
  console.log('   ❌ Подтверждения НЕТ');
  console.log('\n📊 РЕЗУЛЬТАТ: UNKNOWN (нет времени/подтверждения)\n');
  return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// ЗАПУСК ТЕСТА
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n📋 ТЕСТОВЫЙ ДИАЛОГ:\n');
TEST_DIALOG.forEach((msg, i) => {
  console.log(`[${i + 1}] "${msg}"`);
});

const result = determineResult(TEST_DIALOG);

console.log('═'.repeat(80));
console.log(`\n🎯 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ: ${result}\n`);
