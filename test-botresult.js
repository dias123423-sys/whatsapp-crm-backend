const BOOKING_KZ = [
  /жазай[ыи]н\s*(ба|бе)\??/,
  /жазай[ыи]қ\s*(па|пе)\??/,
  /жазып\s*қояй[ыи]н\s*(ба|бе)\??/,
  /жазып\s*қоям[ыы]з\s*(ба|бе)\??/,
  /жазып\s*қоя[ыи]н/,
  /жазылу[ғг]а\s*болады\s*(ма|ме)\??/,
  /жазылас[ыи]з\s*(ба|бе)\??/,
  /жазылам[ыы]з\s*(ба|бе)\??/,
  /белгілей[іи]н\s*(бе|ба)\??/,
  /белгілеп\s*қояй[ыи]н\s*(ба|бе)\??/,
  /белгілеп\s*қоя[ыи]н/,
  /сізді?\s*(жазай[ыи]н|жазып|белгілей[іи]н)/,
  /қай\s+(күн[ге]*|уақыт[қа]*)\s*жазай[ыи]қ/,
  /жаза\s*ала[мы]+з\s*(ба|бе)\??/,
  /жазылғ[ыіі]ңыз\s*келе\s*(ме|ма)\??/,
];
const BOOKING_RU = [
  /записать\s+вас/, /вас\s+записать/, /запишем\s+вас/,
  /вас\s+запишем/, /записываем\s+вас/, /вас\s+записываем/,
  /мо[гж][уы]\s+вас\s+записать/, /можно\s+вас\s+записать/,
  /хотите\s+записаться/, /хотите\s+оформить\s+запись/,
  /оформить\s+запись/, /оформим\s+запись/, /оформляем\s+запись/,
  /забронировать\s+вам\s+врем/, /забронировать\s+время/,
  /записать\s+на\s+(завтра|сегодня|прием|процедур|\d)/,
  /на\s+какое\s+время\s+вас\s+записать/,
  /когда\s+вас\s+записать/, /подтвердить\s+запись/,
];
const PRICE_KZ = [
  /бағасы\s*\d/, /бағасы\s*(қандай|қанша|неше|ма|ме)\??/,
  /қанша\s+тұрады\??/, /\d+\s*(теңге|тнг|тг)\s*(ма|ме|па|ба)\??/,
];
const PRICE_RU = [
  /цена\s*\d/, /стоимость\s*\d/, /сколько\s+стоит\??/,
  /стоит\s+\d/, /(цена|стоимость).{0,20}\?/,
];

function detectIntent(msg) {
  const t = msg.toLowerCase().replace(/ё/g, 'е');
  for (const re of BOOKING_KZ) if (re.test(t)) return 'BOOKING_REQUEST';
  for (const re of BOOKING_RU) if (re.test(t)) return 'BOOKING_REQUEST';
  for (const re of PRICE_KZ)   if (re.test(t)) return 'PRICE_QUESTION';
  for (const re of PRICE_RU)   if (re.test(t)) return 'PRICE_QUESTION';
  if (/қай\s+(күн|күні)|какой\s+день|когда\s+вам\s+удобно/.test(t)) return 'DATE_QUESTION';
  if (/қай\s+уақыт|сағат\s+неше|какое\s+время\s+вам/.test(t)) return 'TIME_QUESTION';
  if (t.length > 0) return 'GENERAL_INFO';
  return 'UNKNOWN';
}

function isStrongBooking(line) {
  const phrases = [
    'жазып қойыңыз','жазып коюыныз','жазып койыныз','жазып қойыныз',
    'жазып алыңыз','жазылдым','жазып қой','жазып кой',
    'барамын, жаз','келемін, жаз',
    'иа, жазып','иә, жазып','да, жазып','ия, жазып',
    'да, запишите','барамын, запишите','келемін, запишите',
    'запишите меня','запишите на','записывайте','записываюсь',
    'я записываюсь','подтверждаю запись',
    'приеду на','я приду','приду в','приеду в',
    'буду завтра','буду сегодня',
  ];
  return phrases.some(function(p) { return line.includes(p); });
}
function isLost(line) {
  const p = [
    'жоқ','жок','бармаймын','бармайм','бармаим','бармай',
    'келмеймін','келмейм','келмим','керек емес','керек жоқ',
    'қымбат','қымбат екен','кымбат','ойымнан қайттым','қаламаймын',
    'жоқ, керек емес',
    'не буду','не хочу','не приду','передумала','передумал',
    'не интересно','не нужно','не надо','спасибо не надо',
    'не подходит','дорого','слишком дорого','нет спасибо',
  ];
  return p.some(function(ph) { return line.includes(ph); });
}
function isInProgress(line) {
  const p = [
    'ойланам','ойланайын','ойланып алайын','кейін','кейин',
    'кейін айтам','кейін жазам','білмеймін','білмим','ақылдасам',
    'ақылдасып алайын','я подумаю','подумаю','надо подумать',
    'позже','потом','ещё не знаю',
  ];
  return p.some(function(ph) { return line.includes(ph); });
}
function isWeakAgreement(line) {
  var trimmed = line.trim().replace(/[,.!?]$/, '');
  var exact = ['иа','иә','ия','иаа','ха','барам','барамын','келем','келемін','келемн',
    'болады','бола берсін','жарайды','мақұл','ок','окей','ok','okay',
    'да','хорошо','давайте','ладно'];
  if (exact.indexOf(trimmed) !== -1) return true;
  if (/^(иа|иә|ия)\s+(болады|жарайды|мақұл|барам|келем|ок)/.test(trimmed)) return true;
  if (/^(барам|келем)(ын|ін)?\s+(жарайды|болады|мақұл|ок)/.test(trimmed)) return true;
  return false;
}
function hasDateTime(text) {
  return /\b(ертең|ертен|ертеңге|бүгін|бугін|жұма|сенбі|дүйсенбі)\b/.test(text) ||
    /\b(завтра|сегодня|послезавтра|понедельник|пятницу|субботу)\b/.test(text) ||
    /в\s+\d{1,2}(:\d{2})?/.test(text) ||
    /\b\d{1,2}:\d{2}\b/.test(text) ||
    /сағат\s+\d/.test(text);
}

