const text1 = 'Хочу записаться на массаж лица 3990 тг\nЗдравствуйте. Я проживаю в г.Актобе\nЕлена';
const text2 = 'Хочу записаться\nЯ из Шымкента';
const text3 = 'Жазылғым келеді\nМен Қарағандыда тұрамын';

const OTHER_CITIES = [
  'актобе', 'ақтөбе', 'шымкент', 'шимкент',
  'караганда', 'қарағанды',
];

function testLocation(text: string) {
  const fullTextLower = text.toLowerCase();
  console.log('\nText:', text.substring(0, 50));
  console.log('Lowercase:', fullTextLower);
  
  for (const city of OTHER_CITIES) {
    if (fullTextLower.includes(city)) {
      console.log(`  ✅ FOUND: "${city}"`);
      return true;
    } else {
      console.log(`  ❌ NOT FOUND: "${city}"`);
    }
  }
  return false;
}

console.log('=== TEST 1 ===');
testLocation(text1);

console.log('\n=== TEST 2 ===');
testLocation(text2);

console.log('\n=== TEST 3 ===');
testLocation(text3);
