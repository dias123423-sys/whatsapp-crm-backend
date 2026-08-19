import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                           СПИСОК ВСЕХ ОПЕРАТОРОВ');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const operators = await prisma.operator.findMany({
    include: {
      user: {
        select: {
          email: true,
          name: true,
          phone: true,
          active: true,
        },
      },
    },
    orderBy: {
      user: { name: 'asc' },
    },
  });

  console.log(`Всего операторов: ${operators.length}\n`);

  operators.forEach((op, index) => {
    const status = op.user.active ? '✅' : '❌';
    console.log(`${(index + 1).toString().padStart(2)}. ${status} ${op.user.name.padEnd(25)} | ${op.user.email.padEnd(40)} | ${op.user.phone}`);
    console.log(`    Статистика: Лидов: ${op.totalLeads} | Записей: ${op.totalBooked} | Звонков: ${op.totalCalls} | В работе: ${op.currentLeads}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('💡 Пароль по умолчанию: operator123');
  console.log('💡 Имена и фамилии можно изменить в Admin панели');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
