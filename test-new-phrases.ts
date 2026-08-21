// Тестирование новых фраз

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
  
  if (realMessages.length === 0) return null;
  
  const last3Messages = rawLines.slice(-3);
  const last3Text = last3Messages.join(' | ').toLowerCase();
  const allText = rawLines.join(' ').toLowerCase();
  
  // ── LOST ──
  const LOST_PATTERNS = [
    /не надо.*(не пишите|все на этом)/,
    /не нужно.*не нужно/,
    /отмените/,
    /передумал|передумала/,
    /не получится.*на работу/,
    /не получиться.*на работу/,
    /на работу вызвали/,
    /пусть кому.?то повезёт/,
    /пусть кому.?то повезет/,
    /не беспокоит/,
    /менеджер.{0,10}рыбак/,
    /не смогу(?!.*завтра|послезавтра)/,
    /керек емес/,
  ];
  
  for (const pattern of LOST_PATTERNS) {
    if (pattern.test(last3Text)) {
      console.log(`❌ LOST | pattern: ${pattern}`);
      return 'LOST';
    }
  }
  
  // ── UNKNOWN фразы ──
  const UNKNOWN_PHRASES = [
    'я подумаю', 'подумаю', 'надо подумать',
    'позже', 'потом', 'позже скажу', 'позже напишу',
    'ещё не знаю', 'еще не знаю',
    'повременю',
    'на работе',
    'пока не могу',
  ];
  
  for (const p of UNKNOWN_PHRASES) {
    if (lastMessage.includes(p)) {
      console.log(`⏳ UNKNOWN | phrase: "${p}"`);
      return 'UNKNOWN';
    }
  }
  
  // ── UNKNOWN: будущее ──
  if (/в\s+(сентябр|октябр|ноябр|декабр)/i.test(lastMessage)) {
    console.log(`⏳ UNKNOWN | future month`);
    return 'UNKNOWN';
  }
  
  // ── UNKNOWN: "пока" в начале ──
  if (/^пока[,\s\.]/i.test(lastMessage.trim())) {
    console.log(`⏳ UNKNOWN | "пока" at start`);
    return 'UNKNOWN';
  }
  
  console.log(`⚪ NULL`);
  return null;
}

const testCases = [
  {
    name: 'Солнце - не смогу на работе',
    text: `Здравствуйте! Хочу получить скульптурный массаж + спа лица по акции за 3990 тг
---
Скажите пожалуйста, а сколько по времени занимает эта процедура?
---
Актобе
---
Я сегодня не смогу. На работе до 18ч`,
    expected: 'LOST or UNKNOWN'
  },
  {
    name: 'Пока, повременю',
    text: 'Пока, повременю.',
    expected: 'UNKNOWN'
  },
  {
    name: 'Tina - не беспокоит',
    text: `ХОЧУ ЗАПИСАТЬСЯ ПОДТЯЖКУ ЛИЦА ВСЕГО ЗА 3990 ТГ
---
Гость
---
Ясная политика, пусть не беспокоит меня ваши менеджеры- "рыбаки"!`,
    expected: 'LOST'
  },
  {
    name: 'Роза - в сентябре',
    text: `ХОЧУ ЗАПИСАТЬСЯ НА ОЗОН КАПЕЛЬНИЦУ + БРТ ВСЕГО ЗА 4990 ТГ
---
Где это находится
---
Хочу узнать поподробнее
---
Актобе
---
Я хотела подойти к. Вам в сентябре
---
Сейчас на работе`,
    expected: 'UNKNOWN'
  },
  {
    name: 'Керек емес',
    text: `ХОЧУ ЗАПИСАТЬСЯ
---
Жоқ, рахмет керек емес`,
    expected: 'LOST'
  },
];

console.log('\n=== ТЕСТИРОВАНИЕ НОВЫХ ФРАЗ ===\n');

let passed = 0;
testCases.forEach((tc, i) => {
  console.log(`${i+1}. ${tc.name}`);
  console.log(`   Expected: ${tc.expected}`);
  const result = determineBotResult(tc.text);
  console.log(`   Result: ${result || 'NULL'}`);
  
  const success = 
    (tc.expected.includes('LOST') && result === 'LOST') ||
    (tc.expected.includes('UNKNOWN') && result === 'UNKNOWN') ||
    tc.expected === result;
  
  if (success) {
    console.log(`   ✅ PASS\n`);
    passed++;
  } else {
    console.log(`   ❌ FAIL\n`);
  }
});

console.log(`\n📊 Результат: ${passed}/${testCases.length} тестов прошло\n`);
