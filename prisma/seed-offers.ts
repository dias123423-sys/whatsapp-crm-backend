import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 16 реальных офферов из рекламы.
 * Валюта: KZT (тенге ₸). USD нет.
 */
const REAL_OFFERS = [
  {
    name: 'Подтяжка лица + Чистка лица',
    price: 3990,
    currency: 'KZT',
    keywords: ['подтяжка', 'лица', 'чистка', '3990', 'подтяжку', 'массаж лица'],
    description: 'Подтяжка лица + Чистка лица за 3 990 ₸',
  },
  {
    name: 'Мужская чистка лица',
    price: 7000,
    currency: 'KZT',
    keywords: ['мужская', 'чистка', 'лица', '7000', 'мужская чистка'],
    category: 'мужчины',
    description: 'Мужская чистка лица 7 000 ₸',
  },
  {
    name: 'Озон капельница + БРТ',
    price: 4990,
    currency: 'KZT',
    keywords: ['озон', 'капельниц', 'брт', '4990', 'озон капельница'],
    description: 'Озон капельница + БРТ 4 990 ₸',
  },
  {
    name: 'Глубокое увлажнение лица аппаратом Фонофорез',
    price: 3990,
    currency: 'KZT',
    keywords: ['увлажнен', 'фонофорез', 'аппарат', '3990', 'глубокое увлажнение'],
    description: 'Глубокое увлажнение лица аппаратом Фонофорез 3 990 ₸',
  },
  {
    name: 'ВЛОК капельница + БРТ',
    price: 4990,
    currency: 'KZT',
    keywords: ['влок', 'капельниц', 'брт', '4990', 'влок капельница'],
    description: 'ВЛОК капельница + БРТ 4 990 ₸',
  },
  {
    name: 'Выбор подходящей процедуры по акции',
    price: 4990,
    currency: 'KZT',
    keywords: ['подходящ', 'акц', 'процедур', '4990', 'выбор процедуры'],
    description: 'Выбор подходящей процедуры по акции 4 990 ₸',
  },
  {
    name: 'Бесплатная чистка лица',
    price: 0,
    currency: 'KZT',
    keywords: ['бесплат', 'чистка', 'лица', 'бесплатно', '0'],
    description: 'Бесплатная чистка лица — 0 ₸',
  },
  {
    name: 'Трон Кегеля + БРТ для женщин',
    price: 4990,
    currency: 'KZT',
    keywords: ['трон', 'кегел', 'брт', '4990', 'кегеля', 'женщин'],
    category: 'женщины',
    description: 'Трон Кегеля + БРТ для женщин 4 990 ₸',
  },
  {
    name: 'Подтяжка лица + Чистка лица',
    price: 5000,
    currency: 'KZT',
    keywords: ['подтяжка', 'лица', 'чистка', '5000', 'подтяжку'],
    description: 'Подтяжка лица + Чистка лица за 5 000 ₸',
  },
  {
    name: 'Трихология для мужчин',
    price: 7000,
    currency: 'KZT',
    keywords: ['трихолог', 'трих', '7000', 'мужчин', 'трихология мужчин'],
    category: 'мужчины',
    description: 'Трихология для мужчин 7 000 ₸',
  },
  {
    name: 'Удаление мешков под глазами',
    price: 5000,
    currency: 'KZT',
    keywords: ['удален', 'мешк', 'глаз', '5000', 'мешки под глазами'],
    description: 'Удаление мешков под глазами 5 000 ₸',
  },
  {
    name: 'Трон Кегеля от простатита',
    price: 7000,
    currency: 'KZT',
    keywords: ['трон', 'кегел', 'простатит', '7000', 'трон кегеля'],
    category: 'мужчины',
    description: 'Трон Кегеля от простатита 7 000 ₸',
  },
  {
    name: 'Трихология для женщин',
    price: 5000,
    currency: 'KZT',
    keywords: ['трихолог', 'трих', '5000', 'женщин', 'трихология женщин'],
    category: 'женщины',
    description: 'Трихология для женщин 5 000 ₸',
  },
  {
    name: 'Выбор подходящей процедуры по акции',
    price: 3990,
    currency: 'KZT',
    keywords: ['подходящ', 'акц', 'процедур', '3990', 'выбор процедуры'],
    description: 'Выбор подходящей процедуры по акции 3 990 ₸',
  },
  {
    name: 'Осветление пигментации + Чистка лица',
    price: 0,
    currency: 'KZT',
    keywords: ['осветлен', 'пигмент', 'чистка', 'бесплат', 'осветление'],
    description: 'Осветление пигментации + Чистка лица — бесплатно',
  },
  {
    name: 'Массаж лица + Чистка лица',
    price: 3990,
    currency: 'KZT',
    keywords: ['массаж', 'лица', 'чистка', '3990', 'массаж лица'],
    description: 'Массаж лица + Чистка лица 3 990 ₸',
  },
];

async function main() {
  console.log('🌱 Seeding 16 real KZT offers...\n');

  await prisma.offer.deleteMany();
  console.log('   Deleted existing offers\n');

  for (const offer of REAL_OFFERS) {
    await prisma.offer.create({ data: { ...offer, active: true } });
    console.log(`   ✅ ${offer.name} — ${offer.price} ₸`);
  }

  console.log(`\n🎉 Seeded ${REAL_OFFERS.length} offers (currency: KZT only)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
