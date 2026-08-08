import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ─────────────────────────────────────────────
  // ADMIN USER
  // ─────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@callcenter.com' },
    update: {},
    create: {
      email: 'admin@callcenter.com',
      password: adminPassword,
      name: 'Администратор',
      phone: '+77001234567',
      role: Role.ADMIN,
      active: true,
    },
  });
  console.log('✅ Admin:', admin.email);

  // ─────────────────────────────────────────────
  // OPERATORS
  // ─────────────────────────────────────────────
  const operatorPassword = await bcrypt.hash('operator123', 10);

  const operatorUsers = [
    { email: 'aizhan@callcenter.com', name: 'Айжан', phone: '+77001234568' },
    { email: 'maria@callcenter.com',  name: 'Мария',  phone: '+77001234569' },
    { email: 'olga@callcenter.com',   name: 'Ольга',  phone: '+77001234570' },
  ];

  for (const ou of operatorUsers) {
    const u = await prisma.user.upsert({
      where: { email: ou.email },
      update: {},
      create: { ...ou, password: operatorPassword, role: Role.OPERATOR, active: true },
    });
    await prisma.operator.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id, currentLeads: 0, totalLeads: 0, totalCalls: 0, totalBooked: 0, active: true },
    });
  }
  console.log('✅ Operators created: Айжан, Мария, Ольга');

  // ─────────────────────────────────────────────
  // WHATSAPP OWNERS (Танат, Улдай и другие)
  // ─────────────────────────────────────────────
  const owners = [
    { name: 'Танат',  phone: null },
    { name: 'Улдай',  phone: null },
    { name: 'Владелец 2', phone: null },
    { name: 'Владелец 4', phone: null },
  ];

  const createdOwners: Record<string, string> = {}; // name → id

  for (const owner of owners) {
    const o = await prisma.whatsAppOwner.upsert({
      where: { name: owner.name },
      update: {},
      create: { name: owner.name, phone: owner.phone, active: true },
    });
    createdOwners[owner.name] = o.id;
    console.log(`✅ WhatsApp Owner: ${owner.name}`);
  }

  // ─────────────────────────────────────────────
  // WHATSAPP ACCOUNTS (4 аккаунта)
  // ─────────────────────────────────────────────
  const accounts = [
    {
      instanceName: 'whatsapp-1-tanat',
      name: 'WhatsApp 1',
      ownerName: 'Танат',
    },
    {
      instanceName: 'whatsapp-2',
      name: 'WhatsApp 2',
      ownerName: 'Владелец 2',
    },
    {
      instanceName: 'whatsapp-3-ulday',
      name: 'WhatsApp 3',
      ownerName: 'Улдай',
    },
    {
      instanceName: 'whatsapp-4',
      name: 'WhatsApp 4',
      ownerName: 'Владелец 4',
    },
  ];

  for (const acc of accounts) {
    const ownerId = createdOwners[acc.ownerName];
    await prisma.whatsAppAccount.upsert({
      where: { instanceName: acc.instanceName },
      update: { name: acc.name, ownerId },
      create: {
        instanceName: acc.instanceName,
        name: acc.name,
        ownerId,
        status: 'DISCONNECTED',
        active: true,
      },
    });
    console.log(`✅ WhatsApp Account: ${acc.name} (${acc.ownerName})`);
  }

  // ─────────────────────────────────────────────
  // PROCEDURES (base list)
  // ─────────────────────────────────────────────
  const procedures = [
    { name: 'RF-лифтинг',   price: 25000, keywords: ['rf', 'лифтинг', 'омоложение'] },
    { name: 'Трихология',   price: 30000, keywords: ['трихология', 'трихолог', 'волосы'] },
    { name: 'Чистка лица',  price: 10000, keywords: ['чистка', 'лица', 'чистку'] },
    { name: 'Подтяжка лица',price: 15000, keywords: ['подтяжка', 'лица', 'подтяжку'] },
    { name: 'Массаж лица',  price: 8000,  keywords: ['массаж', 'лица'] },
    { name: 'Трон Кегеля',  price: 5000,  keywords: ['трон', 'кегел', 'кегеля'] },
    { name: 'Озон капельница', price: 5000, keywords: ['озон', 'капельниц', 'капельница'] },
    { name: 'ВЛОК капельница', price: 5000, keywords: ['влок', 'капельниц'] },
    { name: 'Фонофорез',    price: 4000,  keywords: ['фонофорез', 'увлажнен'] },
    { name: 'Эпиляция',     price: 10000, keywords: ['эпиляция', 'лазер'] },
  ];

  for (const p of procedures) {
    await prisma.procedure.upsert({
      where: { name: p.name },
      update: {},
      create: { name: p.name, price: p.price, keywords: p.keywords, active: true },
    });
  }
  console.log(`✅ Procedures: ${procedures.length}`);

  // ─────────────────────────────────────────────
  // SETTINGS
  // ─────────────────────────────────────────────
  const settings = [
    { key: 'ASSIGNMENT_STRATEGY', value: 'MANUAL',      type: 'STRING'  },
    { key: 'NIGHT_START_HOUR',    value: '19',           type: 'NUMBER'  },
    { key: 'NIGHT_END_HOUR',      value: '9',            type: 'NUMBER'  },
    { key: 'AUTO_REPORT_ENABLED', value: 'true',         type: 'BOOLEAN' },
    { key: 'TIMEZONE',            value: 'Asia/Almaty',  type: 'STRING'  },
    { key: 'CURRENCY',            value: 'KZT',          type: 'STRING'  },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`✅ Settings: ${settings.length}`);

  console.log('\n🎉 Seeding complete!');
  console.log('\n📝 Login credentials:');
  console.log('   Admin:    admin@callcenter.com    / admin123');
  console.log('   Operator: aizhan@callcenter.com   / operator123');
  console.log('\n⚠️  Run seed-offers.ts separately:');
  console.log('   npx ts-node prisma/seed-offers.ts');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
