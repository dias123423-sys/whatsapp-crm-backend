import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeGenderKeywords() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🔍 АНАЛИЗ КЛЮЧЕВЫХ СЛОВ ДЛЯ ОПРЕДЕЛЕНИЯ ПОЛА');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const messages = await prisma.message.findMany({
    where: {
      createdAt: {
        gte: new Date('2026-08-23T00:00:00Z'),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  console.log(`📨 Проанализировано ${messages.length} сообщений\n`);

  // Поиск упоминаний пола
  const genderKeywords = {
    male: [] as string[],
    female: [] as string[],
  };

  const malePatterns = [
    /мужчин/gi,
    /еркек/gi,
    /erkek/gi,
    /для мужчин/gi,
    /ерлер/gi,
    /для парней/gi,
    /7000|7\s*000/gi,
  ];

  const femalePatterns = [
    /женщин/gi,
    /әйел/gi,
    /ayel/gi,
    /қыз/gi,
    /кыз/gi,
    /бала/gi,
    /для женщин/gi,
    /девушк/gi,
    /3990|3\s*990/gi,
  ];

  for (const msg of messages) {
    const text = msg.message.toLowerCase();

    // Мужчины
    for (const pattern of malePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        genderKeywords.male.push(...matches);
      }
    }

    // Женщины
    for (const pattern of femalePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        genderKeywords.female.push(...matches);
      }
    }
  }

  console.log('👨 КЛЮЧЕВЫЕ СЛОВА ДЛЯ МУЖЧИН:');
  const maleUnique = [...new Set(genderKeywords.male)];
  maleUnique.forEach(k => console.log(`   - ${k}`));
  console.log(`   Всего упоминаний: ${genderKeywords.male.length}\n`);

  console.log('👩 КЛЮЧЕВЫЕ СЛОВА ДЛЯ ЖЕНЩИН:');
  const femaleUnique = [...new Set(genderKeywords.female)];
  femaleUnique.forEach(k => console.log(`   - ${k}`));
  console.log(`   Всего упоминаний: ${genderKeywords.female.length}\n`);

  // Поиск сообщений с возрастом
  console.log('📊 ПРИМЕРЫ СООБЩЕНИЙ С ВОЗРАСТОМ:\n');
  const ageMessages = messages.filter(m => /\d{2}\s*(лет|год|жас)/.test(m.message));
  ageMessages.slice(0, 20).forEach(m => {
    const ageMatch = m.message.match(/(\d{2})\s*(лет|год|жас)/);
    if (ageMatch) {
      console.log(`   ${m.direction === 'INCOMING' ? '📩' : '📤'} Возраст ${ageMatch[1]}: "${m.message.substring(0, 80)}..."`);
    }
  });

  await prisma.$disconnect();
}

analyzeGenderKeywords().catch(console.error);
