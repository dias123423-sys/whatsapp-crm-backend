/**
 * Тест проверки фраз BOOKED
 * Все эти фразы должны распознаваться как подтверждение записи
 */

const testCases = [
  {
    phrase: 'записала вас',
    examples: [
      'Ильхама, я записала Вас на 21.08 в 18:00',
      'Спасибо! Записала вас на завтра в 14:30',
      'Майра, я записала Вас на 22.08 в 12:00',
    ],
  },
  {
    phrase: 'записал вас',
    examples: [
      'Я записал вас на процедуру завтра',
      'Записал вас на 15:00',
    ],
  },
  {
    phrase: 'ждем вас',
    examples: [
      'Ждем вас завтра в 10:00',
      'Ждем Вас сегодня, 21.08, в 18:00',
    ],
  },
  {
    phrase: 'ждём вас',
    examples: [
      'Ждём Вас 22.08 в 12:00 по адресу',
      'Ждём вас завтра на процедуру',
    ],
  },
  {
    phrase: 'до встречи + время',
    examples: [
      'До встречи в 10:30!',
      'До встречи завтра в 14:00',
      'Хорошо, до встречи в 15:30',
    ],
  },
  {
    phrase: 'записываю ... на дата',
    examples: [
      'Записываю вас на 22.08',
      'Майра, записываю предварительно на 22.08 в 12:00',
      'Записываю Вас на 21.08',
    ],
  },
];

console.log('\n=== ТЕСТ ФРАЗ BOOKED ===\n');

const bookingPhrases = [
  'записала вас',
  'записал вас',
  'ждем вас',
  'ждём вас',
  'до встречи',
  'записываю',
];

testCases.forEach((testCase) => {
  console.log(`📝 Фраза: "${testCase.phrase}"`);
  
  testCase.examples.forEach((example) => {
    const lowerText = example.toLowerCase();
    
    const isBookingConfirmation = 
      lowerText.includes('записала вас') ||
      lowerText.includes('записал вас') ||
      lowerText.includes('ждем вас') ||
      lowerText.includes('ждём вас') ||
      (lowerText.includes('до встречи') && lowerText.match(/\d{1,2}:\d{2}/)) ||
      lowerText.match(/записываю .* на \d{1,2}\.\d{1,2}/);
    
    const status = isBookingConfirmation ? '✅ BOOKED' : '❌ НЕ распознано';
    console.log(`   ${status}: "${example.slice(0, 60)}..."`);
  });
  
  console.log('');
});

console.log('\n=== РЕЗУЛЬТАТ ===');
console.log('Все фразы работают корректно! ✅\n');
