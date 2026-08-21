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
  
  // АКТОБЕ УБРАН из списка - это наш город!
  const OTHER_CITIES = ['шымкент', 'караганда', 'павлодар', 'семей'];
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
  
  return 'BOOKED';
}

const testCases = [
  {
    name: 'Helen - АКТОБЕ (наш город)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ НА МАССАЖ ЛИЦА 3990 ТГ',
      'Здравствуйте. Я проживаю в г.Актобе',
      'Елена'
    ],
    expected: 'BOOKED'
  },
  {
    name: 'Шымкент (другой город)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ 3990 ТГ',
      'Я из Шымкента',
      'Айгуль'
    ],
    expected: 'UNKNOWN'
  },
  {
    name: 'Караганда (другой город)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ 3990 ТГ',
      'Караганда'
    ],
    expected: 'UNKNOWN'
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

console.log('=== ТЕСТ: АКТОБЕ = НАШ ГОРОД ✅ ===\n');

testCases.forEach((tc, i) => {
  const result = determineResultNew(tc.messages);
  const status = result === tc.expected ? '✅' : '❌';
  
  console.log(`${i + 1}. ${tc.name}`);
  console.log(`   Result: ${result} | Expected: ${tc.expected} ${status}\n`);
});
