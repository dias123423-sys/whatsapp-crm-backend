import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeLeads() {
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: {
        gte: new Date('2026-08-23T00:00:00Z'),
      },
    },
    include: {
      client: {
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`📊 АНАЛИЗ ПОСЛЕДНИХ ${leads.length} ЛИДОВ (с 23 августа)`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  for (const lead of leads) {
    console.log(`\n📱 ЛИД #${lead.id.substring(0, 8)}`);
    console.log(`   Телефон: ${lead.client.phone}`);
    console.log(`   Имя: ${lead.client.name || '—'}`);
    console.log(`   Процедуры: ${lead.parsedProcedures.join(', ') || '—'}`);
    console.log(`   Цена: ${lead.parsedPrice ? lead.parsedPrice + ' ' + lead.parsedCurrency : '—'}`);
    console.log(`   Дата: ${lead.parsedDate || '—'}`);
    console.log(`   Время: ${lead.parsedTime || '—'}`);
    console.log(`   Период: ${lead.period || '—'}`);
    console.log(`   Статус: ${lead.botResult || 'NULL'}`);
    console.log(`   Источник: ${lead.source}`);
    console.log(`   WhatsApp: ${lead.whatsappAccountId?.substring(0, 8) || '—'}`);
    console.log(`   Создан: ${lead.createdAt.toISOString()}`);

    console.log(`\n   📨 ПЕРВЫЕ 10 СООБЩЕНИЙ:`);
    const msgs = lead.client.messages.slice(0, 10);
    msgs.forEach((m) => {
      const dir = m.direction === 'INCOMING' ? '📩 ОТ' : '📤 К ';
      const text = m.message.substring(0, 100).replace(/\n/g, ' ↵ ');
      console.log(`      ${dir}: ${text}${m.message.length > 100 ? '...' : ''}`);
    });

    console.log('   ───────────────────────────────────────────────────────────────────');
  }

  await prisma.$disconnect();
}

analyzeLeads().catch(console.error);
