import { PrismaClient } from '@prisma/client';
import { getProfileInfo } from '../services/apify.service';
import { downloadQueue } from '../queues/download.queue';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const contextUsername = 'karenexplora';
  logger.info(`Starting profile picture sync for collaborators of ${contextUsername}`);

  // 1. Unique collaborators for this account
  const posts = await prisma.post.findMany({
    where: { username: contextUsername },
    select: { collaborators: true },
  });

  const usernames = new Set<string>();
  posts.forEach((p) => {
    if (Array.isArray(p.collaborators)) {
      p.collaborators.forEach((c: any) => {
        if (c.username) usernames.add(c.username);
      });
    }
  });

  logger.info(`Found ${usernames.size} unique collaborators: ${Array.from(usernames).join(', ')}`);

  for (const username of usernames) {
    if (username === contextUsername) continue; // Already handled by main scrape

    // Check if we already have it locally and it actually exists on disk
    const account = await prisma.account.findUnique({ where: { username } });
    const isLocal = account?.profileImageUrl?.startsWith('/content/');
    let fileExists = false;
    if (isLocal && account?.profileImageUrl) {
      // Path construction: /content/context/profiles/username.jpg
      const p = account.profileImageUrl.replace('/content/', '');
      const fullPath = path.join('/app/storage', p);
      if (fs.existsSync(fullPath)) fileExists = true;
    }

    if (isLocal && fileExists) {
      logger.info(`[Sync] Skipping ${username}, already have valid local profile picture.`);
      continue;
    }

    if (isLocal && !fileExists) {
      logger.warn(`[Sync] ${username} has local path but FILE IS MISSING. Refetching...`);
    }

    logger.info(`[Sync] Fetching fresh profile for ${username} via Apify...`);
    try {
      const profile = await getProfileInfo(username);
      if (profile) {
        const url = profile.profilePicUrlHD || profile.profilePicUrl;
        // Queue for download
        await downloadQueue.add('process-profile-image', {
          username,
          url,
          contextUsername,
        });
        logger.info(`[Sync] Queued fresh download for ${username}`);
      } else {
        logger.warn(`[Sync] No profile info found for ${username}`);
      }
    } catch (e) {
      logger.error(`[Sync] Failed to sync ${username}: ${e}`);
    }
  }

  logger.info('Sync initialization finished. Watch the download queue for completion.');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
