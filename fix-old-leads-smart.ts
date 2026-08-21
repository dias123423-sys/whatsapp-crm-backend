/**
 * Умное исправление старых лидов
 * 
 * Логика:
 * 1. Если у лида status = BOOKED → botResult = BOOKED
 * 2. Если у лида status = CLOSED → анализируем ВХОДЯЩИЕ сообщения клиента
 *    - Есть отказ ("не смогу", "не получится") → LOST
 *    - Есть перенос ("повременю", "позже") → UNKNOWN
 * 3. Если status = NEW и давно создан (>7 дней) → UNKNOWN
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Фразы ОТКАЗА (LOST)
const LOST_PATTERNS = [
  'не смогу',
  'не получится',
  'не получиться',
  'не подходит',
  'не беспокоит',
  'не надо',
  'не нужно',
  'отказ',
  'отмен',
  'на работу вызвали',
  'занята',
  'менеджеры-рыбаки',
  'менеджеры рыбаки',
  // Казахские
  'керек емес',
  'бармаймын',
  'келе алмаймын',
];

// Фразы ПЕРЕНОСА/НЕОПРЕДЕЛЕННОСТИ (UNKNOWN)
const UNKNOWN_PATTERNS = [
  'повременю',
  'позже',
  'потом',
  'на работе',
  'пока не могу',
  'сентябр',
  'октябр',
  'ноябр',
  'в городе нет',
  'другой город',
  'подумаю',
  'может быть',
];

function analyzeClientMessages(messages: string[]): 'LOST' | 'UNKNOWN' | null {
  const allText = messages.join(' ').toLowerCase();
  
  // Проверяем LOST (приоритет)
  for (const pattern of LOST_PATTERNS) {
    if (allText.includes(pattern)) {
      return 'LOST';
    }
  }
  
  // Проверяем UNKNOWN
  for (const pattern of UNKNOWN_PATTERNS) {
    if (allText.includes(pattern)) {
      return 'UNKNOWN';
    }
  }
  
  return null;
}

async function main() {
  console.log('\n=== УМНОЕ ИСПРАВЛЕНИЕ СТАРЫХ ЛИДОВ ===\n');

  const stats = {
    statusBooked: 0,
    statusClosed: 0,
    foundLost: 0,
    foundUnknown: 0,
    oldNew: 0,
  };

  // 1. Все лиды с botResult = NULL
  const nullLeads = await prisma.lead.findMany({
    where: {
      botResult: null,
    },
    include: {
      client: {
        include: {
          messages: {
            where: { direction: 'INCOMING' },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  console.log(`📊 Найдено лидов с NULL: ${nullLeads.length}\n`);

  const updates: {
    id: string;
    newBotResult: 'BOOKED' | 'LOST' | 'UNKNOWN';
    newStatus?: string;
    reason: string;
  }[] = [];

  for (const lead of nullLeads) {
    // ПРАВИЛО 1: Если status = BOOKED → botResult = BOOKED
    if (lead.status === 'BOOKED') {
      updates.push({
        id: lead.id,
        newBotResult: 'BOOKED',
        reason: 'Status already BOOKED',
      });
      stats.statusBooked++;
      continue;
    }

    // ПРАВИЛО 2: Если status = CLOSED → анализируем сообщения
    if (lead.status === 'CLOSED') {
      const leadCreated = new Date(lead.createdAt);
      const relevantMessages = lead.client.messages
        .filter((m) => new Date(m.createdAt) >= leadCreated)
        .map((m) => m.message);

      const analysis = analyzeClientMessages(relevantMessages);

      if (analysis === 'LOST') {
        updates.push({
          id: lead.id,
          newBotResult: 'LOST',
          reason: `Found LOST pattern in: "${relevantMessages.join(' ').slice(0, 50)}"`,
        });
        stats.foundLost++;
        continue;
      }

      if (analysis === 'UNKNOWN') {
        updates.push({
          id: lead.id,
          newBotResult: 'UNKNOWN',
          reason: `Found UNKNOWN pattern in: "${relevantMessages.join(' ').slice(0, 50)}"`,
        });
        stats.foundUnknown++;
        continue;
      }

      // CLOSED без явных фраз → LOST
      updates.push({
        id: lead.id,
        newBotResult: 'LOST',
        reason: 'Status CLOSED, no explicit pattern',
      });
      stats.statusClosed++;
      continue;
    }

    // ПРАВИЛО 3: Если NEW и старый (>7 дней) → UNKNOWN
    if (lead.status === 'NEW') {
      const age = Date.now() - new Date(lead.createdAt).getTime();
      const days = age / (1000 * 60 * 60 * 24);

      if (days > 7) {
        updates.push({
          id: lead.id,
          newBotResult: 'UNKNOWN',
          reason: `Old NEW lead (${Math.floor(days)} days)`,
        });
        stats.oldNew++;
        continue;
      }
    }

    // Остальные → UNKNOWN
    updates.push({
      id: lead.id,
      newBotResult: 'UNKNOWN',
      reason: `Default: ${lead.status}`,
    });
  }

  console.log('📈 РЕЗУЛЬТАТЫ АНАЛИЗА:\n');
  console.log(`✅ Status=BOOKED → BOOKED: ${stats.statusBooked}`);
  console.log(`❌ Status=CLOSED + фразы → LOST: ${stats.foundLost}`);
  console.log(`❌ Status=CLOSED без фраз → LOST: ${stats.statusClosed}`);
  console.log(`⏳ Status=CLOSED + фразы → UNKNOWN: ${stats.foundUnknown}`);
  console.log(`⏳ Status=NEW старый → UNKNOWN: ${stats.oldNew}`);
  console.log(`⏳ Остальные → UNKNOWN: ${updates.length - stats.statusBooked - stats.foundLost - stats.statusClosed - stats.foundUnknown - stats.oldNew}`);
  console.log('');

  const summary = {
    toBooked: updates.filter((u) => u.newBotResult === 'BOOKED').length,
    toLost: updates.filter((u) => u.newBotResult === 'LOST').length,
    toUnknown: updates.filter((u) => u.newBotResult === 'UNKNOWN').length,
  };

  console.log('\n📊 ИТОГО ОБНОВЛЕНИЙ:\n');
  console.log(`✅ BOOKED: ${summary.toBooked}`);
  console.log(`❌ LOST: ${summary.toLost}`);
  console.log(`⏳ UNKNOWN: ${summary.toUnknown}`);
  console.log('');

  // Показываем примеры
  console.log('\n📝 ПРИМЕРЫ LOST (первые 3):\n');
  updates
    .filter((u) => u.newBotResult === 'LOST')
    .slice(0, 3)
    .forEach((u, i) => {
      console.log(`${i + 1}. ${u.reason}`);
    });

  console.log('\n📝 ПРИМЕРЫ BOOKED (первые 3):\n');
  updates
    .filter((u) => u.newBotResult === 'BOOKED')
    .slice(0, 3)
    .forEach((u, i) => {
      console.log(`${i + 1}. ${u.reason}`);
    });

  // Подтверждение
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('\n🔄 Применить изменения? (yes/no): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Отменено\n');
    process.exit(0);
  }

  // Применяем
  console.log('\n🔄 Обновляем...\n');

  for (const botResult of ['BOOKED', 'LOST', 'UNKNOWN'] as const) {
    const ids = updates.filter((u) => u.newBotResult === botResult).map((u) => u.id);

    if (ids.length > 0) {
      const result = await prisma.lead.updateMany({
        where: { id: { in: ids } },
        data: { botResult },
      });
      console.log(`${botResult}: ${result.count}`);
    }
  }

  // Новая статистика
  const newStats = await prisma.lead.groupBy({
    by: ['botResult'],
    _count: true,
  });

  console.log('\n\n📊 НОВАЯ СТАТИСТИКА:\n');
  newStats.forEach((s) => {
    const label = s.botResult || 'NULL';
    const emoji = label === 'BOOKED' ? '✅' : label === 'LOST' ? '❌' : label === 'UNKNOWN' ? '⏳' : '❓';
    console.log(`${emoji} ${label}: ${s._count}`);
  });
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Ошибка:', e);
  process.exit(1);
});
