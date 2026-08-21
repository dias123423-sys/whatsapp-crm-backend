import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Добавить недостающие процедуры которые клиенты спрашивают
 */
async function addMissingProcedures() {
  console.log('\n=== ДОБАВЛЕНИЕ НЕДОСТАЮЩИХ ПРОЦЕДУР ===\n');

  const newOffers = [
    {
      name: 'Лечение облысения (трихология расширенная)',
      price: 6990,
      category: null,
      keywords: [
        'облысени',
        'облысение',
        'лечени',
        'лечение',
        'выпадени',
        'выпадение',
        'волос',
        'шаш',
        'алопеци',
        '6990',
        'этап',
        'этапов',
        'түсу', // выпадение (каз)
        'түсіп', // выпадает (каз)
      ],
    },
    {
      name: 'Ботокс для лица',
      price: 0, // уточнить цену
      category: null,
      keywords: ['ботокс', 'botox', 'инъекц', 'укол', 'морщин', 'сызық'],
    },
    {
      name: 'Пилинг лица',
      price: 0, // уточнить цену
      category: null,
      keywords: ['пилинг', 'peeling', 'очищен', 'эксфол', 'кислот', 'қышқыл'],
    },
    {
      name: 'Лазерная процедура',
      price: 0, // уточнить цену
      category: null,
      keywords: ['лазер', 'laser', 'удален', 'эпиляц', 'омолож', 'лазермен'],
    },
    {
      name: 'Комплекс САПФИР (ультразвуковая чистка + RF-лифтинг)',
      price: 3990,
      category: null,
      keywords: [
        'сапфир',
        'сапфір',
        'ультразвук',
        'rf',
        'лифтинг',
        'комплекс',
        'чистка',
        'подтяжк',
        '3990',
      ],
    },
  ];

  for (const offerData of newOffers) {
    // Проверяем не существует ли уже
    const existing = await prisma.offer.findFirst({
      where: { name: offerData.name },
    });

    if (existing) {
      console.log(`⏭️  ${offerData.name} - уже существует`);
      continue;
    }

    const offer = await prisma.offer.create({
      data: {
        ...offerData,
        active: true,
      },
    });

    console.log(`✅ ${offer.name} (${offer.price}₸) - добавлен`);
  }

  console.log('\n✅ ПРОЦЕДУРЫ ДОБАВЛЕНЫ!\n');
}

addMissingProcedures()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
