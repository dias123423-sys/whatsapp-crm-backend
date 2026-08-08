import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding WhatsApp accounts...');

  // Создаём 4 WhatsApp аккаунта
  const accounts = [
    {
      name: 'WhatsApp 1',
      instanceName: 'callcenter-wa1',
      phone: null,
      status: 'DISCONNECTED',
      qrCode: null,
    },
    {
      name: 'WhatsApp 2',
      instanceName: 'callcenter-wa2',
      phone: null,
      status: 'DISCONNECTED',
      qrCode: null,
    },
    {
      name: 'WhatsApp 3',
      instanceName: 'callcenter-wa3',
      phone: null,
      status: 'DISCONNECTED',
      qrCode: null,
    },
    {
      name: 'WhatsApp 4',
      instanceName: 'callcenter-wa4',
      phone: null,
      status: 'DISCONNECTED',
      qrCode: null,
    },
  ];

  for (const account of accounts) {
    const created = await prisma.whatsAppAccount.upsert({
      where: { instanceName: account.instanceName },
      update: account,
      create: account,
    });
    console.log(`✅ Created WhatsApp account: ${created.name}`);
  }

  console.log('🎉 Successfully seeded WhatsApp accounts!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding WhatsApp accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
