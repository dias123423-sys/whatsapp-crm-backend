import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Создание операторов Call-центра
 * 
 * 1. Удаляет всех операторов (кроме admin)
 * 2. Создаёт 11 операторов с логинами call1-call11@callcenter.kz
 * 3. Пароль для всех: call123
 */

const operators: Array<{ email: string; name: string; role: 'ADMIN' | 'OPERATOR' }> = [
  {
    email: 'call1@callcenter.kz',
    name: 'Жолдубаева Самал Тургалеевна',
    role: 'ADMIN', // Руководитель колл центра
  },
  {
    email: 'call2@callcenter.kz',
    name: 'Омірзак Эйгерім Куандыккызы',
    role: 'ADMIN', // Координатор колл центра
  },
  {
    email: 'call3@callcenter.kz',
    name: 'Алимжанова Акалтын Манарбековна',
    role: 'OPERATOR',
  },
  {
    email: 'call4@callcenter.kz',
    name: 'Жайылганова Акнур Нурланкызы',
    role: 'OPERATOR',
  },
  {
    email: 'call5@callcenter.kz',
    name: 'Ивонина Анара Аркадьевна',
    role: 'OPERATOR',
  },
  {
    email: 'call6@callcenter.kz',
    name: 'Сагынбаева Жангул Калдыбеккызы',
    role: 'OPERATOR',
  },
  {
    email: 'call7@callcenter.kz',
    name: 'Туракбаева Аружан Асхаткызы',
    role: 'OPERATOR',
  },
  {
    email: 'call8@callcenter.kz',
    name: 'Мырзабекова Акзер',
    role: 'OPERATOR',
  },
  {
    email: 'call9@callcenter.kz',
    name: 'Калыбаева Сагынай Ерланкызы',
    role: 'OPERATOR',
  },
  {
    email: 'call10@callcenter.kz',
    name: 'Жетегенова Айгул Омірсеріккызы',
    role: 'OPERATOR',
  },
  {
    email: 'call11@callcenter.kz',
    name: 'Сапарова Асел Кепжасаркызы',
    role: 'OPERATOR',
  },
];

async function createOperators() {
  console.log('\n=== СОЗДАНИЕ ОПЕРАТОРОВ CALL-ЦЕНТРА ===\n');

  const password = 'call123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // 1. Удалить всех операторов (кроме admin с email admin@callcenter.kz)
  console.log('1️⃣ Удаление старых операторов...\n');

  const deleted = await prisma.user.deleteMany({
    where: {
      email: { not: 'admin@callcenter.kz' },
    },
  });

  console.log(`   ✅ Удалено ${deleted.count} операторов\n`);

  // 2. Создать новых операторов
  console.log('2️⃣ Создание новых операторов...\n');

  for (const op of operators) {
    // Создать User
    const user = await prisma.user.create({
      data: {
        email: op.email,
        password: hashedPassword,
        name: op.name,
        role: op.role,
      },
    });

    // Создать связанного Operator (если role = OPERATOR)
    if (op.role === 'OPERATOR') {
      await prisma.operator.create({
        data: {
          userId: user.id,
          active: true,
        },
      });
    }

    const roleLabel = op.role === 'ADMIN' ? '👑 Руководитель' : '📞 Оператор';
    console.log(`   ✅ ${roleLabel}: ${op.name}`);
    console.log(`      Email: ${op.email}`);
    console.log(`      Password: ${password}\n`);
  }

  console.log('\n✅ ГОТОВО! Создано операторов: ' + operators.length);
  console.log('\n📋 ЛОГИНЫ И ПАРОЛИ:\n');
  console.log('─'.repeat(60));
  operators.forEach((op, i) => {
    const roleLabel = op.role === 'ADMIN' ? 'Руководитель' : 'Оператор';
    console.log(`${i + 1}. ${op.name}`);
    console.log(`   Роль: ${roleLabel}`);
    console.log(`   Email: ${op.email}`);
    console.log(`   Password: ${password}`);
    console.log('');
  });
  console.log('─'.repeat(60));
}

createOperators()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
