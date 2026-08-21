/**
 * Исправление старых лидов на основе исходящих сообщений
 * 
 * Проверяет все лиды с botResult = NULL:
 * - Если есть исходящее сообщение с подтверждением записи → BOOKED
 * - Если есть исходящее сообщение с отказом → LOST
 * - Иначе → UNKNOWN
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type LeadWithMessages = {
  id: string;
  createdAt: Date;
  client: {
    phone: string;
    messages: {
      message: string;
      createdAt: Date;
    }[];
  };
};

// Фразы для BOOKED (запись подтверждена)
const BOOKED_PATTERNS = [
  // Русские
  'записала вас',
  'записал вас',
  'ждем вас',
  'ждём вас',
  'ожидаем вас',
  'вы записаны',
  'запись подтверждена',
  'до встречи',
  'приходите',
  // Казахские
  'жазайық',      // запишем
  'жазайын',      // запишу
  'жазамын',      // запишу
  'күтеміз',      // ждем
  'келіңіз',      // приходите
  'кездескенше',  // до встречи
  'жазылдыңыз',   // вы записаны
];

// Фразы для LOST (отказ, слив)
const LOST_PATTERNS = [
  'к сожалению',
  'не получится',
  'не подходит',
  'отменили',
  'отмена',
  'перенести',
  'свободных мест нет',
  'нет мест',
  'запись закрыта',
];

function detectBooking(text: string): 'BOOKED' | 'LOST' | null {
  const lower = text.toLowerCase();
  
  // Проверяем BOOKED (высокий приоритет)
  for (const pattern of BOOKED_PATTERNS) {
    if (lower.includes(pattern)) {
      // Дополнительная проверка: есть ли дата/время?
      const hasDateTime = /\d{1,2}[\.:\-]\d{1,2}/.test(lower);
      if (hasDateTime || pattern === 'ждем вас' || pattern === 'ждём вас') {
        return 'BOOKED';
      }
    }
  }
  
  // Проверяем LOST
  for (const pattern of LOST_PATTERNS) {
    if (lower.includes(pattern)) {
      return 'LOST';
    }
  }
  
  return null;
}

async function main() {
  console.log('\n=== АНАЛИЗ СТАРЫХ ЛИДОВ ПО ИСХОДЯЩИМ СООБЩЕНИЯМ ===\n');

  // 1. Получаем все лиды с NULL
  const nullLeads = await prisma.lead.findMany({
    where: {
      botResult: null,
    },
    include: {
      client: {
        include: {
          messages: {
            where: {
              direction: 'OUTGOING',
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      },
    },
  });

  console.log(`📊 Найдено лидов с NULL: ${nullLeads.length}\n`);

  const updates = {
    toBooked: [] as string[],
    toLost: [] as string[],
    toUnknown: [] as string[],
  };

  // 2. Анализируем каждый лид
  for (const lead of nullLeads) {
    const leadCreated = new Date(lead.createdAt);
    
    // Ищем исходящие сообщения ПОСЛЕ создания лида
    const relevantMessages = lead.client.messages.filter(
      (msg) => new Date(msg.createdAt) > leadCreated
    );

    if (relevantMessages.length === 0) {
      // Нет исходящих сообщений - оставляем NULL или ставим UNKNOWN
      updates.toUnknown.push(lead.id);
      continue;
    }

    // Проверяем все сообщения
    let finalResult: 'BOOKED' | 'LOST' | null = null;

    for (const msg of relevantMessages) {
      const detection = detectBooking(msg.message);
      if (detection) {
        finalResult = detection;
        // BOOKED имеет приоритет над LOST
        if (detection === 'BOOKED') {
          break;
        }
      }
    }

    if (finalResult === 'BOOKED') {
      updates.toBooked.push(lead.id);
    } else if (finalResult === 'LOST') {
      updates.toLost.push(lead.id);
    } else {
      updates.toUnknown.push(lead.id);
    }
  }

  console.log('\n📈 РЕЗУЛЬТАТЫ АНАЛИЗА:\n');
  console.log(`✅ BOOKED (запись была): ${updates.toBooked.length}`);
  console.log(`❌ LOST (слив): ${updates.toLost.length}`);
  console.log(`⏳ UNKNOWN (не определено): ${updates.toUnknown.length}`);
  console.log('');

  // 3. Показываем примеры для подтверждения
  if (updates.toBooked.length > 0) {
    console.log('\n📝 ПРИМЕРЫ BOOKED (первые 5):\n');
    for (let i = 0; i < Math.min(5, updates.toBooked.length); i++) {
      const lead = nullLeads.find((l) => l.id === updates.toBooked[i]);
      if (lead) {
        const msg = lead.client.messages.find((m) =>
          detectBooking(m.message) === 'BOOKED'
        );
        console.log(`${i + 1}. ${lead.client.phone}`);
        console.log(`   Сообщение: "${msg?.message.slice(0, 80)}..."`);
        console.log('');
      }
    }
  }

  if (updates.toLost.length > 0) {
    console.log('\n📝 ПРИМЕРЫ LOST (первые 5):\n');
    for (let i = 0; i < Math.min(5, updates.toLost.length); i++) {
      const lead = nullLeads.find((l) => l.id === updates.toLost[i]);
      if (lead) {
        const msg = lead.client.messages.find((m) =>
          detectBooking(m.message) === 'LOST'
        );
        console.log(`${i + 1}. ${lead.client.phone}`);
        console.log(`   Сообщение: "${msg?.message.slice(0, 80)}..."`);
        console.log('');
      }
    }
  }

  // 4. Спрашиваем подтверждение
  console.log('\n⚠️  ВНИМАНИЕ: Сейчас будет обновлено лидов:');
  console.log(`   ✅ BOOKED: ${updates.toBooked.length}`);
  console.log(`   ❌ LOST: ${updates.toLost.length}`);
  console.log(`   ⏳ UNKNOWN: ${updates.toUnknown.length}`);
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Продолжить? (yes/no): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Отменено пользователем\n');
    process.exit(0);
  }

  // 5. Применяем изменения
  console.log('\n🔄 Обновляем лиды...\n');

  let updated = 0;

  // Update BOOKED
  if (updates.toBooked.length > 0) {
    const result = await prisma.lead.updateMany({
      where: { id: { in: updates.toBooked } },
      data: { 
        botResult: 'BOOKED',
        status: 'BOOKED',
      },
    });
    updated += result.count;
    console.log(`✅ Обновлено на BOOKED: ${result.count}`);
  }

  // Update LOST
  if (updates.toLost.length > 0) {
    const result = await prisma.lead.updateMany({
      where: { id: { in: updates.toLost } },
      data: { 
        botResult: 'LOST',
        status: 'CLOSED',
      },
    });
    updated += result.count;
    console.log(`❌ Обновлено на LOST: ${result.count}`);
  }

  // Update UNKNOWN
  if (updates.toUnknown.length > 0) {
    const result = await prisma.lead.updateMany({
      where: { id: { in: updates.toUnknown } },
      data: { botResult: 'UNKNOWN' },
    });
    updated += result.count;
    console.log(`⏳ Обновлено на UNKNOWN: ${result.count}`);
  }

  console.log(`\n✅ ГОТОВО! Обновлено ${updated} лидов\n`);

  // 6. Показываем новую статистику
  const newStats = await prisma.lead.groupBy({
    by: ['botResult'],
    _count: true,
  });

  console.log('\n📊 НОВАЯ СТАТИСТИКА:\n');
  newStats.forEach((s) => {
    const label = s.botResult || 'NULL';
    const emoji = 
      label === 'BOOKED' ? '✅' : 
      label === 'LOST' ? '❌' : 
      label === 'UNKNOWN' ? '⏳' : '❓';
    console.log(`${emoji} ${label}: ${s._count}`);
  });
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Ошибка:', e);
  process.exit(1);
});
