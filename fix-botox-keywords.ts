import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Исправить keywords для ботокса - убрать "инъекц"
 * чтобы не ловить "Витамин Д инъекции"
 */
async function fixBotoxKeywords() {
  console.log('\n=== ИСПРАВЛЕНИЕ KEYWORDS ДЛЯ БОТОКСА ===\n');

  const botoxOffer = await prisma.offer.findFirst({
    where: { name: 'Ботокс для лица' },
  });

  if (!botoxOffer) {
    console.log('❌ Ботокс не найден');
    return;
  }

  const currentKeywords = botoxOffer.keywords as string[];
  console.log(`Текущие keywords: ${JSON.stringify(currentKeywords)}`);

  // Убрать "инъекц" чтобы не ловить "витамин Д инъекции"
  const newKeywords = currentKeywords.filter((k) => k !== 'инъекц');

  await prisma.offer.update({
    where: { id: botoxOffer.id },
    data: { keywords: newKeywords },
  });

  console.log(`\nНовые keywords: ${JSON.stringify(newKeywords)}`);
  console.log('\n✅ Keywords обновлены (убран "инъекц")');

  // Исправить лид Күнім - убрать ботокс
  const lead = await prisma.lead.findFirst({
    where: { client: { phone: '+77763831138' } },
    orderBy: { createdAt: 'desc' },
  });

  if (lead && lead.parsedProcedures && (lead.parsedProcedures as string[]).includes('Ботокс для лица')) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        parsedProcedures: [],
        offerId: null,
      },
    });
    console.log('\n✅ Лид Күнім исправлен: убран "Ботокс для лица"');
  }
}

fixBotoxKeywords()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
