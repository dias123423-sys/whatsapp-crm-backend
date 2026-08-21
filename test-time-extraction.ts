// Тестирование извлечения времени из сообщений (standalone)

function extractTime(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/ё/g, 'е');

  // Формат "16:00" / "09:30" / "19.30" / "19;30" / "19-30" / "17,30"
  // Поддерживаем разделители: : . ; - ,
  // ВАЖНО: Ищем ВСЕ совпадения и берём первое валидное ВРЕМЯ (не дату)
  const allMatches = t.matchAll(/(\d{1,2})[:\.;,\-](\d{2})(?!\d)/g);
  for (const match of allMatches) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    
    // Пропускаем очевидные ДАТЫ (не время):
    // Логика: если h > 12 И m <= 12 И m НЕ круглые минуты (не 00, 30)
    // Примеры дат: 22.08, 20.08, 15.03 и т.д.
    // Примеры НЕ дат: 13.00 (00 минуты - это время!), 18.30 (30 минуты)
    const isRoundMinutes = (m === 0 || m === 30 || m === 15 || m === 45);
    if (h > 12 && m <= 12 && !isRoundMinutes) {
      continue; // Это скорее всего дата, пропускаем
    }
    
    // Проверяем что это валидное время
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // "в 16" / "в 9" — только если явно "в X" и X ≤ 23
  const inTimeMatch = t.match(/(^|\s)в\s+(\d{1,2})(\s|$)/);
  if (inTimeMatch) {
    const h = parseInt(inTimeMatch[2], 10);
    if (h >= 6 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  // "сағат 16" / "сағат 4"
  const sagatMatch = t.match(/сағат\s+(\d{1,2})/);
  if (sagatMatch) {
    const h = parseInt(sagatMatch[1], 10);
    if (h >= 1 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  // "4-те" / "4те" / "төртте" — казахские суффиксы времени
  const kzTimeMatch = t.match(/(\d{1,2})-?(?:те|де|да|та)(?!\w)/);
  if (kzTimeMatch) {
    const h = parseInt(kzTimeMatch[1], 10);
    if (h >= 1 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return null;
}

const testCases = [
  { name: 'Светлана (дата+время с точкой)', text: '22.08-14.30' },
  { name: 'Анна (на HH-MM)', text: '22.08 на 11-00' },
  { name: 'Альфия (точка)', text: 'Завтра 10.30' },
  { name: 'Алия (запятая)', text: '17,30' },
  { name: 'Айман (точка)', text: 'В субботу в 13.00' },
  { name: 'Анна (второй)', text: '20.08 на 18-00' },
  { name: 'Марьям (пробелы)', text: 'Можно в 12 или 14 - 30' },
  { name: 'Стандарт двоеточие', text: '16:30' },
  { name: 'Казахский суффикс', text: '23темин маган боладыма' },
  { name: 'Диапазон времени', text: '14:00-16:00' },
  { name: 'Точка с запятой', text: '19;30' },
  { name: 'После даты точка', text: 'Светлана 22.08-14.30 48' },
  { name: 'Цена не время', text: '3990 тг' },
  { name: 'в 12', text: 'Можно в 12' },
];

console.log('\n=== ТЕСТИРОВАНИЕ ИЗВЛЕЧЕНИЯ ВРЕМЕНИ ===\n');

let success = 0;
let total = testCases.length;

testCases.forEach((tc) => {
  const time = extractTime(tc.text);
  const status = time ? '✅' : '❌';
  if (time) success++;
  
  console.log(`${status} ${tc.name}:`);
  console.log(`   Вход: "${tc.text}"`);
  console.log(`   Результат: ${time || 'НЕТ'}`);
  console.log('');
});

console.log(`\n📊 Итого: ${success}/${total} успешно (${Math.round(success/total*100)}%)\n`);
