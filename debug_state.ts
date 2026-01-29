import { prisma } from './src/db/prisma';

async function check() {
    const run = await prisma.scrapingRun.findFirst({
        where: { username: 'violeta_homeschool' },
        orderBy: { createdAt: 'desc' }
    });

    if (run && run.rawData) {
        // @ts-ignore
        const firstItem = run.rawData[0];
        console.log('Sample Item from Run:', JSON.stringify(firstItem, null, 2));
    } else {
        console.log('No run data found');
    }
}

check().finally(() => prisma.$disconnect());
