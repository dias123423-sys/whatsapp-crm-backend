import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  const adminHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@callcenter.kz' },
    update: {},
    create: {
      email: 'admin@callcenter.kz',
      name: 'Администратор',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });
  console.log('Admin created:', admin.email);

  // 20 operators
  const operators = [
    { name: 'Айжан',    email: 'aizhan@callcenter.kz',    phone: '+77001112201' },
    { name: 'Мария',    email: 'maria@callcenter.kz',      phone: '+77001112202' },
    { name: 'Ольга',    email: 'olga@callcenter.kz',       phone: '+77001112203' },
    { name: 'Динара',   email: 'dinara@callcenter.kz',     phone: '+77001112204' },
    { name: 'Жанара',   email: 'zhanara@callcenter.kz',    phone: '+77001112205' },
    { name: 'Камила',   email: 'kamila@callcenter.kz',     phone: '+77001112206' },
    { name: 'Алия',     email: 'aliya@callcenter.kz',      phone: '+77001112207' },
    { name: 'Сауле',    email: 'saule@callcenter.kz',      phone: '+77001112208' },
    { name: 'Гульнара', email: 'gulnara@callcenter.kz',    phone: '+77001112209' },
    { name: 'Назгуль',  email: 'nazgul@callcenter.kz',     phone: '+77001112210' },
    { name: 'Меруерт',  email: 'meruert@callcenter.kz',    phone: '+77001112211' },
    { name: 'Зарина',   email: 'zarina@callcenter.kz',     phone: '+77001112212' },
    { name: 'Аида',     email: 'aida@callcenter.kz',       phone: '+77001112213' },
    { name: 'Жулдыз',   email: 'zhuldyz@callcenter.kz',    phone: '+77001112214' },
    { name: 'Акмарал',  email: 'akmaral@callcenter.kz',    phone: '+77001112215' },
    { name: 'Балжан',   email: 'balzhan@callcenter.kz',    phone: '+77001112216' },
    { name: 'Гаухар',   email: 'gaukhar@callcenter.kz',    phone: '+77001112217' },
    { name: 'Индира',   email: 'indira@callcenter.kz',     phone: '+77001112218' },
    { name: 'Карина',   email: 'karina@callcenter.kz',     phone: '+77001112219' },
    { name: 'Лейла',    email: 'leila@callcenter.kz',      phone: '+77001112220' },
  ];

  const opPassword = await bcrypt.hash('operator123', 10);
  for (const op of operators) {
    const user = await prisma.user.upsert({
      where: { email: op.email },
      update: {},
      create: {
        email: op.email,
        name: op.name,
        phone: op.phone,
        passwordHash: opPassword,
        role: Role.OPERATOR,
      },
    });
    await prisma.operator.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, name: op.name, phone: op.phone },
    });
  }
  console.log(`20 operators created/verified`);

  // Procedures
  const procedures = [
    {
      name: 'Подтяжка лица + Чистка лица',
      price: 3990,
      keywords: ['подтяжку лица', 'подтяжка лица', 'чистка лица', 'подтяжка', '3990', 'лифтинг лица'],
      description: 'Подтяжка лица + Чистка лица за 3990 тг',
    },
    {
      name: 'Мужская чистка лица',
      price: 7000,
      keywords: ['мужскую чистку', 'мужская чистка', 'чистка для мужчин', 'мужчин чистка', '7000'],
      description: 'Мужская чистка лица за 7000 тг',
    },
    {
      name: 'Озон капельница + БРТ',
      price: 4990,
      keywords: ['озон капельницу', 'озон капельница', 'озон', 'бртозон', 'озон брт', '4990 озон'],
      description: 'Озон капельница + БРТ за 4990 тг',
    },
    {
      name: 'Глубокое увлажнение лица (Фонофорез)',
      price: 3990,
      keywords: ['глубокое увлажнение', 'увлажнение лица', 'фонофорез', 'аппаратом фонофорез'],
      description: 'Глубокое увлажнение лица аппаратом Фонофорез за 3990 тг',
    },
    {
      name: 'ВЛОК капельница + БРТ',
      price: 4990,
      keywords: ['влок капельницу', 'влок капельница', 'влок', 'влок брт'],
      description: 'ВЛОК капельница + БРТ за 4990 тг',
    },
    {
      name: 'Процедура по акции',
      price: 4990,
      keywords: ['выбрать подходящую', 'подходящую процедуру', 'процедуру по акции', 'акции 4990', 'акция'],
      description: 'Процедура по акции за 4990 тг',
    },
    {
      name: 'Бесплатная чистка лица',
      price: 0,
      keywords: ['бесплатную чистку', 'бесплатная чистка', 'бесплатно чистка'],
      description: 'Бесплатная чистка лица',
    },
    {
      name: 'Трон Кегеля + БРТ (женщины)',
      price: 4990,
      keywords: ['трон кегеля', 'кегеля брт', 'трон кегеля женщин', 'кегель женщин', '4990 тг'],
      description: 'Трон Кегеля + БРТ для женщин за 4990 тг',
    },
    {
      name: 'Подтяжка лица + Чистка лица (5000)',
      price: 5000,
      keywords: ['подтяжку лица чистка 5000', 'подтяжка 5000', 'лица 5000'],
      description: 'Подтяжка лица + Чистка лица за 5000 тг',
    },
    {
      name: 'Трихология для мужчин',
      price: 7000,
      keywords: ['трихологию мужчин', 'трихология мужчин', 'мужчин трихология', '7000 мужчин', 'трихолог мужской'],
      description: 'Трихология для мужчин за 7000 тг',
    },
    {
      name: 'Удаление мешков под глазами',
      price: 5000,
      keywords: ['удаление мешков', 'мешков под глазами', 'мешки глаза', 'мешки под глазами'],
      description: 'Удаление мешков под глазами за 5000 тг',
    },
    {
      name: 'Трон Кегеля от простатита',
      price: 7000,
      keywords: ['трон кегеля простатит', 'кегеля простатита', 'простатит', 'простатита 7000'],
      description: 'Трон Кегеля от простатита за 7000 тг',
    },
    {
      name: 'Трихология для женщин',
      price: 5000,
      keywords: ['трихологию женщин', 'трихология женщин', 'женщин трихология', '5000 женщин трихология', 'трихолог женский'],
      description: 'Трихология для женщин за 5000 тг',
    },
    {
      name: 'Процедура по акции 3990',
      price: 3990,
      keywords: ['акции 3990', 'акция 3990', 'подходящую процедуру 3990'],
      description: 'Процедура по акции за 3990 тг',
    },
    {
      name: 'Осветление пигментации + Чистка лица',
      price: 0,
      keywords: ['осветление пигментации', 'пигментация', 'осветление чистка', 'пигментации бесплатно'],
      description: 'Осветление пигментации + Чистка лица бесплатно',
    },
    {
      name: 'Массаж лица + Чистка лица',
      price: 3990,
      keywords: ['массаж лица', 'массаж чистка', 'массаж лица чистка', '3990 массаж'],
      description: 'Массаж лица + Чистка лица за 3990 тг',
    },
    // Универсальные
    {
      name: 'RF-лифтинг',
      price: 25000,
      keywords: ['rf', 'рф', 'лифтинг', 'омоложение', 'rf-лифтинг'],
      description: 'RF-лифтинг',
    },
    {
      name: 'Мезотерапия',
      price: 20000,
      keywords: ['мезотерапия', 'мезо', 'укол красоты'],
      description: 'Мезотерапия',
    },
    {
      name: 'Ботокс',
      price: 35000,
      keywords: ['ботокс', 'ботулинум', 'морщины'],
      description: 'Ботокс',
    },
    {
      name: 'Гиалуроновая кислота',
      price: 40000,
      keywords: ['гиалурон', 'контурная пластика', 'губы увеличение', 'гиалуроновая'],
      description: 'Гиалуроновая кислота',
    },
  ];

  for (const proc of procedures) {
    const exists = await prisma.procedure.findFirst({ where: { name: proc.name } });
    if (!exists) {
      await prisma.procedure.create({ data: proc });
    }
  }
  console.log('Procedures created');

  // Assignment config
  await prisma.assignmentConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', strategy: 'ROUND_ROBIN', lastIdx: 0 },
  });

  // 4 WhatsApp instances
  const whatsappInstances = [
    { instanceName: 'whatsapp-1' },
    { instanceName: 'whatsapp-2' },
    { instanceName: 'whatsapp-3' },
    { instanceName: 'whatsapp-4' },
  ];

  for (const wa of whatsappInstances) {
    await prisma.whatsAppAccount.upsert({
      where: { instanceName: wa.instanceName },
      update: {},
      create: { instanceName: wa.instanceName, status: 'OFFLINE' },
    });
  }
  console.log('WhatsApp instances created: whatsapp-1 .. whatsapp-4');

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
