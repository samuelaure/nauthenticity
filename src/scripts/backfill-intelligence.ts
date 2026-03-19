import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import { extractPostIntelligence } from '../services/intelligence.service';

const backfill = async () => {
  logger.info('[Scripts] Starting intelligence extraction backfill...');

  const posts = await prisma.post.findMany({
    where: { intelligence: null } as any,
    include: { transcripts: { take: 1 } },
  }) as any[];

  logger.info(`[Scripts] Found ${posts.length} posts needing strategy extraction.`);

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const progress = `[${i + 1}/${posts.length}]`;
    const transcriptText = p.transcripts[0]?.text || '';

    try {
      logger.info(`${progress} Extracting intelligence for post ${p.id} (@${p.username})`);
      
      const intelligence = await extractPostIntelligence(p.caption || '', transcriptText);

      await prisma.post.update({
        where: { id: p.id },
        data: { intelligence: intelligence as any },
      });
    } catch (e) {
      logger.error(`${progress} Failed to extract intelligence for post ${p.id}: ${e}`);
    }
  }

  logger.info('[Scripts] Backfill complete.');
};

backfill()
  .catch((e) => {
    logger.error(`[Scripts] Intelligence backfill fatal error: ${e}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
