import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ #1:
 * Синхронизация status для лидов с botResult=BOOKED
 * 
 * Проблема: 157 лидов имеют botResult=BOOKED но status≠BOOKED
 * Решение: Обновить status → BOOKED для всех таких лидов
 */
async function fixBookedStatus() {
  console.log('\n=== ИСПРАВЛЕНИЕ: status для BOOKED лидов ===\n');

  // Найти проблемные лиды
  const problematic = await prisma.lead.findMany({
    where: {
      botResult: 'BOOKED',
      status: { not: 'BOOKED' },
    },
    include: {
      client: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`Найдено ${problematic.length} проблемных лидов (показаны первые 10):\n`);

  problematic.forEach((lead, i) => {
    console.log(`${i + 1}. ${lead.client.whatsappName || lead.client.phone}`);
    console.log(`   botResult: BOOKED, status: ${lead.status}`);
    console.log(`   Создан: ${new Date(lead.createdAt).toLocaleString('ru-RU')}`);
  });

  console.log('\n──────────────────────────────────────────\n');
  console.log('Обновляю status → BOOKED...\n');

  // Обновить все проблемные лиды
  const updated = await prisma.lead.updateMany({
    where: {
      botResult: 'BOOKED',
      status: { not: 'BOOKED' },
    },
    data: {
      status: 'BOOKED',
    },
  });

  console.log(`✅ Обновлено ${updated.count} лидов: status → BOOKED\n`);

  // Проверка результата
  const remaining = await prisma.lead.count({
    where: {
      botResult: 'BOOKED',
      status: { not: 'BOOKED' },
    },
  });

  if (remaining === 0) {
    console.log('✅ Все лиды исправлены! Несоответствий не найдено.\n');
  } else {
    console.log(`⚠️  Осталось ${remaining} несоответствий (возможны новые лиды)\n`);
  }
}

fixBookedStatus()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
