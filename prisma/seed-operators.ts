import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Казахские и русские имена
const firstNames = [
  'Айгуль', 'Алия', 'Асель', 'Гульнара', 'Динара',
  'Жанар', 'Камила', 'Мадина', 'Салтанат', 'Толганай',
  'Анна', 'Елена', 'Ирина', 'Мария', 'Наталья',
  'Ольга', 'Светлана', 'Татьяна', 'Юлия', 'Виктория',
  'Айдар', 'Асхат', 'Ерлан', 'Нурлан', 'Руслан',
  'Александр', 'Дмитрий', 'Евгений', 'Игорь', 'Максим'
];

const lastNames = [
  'Абдуллаева', 'Ахметова', 'Есенова', 'Жакупова', 'Искакова',
  'Кадырова', 'Мукашева', 'Нурланова', 'Омарова', 'Сарсенова',
  'Иванова', 'Петрова', 'Сидорова', 'Козлова', 'Новикова',
  'Морозова', 'Волкова', 'Соколова', 'Лебедева', 'Семенова'
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePhone(): string {
  const prefix = '+770';
  const number = Math.floor(10000000 + Math.random() * 90000000);
  return `${prefix}${number}`;
}

function generateEmail(firstName: string, lastName: string, index: number): string {
  const translitMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ғ': 'g', 'қ': 'q', 'ң': 'ng', 'ү': 'u', 'ұ': 'u', 'һ': 'h', 'ә': 'a', 'ө': 'o', 'і': 'i'
  };
  
  const translit = (text: string) => {
    return text
      .toLowerCase()
      .split('')
      .map(c => translitMap[c] !== undefined ? translitMap[c] : c)
      .join('');
  };
  
  const name = translit(firstName);
  const surname = translit(lastName);
  
  return `${name}.${surname}${index}@callcenter.kz`;
}

async function main() {
  console.log('👥 Creating 15 operators with random data...\n');

  const password = await bcrypt.hash('operator123', 10);
  const operators = [];

  for (let i = 1; i <= 15; i++) {
    const firstName = getRandomElement(firstNames);
    const lastName = getRandomElement(lastNames);
    const fullName = `${firstName} ${lastName}`;
    const email = generateEmail(firstName, lastName, i);
    const phone = generatePhone();

    operators.push({
      email,
      name: fullName,
      phone,
      password,
      role: Role.OPERATOR,
      active: true,
    });
  }

  console.log('📧 Generated emails (you can change names later):');
  console.log('═══════════════════════════════════════════════════\n');

  for (const op of operators) {
    // Create User
    const user = await prisma.user.upsert({
      where: { email: op.email },
      update: { name: op.name, phone: op.phone },
      create: op,
    });

    // Create Operator profile
    await prisma.operator.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        currentLeads: 0,
        totalLeads: 0,
        totalCalls: 0,
        totalBooked: 0,
        active: true,
      },
    });

    console.log(`✅ ${op.name.padEnd(25)} | ${op.email.padEnd(35)} | ${op.phone}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🎉 Successfully created ${operators.length} operators!\n`);
  console.log('📝 Default password for all operators: operator123');
  console.log('💡 Admin can change names/surnames in the Admin panel\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
