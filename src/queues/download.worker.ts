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
import { optimizationQueue } from './optimization.queue';
import { createStorage, nauthenticity } from 'nau-storage';
import { optimizeImage } from '../utils/media';

const storage = config.env.R2_ENDPOINT && config.env.R2_ACCESS_KEY_ID && config.env.R2_SECRET_ACCESS_KEY && config.env.R2_BUCKET_NAME && config.env.R2_PUBLIC_URL
  ? createStorage({
      endpoint: config.env.R2_ENDPOINT,
      accessKeyId: config.env.R2_ACCESS_KEY_ID,
      secretAccessKey: config.env.R2_SECRET_ACCESS_KEY,
      bucket: config.env.R2_BUCKET_NAME,
      publicUrl: config.env.R2_PUBLIC_URL,
    })
  : null;

interface ProcessMediaData {
  postId: string;
  mediaId: string;
  runId?: string;
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

export const downloadWorker = new Worker(
  'download-queue',
  async (job: Job<any>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (job.name === 'process-media') {
        const { postId, mediaId, runId, url, type, username } = job.data as ProcessMediaData;
        logger.info(`[DownloadWorker] Downloading Media (${type}) for ${username}`);

        ensureDir(config.paths.temp);

        const fileExt = type === 'video' ? 'mp4' : 'jpg';
        const storageKey = nauthenticity.rawPost(username, mediaId, fileExt);
        const tempFilePath = path.join(
          config.paths.temp,
          `${mediaId}_raw${path.extname(new URL(url).pathname) || (type === 'video' ? '.mp4' : '.jpg')}`,
        );

        try {
          if (runId) {
            const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
            if (run?.isPaused) {
              logger.info(`[DownloadWorker] Run ${runId} is PAUSED. Skipping item processing.`);
              return { paused: true };
            }
          }

          let publicUrl: string;

          if (storage) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(tempFilePath, buffer);

            publicUrl = await storage.upload(storageKey, buffer, {
              mimeType: type === 'video' ? 'video/mp4' : 'image/jpeg',
            });
          } else {
            // Fallback to local storage
            const rawDir = path.join(config.paths.storage, 'raw', username, 'posts');
            ensureDir(rawDir);
            const finalPath = path.join(rawDir, `${mediaId}.${fileExt}`);
            publicUrl = `/content/raw/${username}/posts/${mediaId}.${fileExt}`;

            if (!fs.existsSync(finalPath)) {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
              await pipeline(response.body as any, createWriteStream(tempFilePath));
              await pipeline(response.body as any, createWriteStream(finalPath));
            }
          }

          await prisma.media.update({
            where: { id: mediaId },
            data: { storageUrl: publicUrl },
          });

          if (runId) {
            const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
            if (run?.isPaused) return { paused: true };

            const pendingCount = await prisma.media.count({
              where: {
                post: { runId },
                NOT: [{ storageUrl: { startsWith: storage ? storage.cdnUrl('') : '/content/' } }],
              },
            });

            if (pendingCount === 0) {
              const runState = await prisma.scrapingRun.findUnique({ where: { id: runId } });
              if (runState?.phase === 'downloading') {
                logger.info(
                  `[DownloadWorker] Run ${runId} fully downloaded. Transitioning to OPTIMIZING.`,
                );

                await prisma.scrapingRun.update({
                  where: { id: runId },
                  data: { phase: 'optimizing' },
                });

                const rawMedia = await prisma.media.findMany({
                  where: { post: { runId }, storageUrl: { contains: '/raw/' } },
                });

                if (rawMedia.length > 0) {
                  for (const m of rawMedia) {
                    await optimizationQueue.add(
                      'optimize-media',
                      {
                        runId,
                        mediaId: m.id,
                        username,
                        rawUrl: m.storageUrl,
                        type: m.type as 'image' | 'video',
                        fileExt: m.type === 'video' ? 'mp4' : 'jpg',
                      },
                      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
                    );
                  }
                } else {
                  logger.warn(
                    `[DownloadWorker] Reached optimization transition but found no raw media. Skipping to visualizing.`,
                  );
                  await prisma.scrapingRun.update({
                    where: { id: runId },
                    data: { phase: 'visualizing' },
                  });
                  await computeQueue.add('visualize-batch', { runId, username });
                }
              }
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

        try {
          if (storage) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());

            const tempProfilePath = path.join(config.paths.temp, `profile_${username}_${Date.now()}.jpg`);
            const optimizedProfilePath = path.join(config.paths.temp, `profile_${username}_opt_${Date.now()}.jpg`);
            fs.writeFileSync(tempProfilePath, buffer);
            await optimizeImage(tempProfilePath, optimizedProfilePath);

            const storageKey = nauthenticity.profilePic(contextUsername, 'jpg');
            const publicUrl = await storage.upload(storageKey, fs.createReadStream(optimizedProfilePath), {
              mimeType: 'image/jpeg',
            });

            if (fs.existsSync(tempProfilePath)) fs.unlinkSync(tempProfilePath);
            if (fs.existsSync(optimizedProfilePath)) fs.unlinkSync(optimizedProfilePath);

            if (username === contextUsername) {
              await prisma.igProfile.update({
                where: { username },
                data: { profileImageUrl: publicUrl },
              });
            }

            const allAccountPosts = await prisma.post.findMany({ where: { username: contextUsername } });
            for (const p of allAccountPosts.filter((p) => p.collaborators !== null)) {
              const cs = p.collaborators as any[];
              if (Array.isArray(cs)) {
                const newCs = cs.map((c) =>
                  c.username === username ? { ...c, profilePicUrl: publicUrl } : c,
                );
                await prisma.post.update({ where: { id: p.id }, data: { collaborators: newCs } });
              }
            }

            logger.info(`[DownloadWorker] Profile image for ${username} complete: ${publicUrl}`);
          } else {
            // Fallback
            const profilesDir = path.join(config.paths.storage, contextUsername, 'profiles');
            ensureDir(profilesDir);
            const ext = path.extname(new URL(url).pathname) || '.jpg';
            const finalPath = path.join(profilesDir, `${username}${ext}`);

            if (!fs.existsSync(finalPath)) {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
              const buffer = Buffer.from(await response.arrayBuffer());
              const tempProfilePath = path.join(config.paths.temp, `profile_${username}_${Date.now()}.jpg`);
              fs.writeFileSync(tempProfilePath, buffer);
              await optimizeImage(tempProfilePath, finalPath);
              if (fs.existsSync(tempProfilePath)) fs.unlinkSync(tempProfilePath);
            }
          }
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
