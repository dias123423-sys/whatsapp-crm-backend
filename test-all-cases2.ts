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
  
  console.log(`  → Auto-ad detected: ${startIndex > 0}`);
  console.log(`  → Last 2: ${JSON.stringify(last2Messages)}`);
  
  const OTHER_CITIES = ['актобе', 'шымкент', 'караганда'];
  const BOOKING_CONFIRMATIONS = ['запишите', 'записывай', 'приду', 'прийду', 'да,', 'хорошо', 'ок', 'удобно'];
  
  for (const city of OTHER_CITIES) {
    if (last2Text.includes(city)) {
      const hasConfirmation = BOOKING_CONFIRMATIONS.some(p => last2Text.includes(p));
      const hasTimeDate = /в\s*\d{1,2}[:.]?\d{0,2}|\d{1,2}\s*(числа|августа)/i.test(last2Text);
      
      console.log(`  → City "${city}" found, hasConfirmation=${hasConfirmation}, hasTime=${hasTimeDate}`);
      
      if (!hasConfirmation && !hasTimeDate) {
        return 'UNKNOWN';
      } else {
        return 'BOOKED'; // город + подтверждение = все равно BOOKED
      }
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
    name: 'Актобе + подтверждение (приду)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ НА МАССАЖ 3990 ТГ',
      'Я из Актобе',
      'Хорошо, приду завтра в 10'
    ],
    expected: 'BOOKED'
  },
  {
    name: 'Актобе + время (в 14:00)',
    messages: [
      'ХОЧУ ЗАПИСАТЬСЯ 3990 ТГ',
      'Актобе',
      'В 14:00 могу'
    ],
    expected: 'BOOKED'
  }
];

console.log('=== ТЕСТИРОВАНИЕ КЕЙСОВ С ГОРОДОМ ===\n');

testCases.forEach((tc, i) => {
  console.log(`${i + 1}. ${tc.name}`);
  const result = determineResultNew(tc.messages);
  const status = result === tc.expected ? '✅' : '❌';
  console.log(`  Result: ${result} | Expected: ${tc.expected} ${status}\n`);
});
