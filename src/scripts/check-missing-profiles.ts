import { PrismaClient } from '@prisma/client';
import { getProfileInfo } from '../services/apify.service';
import { downloadQueue } from '../queues/download.queue';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const contextUsername = 'karenexplora';
  logger.info(`Checking profile picture for main account: ${contextUsername}`);

  const account = await prisma.account.findUnique({ where: { username: contextUsername } });

  if (account && account.profileImageUrl) {
    const p = account.profileImageUrl.replace('/content/', '');
    const fullPath = path.join('/app/storage', p);
    if (!fs.existsSync(fullPath)) {
      logger.warn(`Main profile image missing for ${contextUsername}. Refetching...`);
      try {
        const profile = await getProfileInfo(contextUsername);
        if (profile) {
          const url = profile.profilePicUrlHD || profile.profilePicUrl;
          await downloadQueue.add('process-profile-image', {
            username: contextUsername,
            url,
            contextUsername,
          });
          logger.info(`Queued fresh download for ${contextUsername}`);
        }
      } catch (e) {
        logger.error(`Error fetching main profile info: ${e}`);
      }
    } else {
      logger.info(`Main profile image exists at ${fullPath}`);
    }
  }

  // Also check collaborators
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

  for (const username of usernames) {
    if (username === contextUsername) continue;
    const collAccount = await prisma.account.findUnique({ where: { username } });
    if (collAccount?.profileImageUrl?.startsWith('/content/')) {
      const p = collAccount.profileImageUrl.replace('/content/', '');
      const fullPath = path.join('/app/storage', p);
      if (!fs.existsSync(fullPath)) {
        logger.warn(`Collaborator profile missing: ${username}. Refetching...`);
        try {
          const profile = await getProfileInfo(username);
          if (profile) {
            const url = profile.profilePicUrlHD || profile.profilePicUrl;
            await downloadQueue.add('process-profile-image', { username, url, contextUsername });
            logger.info(`Queued fresh download for ${username}`);
          }
        } catch {}
      }
    }
  }

  logger.info('Check complete.');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
