const { ingestProfile } = require('./src/modules/ingestion/ingester');
const { prisma } = require('./src/db/prisma');

async function test() {
  console.log('Testing ingestion with improvements...');
  try {
    const result = await ingestProfile('violeta_homeschool', 2);
    console.log('Result:', result);

    const posts = await prisma.post.findMany({
      where: { username: 'violeta_homeschool' },
      take: 2,
      include: { transcripts: true },
    });
    console.log('Posts in DB:', JSON.stringify(posts, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
