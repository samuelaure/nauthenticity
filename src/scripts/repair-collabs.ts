import { PrismaClient } from '@prisma/client';
import { downloadQueue } from '../queues/download.queue';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

async function repair() {
  logger.info('Starting Collaborator Repair Script [v3] - SINGLE RUN ONLY...');

  const run = await prisma.scrapingRun.findFirst({
    where: { username: 'karenexplora', status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  if (!run || !run.rawData || !Array.isArray(run.rawData)) {
    logger.warn('No valid completed run found for karenexplora.');
    return;
  }

  logger.info(
    `Processing LATEST Run ${run.id} (@${run.username}) with ${run.rawData.length} items`,
  );

  const items = run.rawData as any[];
  let totalPostsWithCollabs = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const instagramUrl =
      item.url || (item.shortcode ? `https://www.instagram.com/p/${item.shortcode}/` : null);
    if (!instagramUrl) continue;

    const collaborators: any[] = [];
    const coauthors = item.coauthorProducers || item.coauthor_producers || [];

    if (Array.isArray(coauthors)) {
      coauthors.forEach((c: any) => {
        const u = c.username || c.user?.username;
        const p = c.profilePicUrl || c.profile_pic_url || c.user?.profilePicUrl;
        if (u && u !== run.username) {
          collaborators.push({ username: u, profilePicUrl: p, role: 'co-author' });
        }
      });
    }

    if (collaborators.length > 0) {
      totalPostsWithCollabs++;

      await prisma.post.update({
        where: { instagramUrl },
        data: { collaborators },
      });

      for (const collab of collaborators) {
        if (collab.profilePicUrl) {
          await downloadQueue.add('process-profile-image', {
            username: collab.username,
            url: collab.profilePicUrl,
            contextUsername: run.username,
          });
          logger.info(`  [${idx}] Queued collab: ${collab.username}`);
        }
      }
    }
  }

  logger.info(`Repair finished. Updated ${totalPostsWithCollabs} posts.`);
  await prisma.$disconnect();
}

repair().catch((err) => {
  logger.error(`Repair failed: ${err}`);
  process.exit(1);
});
