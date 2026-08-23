import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Тестирование логинов операторов
 */

const testLogins = [
  { email: 'call1@callcenter.kz', password: 'call123', name: 'Жолдубаева Самал' },
  { email: 'call2@callcenter.kz', password: 'call123', name: 'Омірзак Эйгерім' },
  { email: 'call3@callcenter.kz', password: 'call123', name: 'Алимжанова Акалтын' },
];

async function testLogin() {
  console.log('\n=== ТЕСТИРОВАНИЕ ЛОГИНОВ ===\n');

  for (const test of testLogins) {
    console.log(`\n📧 Testing: ${test.email}`);
    console.log(`🔑 Password: ${test.password}`);
    console.log('─'.repeat(60));

    // 1. Найти пользователя
    const user = await prisma.user.findUnique({
      where: { email: test.email },
      include: {
        operator: true,
      },
    });

    if (!user) {
      console.log(`❌ ОШИБКА: Пользователь не найден!`);
      continue;
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Email: ${user.email}`);

    // 2. Проверить пароль
    const isPasswordValid = await bcrypt.compare(test.password, user.password);

    if (isPasswordValid) {
      console.log(`✅ ПАРОЛЬ ВЕРНЫЙ! ✅`);
    } else {
      console.log(`❌ ПАРОЛЬ НЕВЕРНЫЙ! ❌`);
    }

    // 3. Проверить operator связь
    if (user.role === 'OPERATOR') {
      if (user.operator) {
        console.log(`✅ Operator связь: ID ${user.operator.id}, active: ${user.operator.active}`);
      } else {
        console.log(`❌ ОШИБКА: Operator связь не найдена!`);
      }
    } else if (user.role === 'ADMIN') {
      console.log(`👑 Роль: ADMIN (Руководитель)`);
    }

    console.log('');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО\n');

  // Финальная проверка: сколько всего операторов
  const totalUsers = await prisma.user.count();
  const totalOperators = await prisma.operator.count();

  console.log(`👥 Всего пользователей: ${totalUsers}`);
  console.log(`📞 Всего операторов: ${totalOperators}`);
  console.log('');
}

testLogin()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
