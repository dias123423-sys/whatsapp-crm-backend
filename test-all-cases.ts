function isAutoAd(msg: string): boolean {
  const txt = msg.toLowerCase();
  return /хочу записаться/i.test(txt) && /\d{3,4}\s*тг/i.test(txt);
}

function determineResultNew(messages: string[]): string {
  if (messages.length === 0) return 'NULL';
  
  const startIndex = messages.length > 0 && isAutoAd(messages[0]) ? 1 : 0;
  const realMessages = messages.slice(startIndex);
  const last2Messages = realMessages.slice(-2);
  const last2Text = last2Messages.join(' ').toLowerCase();
  
  const OTHER_CITIES = ['актобе', 'шымкент', 'караганда'];
  const BOOKING_CONFIRMATIONS = ['запишите', 'записывай', 'приду', 'прийду', 'да,', 'хорошо', 'ок', 'удобно'];
  
  for (const city of OTHER_CITIES) {
    if (last2Text.includes(city)) {
      const hasConfirmation = BOOKING_CONFIRMATIONS.some(p => last2Text.includes(p));
      const hasTimeDate = /в\s*\d{1,2}[:.]?\d{0,2}|\d{1,2}\s*(числа|августа)/i.test(last2Text);
      
      if (!hasConfirmation && !hasTimeDate) {
        return 'UNKNOWN';
      }
    }
  }
  
  const LOCATION_PHRASES = ['проживаю в', 'живу в', 'я из'];
  for (const phrase of LOCATION_PHRASES) {
    if (last2Text.includes(phrase) && !last2Text.includes('алмат')) {
      return 'UNKNOWN';
    }
  }
  
  return 'BOOKED';
}

const testCases = [
  {
    name: 'Helen (город без подтверждения)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ НА МАССАЖ ЛИЦА 3990 ТГ',
      'Здравствуйте. Я проживаю в г.Актобе',
      'Елена'
    ],
    expected: 'UNKNOWN'
  },
  {
    name: 'Клиент только "Актобе"',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ НА ФОНОФОРЕЗ ВСЕГО ЗА 3990 ТГ',
      'Актобе'
    ],
    expected: 'UNKNOWN'
  },
  {
    name: 'Клиент из Актобе + подтверждение',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ НА МАССАЖ 3990 ТГ',
      'Я из Актобе',
      'Приду завтра в 10'
    ],
    expected: 'BOOKED'
  },
  {
    name: 'Без авто-рекламы, обычная запись',
    messages: [
      'Хочу записаться на массаж',
      'Хорошо, приду завтра'
    ],
    expected: 'BOOKED'
  },
  {
    name: 'Алматы (наш город)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ 3990 ТГ',
      'Я из Алматы',
      'Записывайте'
    ],
    expected: 'BOOKED'
  }
];

console.log('=== ТЕСТИРОВАНИЕ НОВОЙ ЛОГИКИ ===\n');

testCases.forEach((tc, i) => {
  const result = determineResultNew(tc.messages);
  const status = result === tc.expected ? '✅' : '❌';
  
  console.log(`${i + 1}. ${tc.name}`);
  console.log(`   Messages: ${JSON.stringify(tc.messages.slice(0, 2))}...`);
  console.log(`   Result: ${result} | Expected: ${tc.expected} ${status}\n`);
});
