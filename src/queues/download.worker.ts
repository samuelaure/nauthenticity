import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { logContextStorage } from '../utils/context';
import { computeQueue } from './compute.queue';

interface ProcessMediaData {
  postId: string;
  mediaId: string;
  runId?: string; // Optional for legacy or direct downloads
  url: string;
  type: 'image' | 'video';
  username: string;
}

interface ProcessProfileImageData {
  username: string;
  url: string;
  contextUsername: string;
}

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const atomicMove = (oldPath: string, newPath: string) => {
  try {
    fs.renameSync(oldPath, newPath);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(oldPath, newPath);
      fs.unlinkSync(oldPath);
    } else {
      throw err;
    }
  }
};

export const downloadWorker = new Worker(
  'download-queue',
  async (job: Job<any>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (job.name === 'process-media') {
        const { postId, mediaId, runId, url, type, username } = job.data as ProcessMediaData;
        logger.info(`[DownloadWorker] Downloading Media (${type}) for ${username}`);

        const userDir = path.join(config.paths.storage, username, 'posts');
        ensureDir(userDir);
        ensureDir(config.paths.temp);

        const fileExt = type === 'video' ? 'mp4' : 'jpg';
        const finalFilename = `${mediaId}.${fileExt}`;
        const finalPath = path.join(userDir, finalFilename);
        const publicUrl = `/content/${username}/posts/${finalFilename}`;

        const tempFilePath = path.join(
          config.paths.temp,
          `${mediaId}_raw${path.extname(new URL(url).pathname) || (type === 'video' ? '.mp4' : '.jpg')}`,
        );

        try {
          if (!fs.existsSync(finalPath)) {
            // 1. Download to temp
            logger.info(`[DownloadWorker] Fetching ${url}`);
            const response = await fetch(url, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
              },
            });
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const writeStream = createWriteStream(tempFilePath);
            const totalSize = Number(response.headers.get('content-length')) || 0;
            let downloaded = 0;

            if (response.body) {
              const reader = response.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                downloaded += value.length;
                writeStream.write(value);
                
                if (totalSize > 0) {
                  const progress = Math.round((downloaded / totalSize) * 100);
                  await job.updateProgress({ 
                    progress, 
                    step: `Downloading...`,
                    mediaId,
                    postId 
                  });
                }
              }
              writeStream.end();
            }

          // 2. Atomic rename to final path (prevents partial reads by other components)
          atomicMove(tempFilePath, finalPath);
        } else {
          logger.info(`[DownloadWorker] File already exists at final path, skipping download.`);
        }

          // 3. Update DB (for both image and video, it is now local)
          await prisma.media.update({
            where: { id: mediaId },
            data: { storageUrl: publicUrl },
          });

          // 4. Check if we should trigger next phase (Optimizing)
          if (runId) {
            const pendingCount = await prisma.media.count({
              where: {
                post: { runId: runId },
                storageUrl: { not: { startsWith: '/content/' } },
              },
            });

            if (pendingCount === 0) {
              logger.info(`[DownloadWorker] Run ${runId} fully downloaded. Transitioning to OPTIMIZING.`);
              
              await prisma.scrapingRun.update({
                where: { id: runId },
                data: { phase: 'optimizing' },
              });

              // Trigger Batch Optimization for the entire run
              await computeQueue.add('optimize-batch', { runId, username });
            } else {
              logger.info(`[DownloadWorker] Run ${runId} has ${pendingCount} downloads remaining.`);
            }
          }

          logger.info(`[DownloadWorker] Download complete: ${publicUrl}`);
        } catch (postError) {
          logger.error(`[DownloadWorker] Failed to process media for post ${postId}: ${postError}`);
          throw postError;
        } finally {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }
      } else if (job.name === 'process-profile-image') {
        const { username, url, contextUsername } = job.data as ProcessProfileImageData;
        logger.info(
          `[DownloadWorker] Processing Profile Image for ${username} (Context: ${contextUsername})`,
        );

        const profilesDir = path.join(config.paths.storage, contextUsername, 'profiles');
        ensureDir(profilesDir);

        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const finalFilename = `${username}${ext}`;
        const finalPath = path.join(profilesDir, finalFilename);
        const publicUrl = `/content/${contextUsername}/profiles/${finalFilename}`;

        try {
          if (!fs.existsSync(finalPath)) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await pipeline(response.body as any, createWriteStream(finalPath));
          }

          // If this is the profile pic of the account being scraped, update its main profile URL
          if (username === contextUsername) {
            await prisma.account.update({
              where: { username },
              data: { profileImageUrl: publicUrl },
            });
          }

          // Update collaborator references in all posts of THIS context account
          const allAccountPosts = await prisma.post.findMany({
            where: { username: contextUsername },
          });
          const postsWithThisCollab = allAccountPosts.filter((p) => p.collaborators !== null);

          for (const p of postsWithThisCollab) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cs = p.collaborators as any[];
            if (Array.isArray(cs)) {
              const newCs = cs.map((c) =>
                c.username === username ? { ...c, profilePicUrl: publicUrl } : c,
              );
              await prisma.post.update({
                where: { id: p.id },
                data: { collaborators: newCs },
              });
            }
          }

          logger.info(`[DownloadWorker] Profile image for ${username} complete: ${publicUrl}`);
        } catch (error) {
          logger.error(`[DownloadWorker] Profile Image Job Failed: ${error}`);
          throw error;
        }
      }
    });
  },
  { connection: config.redis, concurrency: 25 },
);

downloadWorker.on('failed', (job, err) => {
  logger.error(`[DownloadWorker] Job ${job?.id} failed: ${err.message}`);
});
