import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function restoreAdmin() {
  console.log('\n=== ВОССТАНОВЛЕНИЕ ADMIN АККАУНТА ===\n');

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@callcenter.kz' },
  });

  if (!admin) {
    console.log('❌ admin@callcenter.kz не найден. Создаю...\n');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@callcenter.kz',
        password: hashedPassword,
        name: 'Администратор',
        role: 'ADMIN',
      },
    });
    console.log('✅ Admin создан:');
    console.log('   Email: admin@callcenter.kz');
    console.log('   Password: admin123');
    console.log('   Role: ADMIN\n');
  } else {
    console.log('✅ admin@callcenter.kz найден');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Role: ${admin.role}\n`);

    // Проверяем пароль
    const isValid = await bcrypt.compare('admin123', admin.password);
    if (isValid) {
      console.log('✅ Пароль: admin123 - ВЕРНЫЙ!\n');
    } else {
      console.log('⚠️  Пароль неверный. Сбрасываю на admin123...\n');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: admin.id },
        data: { password: hashedPassword },
      });
      console.log('✅ Пароль сброшен на: admin123\n');
    }
  }
}

restoreAdmin()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
