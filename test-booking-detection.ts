/**
 * Тест распознавания фраз о записи
 */

const testMessages = [
  {
    name: 'Длинный шаблон',
    text: `Ильхама, я записала Вас на 21.08 в 18:00 на комплекс
«САПФИР» (ультразвуковая чистка + RF-лифтинг) - 3 990 тг.
Мы уже готовимся к Вашему визиту, бронируем кабинет и косметолога специально для Вас.
→ В ближайшее время с Вами свяжется менеджер для уточнения деталей.
Адрес: г. Актобе, ул. Бокенбай батыра, 49
https://maps.app.goo.gl/gMXamsNWe3MJ29nM8
Оплата на месте перед началом процедуры. Детей с собой нельзя. До встречи!`,
    expected: true
  },
  {
    name: 'Короткий шаблон',
    text: `Отлично, Ильхама
Ждем Вас сегодня, 21.08, в 18:00.
Пожалуйста, приходите за 5-10 минут пораньше для оформления.
г. Актобе, ул. Бокенбай батыра, 49
https://maps.app.goo.gl/gMXamsNWe3MJ29nM8
До встречи!`,
    expected: true
  },
  {
    name: 'Только "записала вас"',
    text: 'Здравствуйте! Я записала вас на завтра в 14:30.',
    expected: true
  },
  {
    name: 'Только "ждем вас"',
    text: 'Ждем вас завтра на процедуру!',
    expected: true
  },
  {
    name: 'Запись + дата',
    text: 'Запись на 22.08 подтверждена',
    expected: true
  },
  {
    name: 'До встречи + время',
    text: 'До встречи в 15:30!',
    expected: true
  },
  {
    name: 'Обычный ответ (НЕ запись)',
    text: 'Здравствуйте! Свяжемся с вами позже.',
    expected: false
  },
  {
    name: 'Вопрос о записи',
    text: 'Подтвердите пожалуйста время записи',
    expected: false
  }
];

function detectBooking(messageText: string): boolean {
  const lowerText = messageText.toLowerCase();
  
  const result = (
    lowerText.includes('записала вас') ||
    lowerText.includes('записал вас') ||
    lowerText.includes('ждем вас') ||
    lowerText.includes('ждём вас') ||
    (lowerText.includes('запис') && !!lowerText.match(/\d{1,2}[\.:\-]\d{1,2}/)) ||
    (lowerText.includes('встреч') && !!lowerText.match(/\d{1,2}:\d{2}/))
  );
  
  return result;
}

console.log('\n=== ТЕСТ РАСПОЗНАВАНИЯ ФРАЗ О ЗАПИСИ ===\n');

let passed = 0;
let failed = 0;

testMessages.forEach((test, i) => {
  const result = detectBooking(test.text);
  const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === test.expected) passed++;
  else failed++;
  
  console.log(`${i + 1}. ${status} | ${test.name}`);
  console.log(`   Ожидалось: ${test.expected ? 'BOOKED' : 'НЕ BOOKED'}`);
  console.log(`   Получено: ${result ? 'BOOKED' : 'НЕ BOOKED'}`);
  console.log(`   Текст: "${test.text.slice(0, 60)}..."`);
  console.log('');
});

console.log(`\n=== ИТОГО: ${passed}/${testMessages.length} тестов пройдено ===\n`);

if (failed > 0) {
  process.exit(1);
}
