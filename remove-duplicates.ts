import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeDuplicates() {
  console.log('🔍 Searching for duplicate leads...\n');

  // Find clients with multiple leads
  const duplicates = await prisma.$queryRaw<
    { clientId: string; phone: string; leadCount: bigint }[]
  >`
    SELECT 
      l."clientId",
      c.phone,
      COUNT(*) as "leadCount"
    FROM leads l
    JOIN clients c ON l."clientId" = c.id
    GROUP BY l."clientId", c.phone
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;

  console.log(`Found ${duplicates.length} clients with duplicate leads\n`);

  for (const dup of duplicates) {
    const count = Number(dup.leadCount);
    console.log(`\n📱 Phone: ${dup.phone} — ${count} leads`);

    // Get all leads for this client
    const leads = await prisma.lead.findMany({
      where: { clientId: dup.clientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        status: true,
        botResult: true,
        parsedProcedures: true,
        parsedPrice: true,
      },
    });

    // Keep the LATEST lead, delete the rest
    const [keepLead, ...deleteLeads] = leads;

    console.log(`  ✅ Keep: ${keepLead.id} (${keepLead.status}, ${keepLead.createdAt})`);

    for (const deleteLead of deleteLeads) {
      console.log(
        `  ❌ Delete: ${deleteLead.id} (${deleteLead.status}, ${deleteLead.createdAt})`,
      );
      await prisma.lead.delete({ where: { id: deleteLead.id } });
    }

    console.log(`  ✅ Deleted ${deleteLeads.length} duplicate(s)`);
  }

  console.log('\n✅ Done!');
}

removeDuplicates()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