function determineBotResult(messages, lastClientMsg) {
  var lastMsg = lastClientMsg.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  var fullText = messages.map(function(m) { return m.message; }).join('\n');

  if (isStrongBooking(lastMsg)) return { result: 'BOOKED', reason: 'strong_booking_phrase' };
  if (isLost(lastMsg))          return { result: 'LOST',   reason: 'explicit_refusal' };
  if (isInProgress(lastMsg))    return { result: 'IN_PROGRESS', reason: 'thinking_response' };

  var outgoing = messages.filter(function(m) { return m.direction === 'OUTGOING'; });
  var lastBot  = outgoing.length > 0 ? outgoing[outgoing.length - 1].message : '';

  if (lastBot) {
    var intent = detectIntent(lastBot);
    if (intent === 'BOOKING_REQUEST') {
      if (isWeakAgreement(lastMsg)) return { result: 'BOOKED',      reason: 'weak_agreement+BOOKING_REQUEST', intent: intent };
      if (hasDateTime(lastMsg))     return { result: 'BOOKED',      reason: 'datetime+BOOKING_REQUEST',       intent: intent };
    }
    if (intent === 'PRICE_QUESTION') {
      if (isWeakAgreement(lastMsg)) return { result: 'IN_PROGRESS', reason: 'weak_agreement+PRICE_QUESTION',  intent: intent };
    }
    return { result: 'IN_PROGRESS', reason: 'fallback', intent: intent };
  }

  if (/\b(да|ок|хорошо|мақұл|иа|барам|келем)\b/.test(lastMsg) && hasDateTime(fullText))
    return { result: 'BOOKED', reason: 'soft_agreement+datetime_in_context' };

  return { result: 'IN_PROGRESS', reason: 'default' };
}

