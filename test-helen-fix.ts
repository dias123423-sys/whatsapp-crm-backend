import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Имитация новой логики парсера
function isAutoAd(msg: string): boolean {
  const txt = msg.toLowerCase();
  return /хочу записаться/i.test(txt) && /\d{3,4}\s*тг/i.test(txt);
}

function determineResultNew(messages: string[]): string {
  if (messages.length === 0) return 'NULL';
  
  // Get last 2 messages (excluding auto-ad)
  const startIndex = messages.length > 0 && isAutoAd(messages[0]) ? 1 : 0;
  const realMessages = messages.slice(startIndex);
  const last2Messages = realMessages.slice(-2);
  const last2Text = last2Messages.join(' ').toLowerCase();
  
  console.log(`[DEBUG] First is auto-ad: ${startIndex > 0}`);
  console.log(`[DEBUG] Last 2: ${JSON.stringify(last2Messages)}`);
  
  const OTHER_CITIES = ['актобе', 'шымкент', 'караганда', 'павлодар'];
  const BOOKING_CONFIRMATIONS = ['запишите', 'записывай', 'приду', 'прийду', 'да,', 'хорошо', 'ок', 'окей', 'удобно'];
  
  // Check for city in last 2
  for (const city of OTHER_CITIES) {
    if (last2Text.includes(city)) {
      const hasConfirmation = BOOKING_CONFIRMATIONS.some(p => last2Text.includes(p));
      const hasTimeDate = /в\s*\d{1,2}[:.]?\d{0,2}|\d{1,2}\s*(числа|августа|сентября)/i.test(last2Text);
      
      if (!hasConfirmation && !hasTimeDate) {
        console.log(`[RESULT] UNKNOWN - city "${city}" without confirmation`);
        return 'UNKNOWN';
      }
    }
  }
  
  // Check location phrases
  const LOCATION_PHRASES = ['проживаю в', 'живу в', 'я из'];
  for (const phrase of LOCATION_PHRASES) {
    if (last2Text.includes(phrase)) {
      console.log(`[RESULT] UNKNOWN - location phrase "${phrase}"`);
      return 'UNKNOWN';
    }
  }
  
  return 'BOOKED (default)';
}

async function testHelen() {
  try {
    const helen = await prisma.client.findFirst({
      where: { phone: { contains: '79878706043' } }
    });
    
    if (!helen) {
      console.log('Helen not found');
      return;
    }
    
    const messages = await prisma.message.findMany({
      where: { clientId: helen.id },
      orderBy: { createdAt: 'asc' }
    });
    
    console.log('=== HELEN TEST ===\n');
    console.log('Messages:');
    messages.forEach((m, i) => {
      console.log(`[${i}] "${m.message}"`);
    });
    
    const msgTexts = messages.map(m => m.message);
    const result = determineResultNew(msgTexts);
    
    console.log(`\n=== RESULT ===`);
    console.log(`New logic: ${result}`);
    console.log(`Expected: UNKNOWN ✅`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('ERROR:', error.message);
    await prisma.$disconnect();
  }
}

testHelen();
