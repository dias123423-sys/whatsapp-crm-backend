import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Добавляет казахские keywords в существующие offers
 * для лучшего распознавания процедур
 */
async function addKazakhKeywords() {
  console.log('\n=== ДОБАВЛЕНИЕ КАЗАХСКИХ KEYWORDS ===\n');

  // 1. Подтяжка лица: мойындагы сызыктарды кетиру, бет тартуға
  const liftingOffers = await prisma.offer.findMany({
    where: {
      name: { contains: 'Подтяжка лица' },
      active: true,
    },
  });

  for (const offer of liftingOffers) {
    const currentKeywords = (offer.keywords as string[]) || [];
    const newKeywords = [
      ...currentKeywords,
      'сызыктарды', // морщины
      'кетіру',     // убрать
      'мойындагы',  // на шее
      'бет',        // лицо
      'тартуға',    // подтянуть
      'әдемі',      // красивый
      'жас',        // молодой
    ];

    await prisma.offer.update({
      where: { id: offer.id },
      data: { keywords: [...new Set(newKeywords)] },
    });

    console.log(`✅ ${offer.name} (${offer.price}₸) - добавлены казахские keywords`);
  }

  // 2. Трихология: шашымды өсіргім келеді
  const trichoOffers = await prisma.offer.findMany({
    where: {
      name: { contains: 'Трихолог' },
      active: true,
    },
  });

  for (const offer of trichoOffers) {
    const currentKeywords = (offer.keywords as string[]) || [];
    const newKeywords = [
      ...currentKeywords,
      'шашымды',    // волосы (мои)
      'шаш',        // волосы
      'өсіргім',    // хочу вырастить
      'түсу',       // выпадать
      'келеді',     // хочется
      'басты',      // голова
    ];

    await prisma.offer.update({
      where: { id: offer.id },
      data: { keywords: [...new Set(newKeywords)] },
    });

    console.log(`✅ ${offer.name} (${offer.price}₸) - добавлены казахские keywords`);
  }

  // 3. Чистка лица: жараны тексеріп, тазалау
  const cleaningOffers = await prisma.offer.findMany({
    where: {
      name: { contains: 'Чистка лица' },
      active: true,
    },
  });

  for (const offer of cleaningOffers) {
    const currentKeywords = (offer.keywords as string[]) || [];
    const newKeywords = [
      ...currentKeywords,
      'жараны',     // рану
      'жара',       // рана
      'тексеріп',   // проверить
      'тазалау',    // чистка
      'тері',       // кожа
      'бетті',      // лицо (вин.падеж)
    ];

    await prisma.offer.update({
      where: { id: offer.id },
      data: { keywords: [...new Set(newKeywords)] },
    });

    console.log(`✅ ${offer.name} (${offer.price}₸) - добавлены казахские keywords`);
  }

  // 4. "Подходящая процедура" - добавить общие фразы
  const generalOffers = await prisma.offer.findMany({
    where: {
      name: { contains: 'Подходящая процедура' },
      active: true,
    },
  });

  for (const offer of generalOffers) {
    const currentKeywords = (offer.keywords as string[]) || [];
    const newKeywords = [
      ...currentKeywords,
      'подробнее',
      'узнать',
      'записаться',
      'интересует',
      'можно',
      'хочу',
      'білгім',     // хочу знать (каз)
      'келеді',     // хочется
      'жазылу',     // записаться (каз)
    ];

    await prisma.offer.update({
      where: { id: offer.id },
      data: { keywords: [...new Set(newKeywords)] },
    });

    console.log(`✅ ${offer.name} (${offer.price}₸) - добавлены общие keywords`);
  }

  console.log('\n✅ KEYWORDS ОБНОВЛЕНЫ!\n');
}

addKazakhKeywords()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
