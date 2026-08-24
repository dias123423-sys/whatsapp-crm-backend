/**
 * УДАЛЕНИЕ СТАРЫХ ЛИДОВ ДО 22 АВГУСТА 2026
 * 
 * Удаляет ТОЛЬКО лиды (Lead), но НЕ клиентов и сообщения
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteOldLeads() {
  try {
    const cutoffDate = new Date('2026-08-22T00:00:00.000Z');
    
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('🗑️  УДАЛЕНИЕ СТАРЫХ ЛИДОВ ДО 22 АВГУСТА 2026');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`Дата отсечки: ${cutoffDate.toISOString()}`);
    console.log('');

    // Показать что будет удалено
    const leadsToDelete = await prisma.lead.count({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`📊 Найдено лидов для удаления: ${leadsToDelete}`);

    if (leadsToDelete === 0) {
      console.log('✅ Нет лидов для удаления');
      return;
    }

    console.log('\n⏳ Удаление...');

    // Удалить лиды
    const deleted = await prisma.lead.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`✅ Удалено лидов: ${deleted.count}`);

    // Показать что осталось
    const remainingLeads = await prisma.lead.count();
    console.log(`\n📊 Осталось лидов в базе: ${remainingLeads}`);

    const oldestLead = await prisma.lead.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    if (oldestLead) {
      console.log(`📅 Самый старый лид: ${oldestLead.createdAt.toISOString()}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('✅ УСПЕШНО ЗАВЕРШЕНО');
    console.log('═══════════════════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ Ошибка:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteOldLeads();
