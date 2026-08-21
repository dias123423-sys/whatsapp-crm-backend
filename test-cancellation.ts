// Тестирование определения отмены (LOST)

function determineBotResult(originalMessage: string): 'BOOKED' | 'LOST' | 'UNKNOWN' | null {
  if (!originalMessage) return null;
  
  const rawLines = originalMessage.split(/\n---\n|\n/).filter(l => l.trim().length > 0);
  const lastMessage = rawLines[rawLines.length - 1]?.toLowerCase() || '';
  
  const isAutoAd = (msg: string): boolean => {
    const txt = msg.toLowerCase();
    return /хочу записаться/i.test(txt) && /\d{3,4}\s*тг/i.test(txt);
  };
  
  const startIndex = rawLines.length > 0 && isAutoAd(rawLines[0]) ? 1 : 0;
  const realMessages = rawLines.slice(startIndex);
  const last2Messages = realMessages.slice(-2);
  const last2Text = last2Messages.join(' ').toLowerCase();
  
  if (realMessages.length === 0) {
    console.log(`⚪ NULL | only auto-ad, no real client messages`);
    return null;
  }
  
  const last3Messages = rawLines.slice(-3);
  const last3Text = last3Messages.join(' | ').toLowerCase();
  const allText = rawLines.join(' ').toLowerCase();
  
  // ── LOST: явный отказ ──
  const LOST_PATTERNS = [
    /не надо.*(не пишите|все на этом)/,
    /не нужно.*не нужно/,
    /отмените/,
    /передумал|передумала/,
    /(я|мы).*(уже была|были).*(недовольн|плохо)/,
    /не пишите.*все на этом/,
    /ну ладно.*другой раз/,
    /если поменяю решение/,
    /не получится.*на работу/,
    /не получиться.*на работу/,
    /на работу вызвали/,
    /пусть кому.?то повезёт/,
    /пусть кому.?то повезет/,
    /келмеймін|келмеймин/,
    /бармаймын|бармаймин/,
    /керек емес/,
    /қолым бос емес|колым бос емес/,
    /қажет емес|кажет емес/,
    /жазбаңыз|жазбаныз/,
  ];
  
  for (const pattern of LOST_PATTERNS) {
    if (pattern.test(last3Text)) {
      console.log(`❌ LOST | refusal pattern in last 3: ${pattern}`);
      return 'LOST';
    }
  }
  
  // ── UNKNOWN ──
  const UNKNOWN_PHRASES = [
    'ойланам', 'ойланайын', 'ойланып алайын',
    'кейін айтам', 'кейін жазам', 'кейин айтам', 'кейин жазам',
    'білмеймін', 'білмим', 'билмеймин', 'билмим',
    'ақылдасам', 'ақылдасып алайын', 'акылдасам',
    'я подумаю', 'подумаю', 'надо подумать',
    'позже', 'потом', 'позже скажу', 'позже напишу',
    'ещё не знаю', 'еще не знаю',
  ];
  
  for (const p of UNKNOWN_PHRASES) {
    if (lastMessage.includes(p)) {
      console.log(`⏳ UNKNOWN | thinking in last message: "${p}"`);
      return 'UNKNOWN';
    }
  }
  
  // ── BOOKED: время или подтверждение ──
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
    /келемін|келемин/,
    /барамын|барамин/,
    /келеді|келеди/,
    /жақсы|жаксы/,
    /жазып қойыңыз|жазып койыныз/,
    /жазып беріңіз|жазып бериниз/,
    /\bда\b/,
    /\bия\b/,
    /\bиа\b/,
  ];
  
  let hasTime = false;
  let hasConfirmation = false;
  
  for (const pattern of TIME_PATTERNS) {
    if (pattern.test(allText)) {
      hasTime = true;
      console.log(`⏰ Time/date found: ${pattern}`);
      break;
    }
  }
  
  for (const pattern of CONFIRMATION_PATTERNS) {
    if (pattern.test(allText)) {
      hasConfirmation = true;
      console.log(`✅ Confirmation found: ${pattern}`);
      break;
    }
  }
  
  if (hasTime && hasConfirmation) {
    console.log(`✅ BOOKED | time + confirmation`);
    return 'BOOKED';
  }
  
  console.log(`⚪ NULL | no booking intent`);
  return null;
}

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 1: Олеся (отмена)
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ ТЕСТ 1: ОЛЕСЯ (ОТМЕНА) ═══\n');

const olesyaMessages = `Здравствуйте! Хочу получить скульптурный массаж + спа лица по акции за 3990 тг
---
Мартукский район поселок Жайсан
---
Олеся
---
Сегодня не получится
---
Завтра 12:00
---
45
---
Делала ботокс
---
В мае
---
Всего остального нет
---
Отмените не получиться на завтра
---
На работу вызвали
---
Ладно пусть кому то повезёт`;

const result1 = determineBotResult(olesyaMessages);
console.log(`\nРезультат: ${result1 || 'NULL'}`);
console.log(`Ожидалось: LOST`);
console.log(`Тест: ${result1 === 'LOST' ? '✅ PASSED' : '❌ FAILED'}\n`);

// ══════════════════════════════════════════════════════════════════
// ТЕСТ 2: Успешная запись (для сравнения)
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ ТЕСТ 2: УСПЕШНАЯ ЗАПИСЬ ═══\n');

const successMessages = `ХОЧУ ЗАПИСАТЬСЯ НА ОЗОН КАПЕЛЬНИЦУ + БРТ ВСЕГО ЗА 4990 ТГ
---
Где это находится
---
Хочу узнать поподробнее
---
Актобе
---
Я хотела подойти к Вам в сентябре
---
Сейчас на работе`;

const result2 = determineBotResult(successMessages);
console.log(`\nРезультат: ${result2 || 'NULL'}`);
console.log(`Ожидалось: NULL или UNKNOWN`);
console.log(`Тест: ${result2 !== 'LOST' ? '✅ PASSED' : '❌ FAILED'}\n`);
