import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Перепарсить процедуры для лидов с пустыми parsedProcedures
 */
async function reparseProcedures() {
  console.log('\n=== REPARSE PROCEDURES (только пустые) ===\n');

  // Найти лиды с пустыми процедурами
  const emptyLeads = await prisma.lead.findMany({
    where: {
      OR: [
        { parsedProcedures: { equals: [] } },
        { parsedProcedures: { equals: null } },
      ],
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
    take: 50, // топ 50 недавних
  });

  console.log(`Найдено ${emptyLeads.length} лидов с пустыми процедурами\n`);

  let updated = 0;

  for (const lead of emptyLeads) {
    // Собрать все сообщения после создания лида
    const relevantMessages = lead.client.messages.filter(
      (m) => new Date(m.createdAt) >= new Date(lead.createdAt),
    );

    if (relevantMessages.length === 0) continue;

    const fullText = relevantMessages.map((m) => m.message).join('\n');
    const normalized = fullText.toLowerCase();

    // Найти подходящий offer
    const offers = await prisma.offer.findMany({ where: { active: true } });
    let bestOffer: any = null;
    let bestScore = 0;

    for (const offer of offers) {
      let score = 0;

      // Проверка keywords
      const keywords = (offer.keywords as string[]) || [];
      const matchedKeywords = keywords.filter((kw) => {
        const kwNorm = kw.toLowerCase().trim();
        return kwNorm.length > 2 && normalized.includes(kwNorm);
      });

      score += matchedKeywords.length * 10;

      // Проверка цены
      if (lead.parsedPrice && lead.parsedPrice === offer.price) {
        score += 50;
      }

      // Проверка категории
      if (offer.category) {
        const catNorm = (offer.category as string).toLowerCase();
        if (normalized.includes(catNorm)) score += 20;
      }

      // Проверка имени
      const nameWords = offer.name
        .toLowerCase()
        .split(/[\s+,]+/)
        .filter((w) => w.length > 3);
      score += nameWords.filter((w) => normalized.includes(w)).length * 5;

      if (score > bestScore) {
        bestScore = score;
        bestOffer = offer;
      }
    }

    const THRESHOLD = 10;
    if (bestScore >= THRESHOLD && bestOffer) {
      // Разбить procedure на массив
      const procedures = bestOffer.name
        .split('+')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          parsedProcedures: procedures,
          parsedPrice: bestOffer.price,
          offerId: bestOffer.id,
        },
      });

      console.log(`✅ ${lead.client.whatsappName || lead.client.phone}`);
      console.log(`   → ${bestOffer.name} (${bestOffer.price}₸, score=${bestScore})`);

      updated++;
    } else {
      console.log(`⏭️  ${lead.client.whatsappName || lead.client.phone} - не найдено (score=${bestScore})`);
    }
  }

  console.log(`\n✅ Обновлено ${updated} из ${emptyLeads.length} лидов\n`);
}

reparseProcedures()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
