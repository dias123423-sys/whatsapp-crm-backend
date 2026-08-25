import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeMessages() {
  console.log('=== АНАЛИЗ РЕАЛЬНЫХ СООБЩЕНИЙ ===\n');

  // 1. Получаем все лиды с сообщениями
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: {
        gte: new Date('2026-08-20'), // Последние 5 дней
      },
    },
    include: {
      client: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50, // Последние 50 лидов
  });

  console.log(`📊 Найдено лидов: ${leads.length}\n`);

  // 2. Для каждого лида анализируем сообщения
  for (const lead of leads) {
    const messages = await prisma.message.findMany({
      where: { clientId: lead.clientId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) continue;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📱 Lead ID: ${lead.id.substring(0, 8)}... | Phone: ${lead.client.phone}`);
    console.log(`📊 Status: ${lead.status} | Result: ${lead.botResult || 'NULL'}`);
    console.log(`💰 Price: ${lead.parsedPrice || 'NULL'} | Procedure: ${lead.parsedProcedures?.join(', ') || 'NULL'}`);
    console.log(`📅 Date: ${lead.parsedDate || 'NULL'} | Time: ${lead.parsedTime || 'NULL'}`);
    console.log(`👤 Age: ${lead.parsedAge || 'NULL'} | Gender: ${lead.parsedGender || 'NULL'}`);
    console.log(`🏙️ City: ${lead.parsedCity || 'NULL'} | Aktobe: ${lead.isAktobeResident ?? 'NULL'}`);
    console.log(`👤 Name: ${lead.parsedName || 'NULL'}`);
    
    console.log(`\n📨 Сообщения (${messages.length}):`);
    for (const msg of messages) {
      const direction = msg.direction === 'INCOMING' ? '📥 IN ' : '📤 OUT';
      const text = msg.message.substring(0, 150);
      console.log(`  ${direction}: ${text}${msg.message.length > 150 ? '...' : ''}`);
    }
  }

  await prisma.$disconnect();
}

analyzeMessages().catch(console.error);
