import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Ре-парсинг лидов с botResult = NULL за сегодня (22.08.2026)
 * Проверяет OUTGOING сообщения операторов на фразы подтверждения BOOKED
 */

async function reparseToday() {
  console.log('🔍 Starting re-parse for today NULL botResult leads...\n');

  // Лиды за сегодня с NULL botResult
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: {
        gte: new Date('2026-08-22T00:00:00+05:00'),
      },
      botResult: null,
    },
    include: {
      client: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`📊 Found ${leads.length} leads with NULL botResult today\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const lead of leads) {
    console.log(`\n─────────────────────────────────────────────`);
    console.log(`📞 Phone: ${lead.client.phone}`);
    console.log(`👤 Name: ${lead.client.whatsappName || '—'}`);
    console.log(`🆔 Lead ID: ${lead.id}`);

    // Загружаем все сообщения для этого клиента после создания лида
    const messages = await prisma.message.findMany({
      where: {
        clientId: lead.clientId,
        createdAt: { gte: lead.createdAt },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`💬 Messages: ${messages.length} (${messages.filter((m) => m.direction === 'OUTGOING').length} outgoing)`);

    // Ищем OUTGOING сообщения с подтверждением BOOKED
    const outgoingMessages = messages.filter((m) => m.direction === 'OUTGOING');

    let foundBooking = false;
    let bookingMessage = '';
    let parsedDate: string | null = null;
    let parsedTime: string | null = null;

    for (const msg of outgoingMessages) {
      const lowerText = msg.message.toLowerCase();

      // BOOKED фразы (те же что в webhook controller)
      const isBookingConfirmation =
        // РУССКИЙ - прошедшее время (100% подтверждение)
        lowerText.includes('записала вас') ||
        lowerText.includes('записал вас') ||
        lowerText.includes('я записала') ||
        lowerText.includes('я записал') ||
        lowerText.includes('забронировала') ||
        lowerText.includes('забронировал') ||
        lowerText.includes('ждем вас') ||
        lowerText.includes('ждём вас') ||
        (lowerText.includes('до встречи') && /\d{1,2}[:\.]?\d{2}/.test(lowerText)) ||
        // РУССКИЙ - настоящее время с датой
        /записываю .* на \d{1,2}\.\d{1,2}/.test(lowerText) ||
        /фиксирую .* на \d{1,2}\.\d{1,2}/.test(lowerText) ||
        // Специфичные шаблоны операторов
        lowerText.includes('мы уже готовимся к вашему визиту') ||
        lowerText.includes('бронируем кабинет') ||
        lowerText.includes('с вами свяжется менеджер') ||
        // КАЗАХСКИЙ
        lowerText.includes('кутемин') ||
        lowerText.includes('күтемін') ||
        lowerText.includes('кутеміз') ||
        lowerText.includes('күтеміз') ||
        lowerText.includes('жазып қою') ||
        lowerText.includes('жазып қой') ||
        lowerText.includes('жазып қояйын') ||
        lowerText.includes('жазып қоямын') ||
        lowerText.includes('жазып қоюға болады') ||
        lowerText.includes('жазып қоя аламын') ||
        lowerText.includes('белгілеп қою') ||
        lowerText.includes('белгілеп қой') ||
        lowerText.includes('белгілеп қоямын') ||
        lowerText.includes('жазып берем') ||
        lowerText.includes('жазып берейін') ||
        lowerText.includes('жаксы сагат') ||
        // Транслитерация
        lowerText.includes('жазып кою') ||
        lowerText.includes('жазып кой') ||
        lowerText.includes('жазып кояйын') ||
        lowerText.includes('жазып коямын') ||
        lowerText.includes('белгілеп кою') ||
        lowerText.includes('белгілеп кой');

      if (isBookingConfirmation) {
        foundBooking = true;
        bookingMessage = msg.message.slice(0, 100);

        // Парсинг даты
        const dateMatch = msg.message.match(/\b(\d{1,2})\.(\d{1,2})\b/);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const month = dateMatch[2].padStart(2, '0');
          parsedDate = `2026-${month}-${day}`;
        }

        // Парсинг времени
        const timeMatch = msg.message.match(/\b(\d{1,2})[:\.](\d{2})\b/);
        if (timeMatch) {
          const hour = timeMatch[1].padStart(2, '0');
          const minute = timeMatch[2];
          parsedTime = `${hour}:${minute}`;
        }

        break; // Нашли подтверждение, дальше не проверяем
      }
    }

    if (foundBooking) {
      console.log(`✅ BOOKED confirmation found:`);
      console.log(`   Message: "${bookingMessage}..."`);
      if (parsedDate) console.log(`   📅 Date: ${parsedDate}`);
      if (parsedTime) console.log(`   ⏰ Time: ${parsedTime}`);

      const updateData: any = {
        botResult: 'BOOKED',
        status: 'BOOKED',
      };
      if (parsedDate) updateData.parsedDate = parsedDate;
      if (parsedTime) updateData.parsedTime = parsedTime;

      await prisma.lead.update({
        where: { id: lead.id },
        data: updateData,
      });

      updatedCount++;
      console.log(`   ✅ Updated to BOOKED`);
    } else {
      console.log(`⏸️  No BOOKED confirmation found, keeping NULL`);
      skippedCount++;
    }
  }

  console.log(`\n═════════════════════════════════════════════`);
  console.log(`✅ Updated: ${updatedCount}`);
  console.log(`⏸️  Skipped: ${skippedCount}`);
  console.log(`📊 Total: ${leads.length}`);
  console.log(`═════════════════════════════════════════════\n`);
}

reparseToday()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