var tests = [
  // ═══ BOOKED ═══════════════════════════════════════════════════════
  { label:'BOOKED-01 KZ: Жазылуға болады ма? → иа',
    msgs:[{direction:'OUTGOING',message:'Жазылуға болады ма?'}],
    client:'иа', expected:'BOOKED' },
  { label:'BOOKED-02 KZ: Ертеңге жазайын ба? → барам',
    msgs:[{direction:'OUTGOING',message:'Ертеңге жазайын ба?'}],
    client:'барам', expected:'BOOKED' },
  { label:'BOOKED-03 KZ: Жазайық па? → болады',
    msgs:[{direction:'OUTGOING',message:'Жазайық па?'}],
    client:'болады', expected:'BOOKED' },
  { label:'BOOKED-04 KZ: Жазып қояйын ба? → жазып қойыңыз',
    msgs:[{direction:'OUTGOING',message:'Жазып қояйын ба?'}],
    client:'жазып қойыңыз', expected:'BOOKED' },
  { label:'BOOKED-05 KZ: Сізді ертеңге белгілейін бе? → ия',
    msgs:[{direction:'OUTGOING',message:'Сізді ертеңге белгілейін бе?'}],
    client:'ия', expected:'BOOKED' },
  { label:'BOOKED-06 KZ: Ертең 16:00-ге жазайын ба? → иа болады',
    msgs:[{direction:'OUTGOING',message:'Ертең 16:00-ге жазайын ба?'}],
    client:'иа болады', expected:'BOOKED' },
  { label:'BOOKED-07 RU: Записать вас? → да, запишите',
    msgs:[{direction:'OUTGOING',message:'Записать вас?'}],
    client:'да, запишите', expected:'BOOKED' },
  { label:'BOOKED-08 RU: Записать вас на завтра? → хорошо',
    msgs:[{direction:'OUTGOING',message:'Записать вас на завтра?'}],
    client:'хорошо', expected:'BOOKED' },
  { label:'BOOKED-09 RU: Хотите записаться? → да',
    msgs:[{direction:'OUTGOING',message:'Хотите записаться?'}],
    client:'да', expected:'BOOKED' },
  { label:'BOOKED-10 RU: Оформить запись? → ок',
    msgs:[{direction:'OUTGOING',message:'Оформить запись?'}],
    client:'ок', expected:'BOOKED' },
  { label:'BOOKED-11 Без бота: клиент сам написал жазып қойыңыз',
    msgs:[], client:'жазып қойыңыз', expected:'BOOKED' },
  { label:'BOOKED-12 Без бота: клиент написал записываюсь',
    msgs:[], client:'записываюсь', expected:'BOOKED' },

  // ═══ LOST ═════════════════════════════════════════════════════════
  { label:'LOST-01 KZ: Жазайық па? → бармайм',
    msgs:[{direction:'OUTGOING',message:'Жазайық па?'}],
    client:'бармайм', expected:'LOST' },
  { label:'LOST-02 KZ: Жазылуға болады ма? → жоқ, керек емес',
    msgs:[{direction:'OUTGOING',message:'Жазылуға болады ма?'}],
    client:'жоқ, керек емес', expected:'LOST' },
  { label:'LOST-03 KZ: → қымбат екен',
    msgs:[{direction:'OUTGOING',message:'Жазайық па?'}],
    client:'қымбат екен', expected:'LOST' },
  { label:'LOST-04 KZ: → бармаймын (без бота)',
    msgs:[], client:'бармаймын', expected:'LOST' },
  { label:'LOST-05 RU: Записать вас? → не буду',
    msgs:[{direction:'OUTGOING',message:'Записать вас?'}],
    client:'не буду', expected:'LOST' },
  { label:'LOST-06 RU: Записать вас? → дорого',
    msgs:[{direction:'OUTGOING',message:'Записать вас?'}],
    client:'дорого', expected:'LOST' },
  { label:'LOST-07 RU: → передумала (без бота)',
    msgs:[], client:'передумала', expected:'LOST' },

  // ═══ IN_PROGRESS ══════════════════════════════════════════════════
  { label:'IN_PROGRESS-01 PRICE: Бағасы 7000 ме? → иа',
    msgs:[{direction:'OUTGOING',message:'Бағасы 7000 ме?'}],
    client:'иа', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-02 PRICE: Сколько стоит? → 7000',
    msgs:[{direction:'OUTGOING',message:'Сколько стоит?'}],
    client:'7000', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-03 KZ: Жазайық па? → ойланам',
    msgs:[{direction:'OUTGOING',message:'Жазайық па?'}],
    client:'ойланам', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-04 RU: Записать вас? → я подумаю',
    msgs:[{direction:'OUTGOING',message:'Записать вас?'}],
    client:'я подумаю', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-05 KZ: → кейін айтам (без бота)',
    msgs:[], client:'кейін айтам', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-06 Просто приветствие',
    msgs:[], client:'здравствуйте', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-07 Клиент спрашивает адрес',
    msgs:[{direction:'OUTGOING',message:'Стоимость 4990 тенге.'}],
    client:'адрес айта аласызба', expected:'IN_PROGRESS' },
  { label:'IN_PROGRESS-08 GENERAL_INFO: иа на обычный вопрос',
    msgs:[{direction:'OUTGOING',message:'Вы из Актобе?'}],
    client:'иа', expected:'IN_PROGRESS' },
];

// ─── Run ────────────────────────────────────────
var pass = 0, fail = 0;
console.log('\n' + '═'.repeat(65));
console.log('  ТЕСТ: BOOKED / IN_PROGRESS / LOST');
console.log('═'.repeat(65));

var sections = { BOOKED: [], IN_PROGRESS: [], LOST: [] };
for (var i = 0; i < tests.length; i++) {
  var t = tests[i];
  var r = determineBotResult(t.msgs, t.client);
  var ok = r.result === t.expected;
  if (ok) pass++; else fail++;
  sections[t.expected].push({ ok: ok, label: t.label, result: r });
}

['BOOKED','LOST','IN_PROGRESS'].forEach(function(section) {
  console.log('\n--- ' + section + ' ---');
  sections[section].forEach(function(item) {
    var icon = item.ok ? '✅' : '❌';
    console.log(icon + ' ' + item.label);
    if (!item.ok) {
      console.log('   got=' + item.result.result + ' reason=' + item.result.reason + (item.result.intent ? ' intent='+item.result.intent : ''));
    }
  });
});

console.log('\n' + '═'.repeat(65));
console.log('  PASSED: ' + pass + '/' + tests.length + '    FAILED: ' + fail);
console.log('═'.repeat(65) + '\n');
