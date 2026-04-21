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
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { optimizeImage } from '../utils/media';

const r2Client = config.env.R2_ENDPOINT
  ? new S3Client({
      endpoint: config.env.R2_ENDPOINT,
      region: 'auto',
      credentials: {
        accessKeyId: config.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: config.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

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

export const downloadWorker = new Worker(
  'download-queue',
  async (job: Job<any>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (job.name === 'process-media') {
        const { postId, mediaId, runId, url, type, username } = job.data as ProcessMediaData;
        logger.info(`[DownloadWorker] Downloading Media (${type}) for ${username}`);

        const rawDir = path.join(config.paths.storage, 'raw', username, 'posts');
        ensureDir(rawDir);
        ensureDir(config.paths.temp);

        const fileExt = type === 'video' ? 'mp4' : 'jpg';
        const storageKey = `raw/${username}/posts/${mediaId}.${fileExt}`;
        const finalPath = path.join(rawDir, `${mediaId}.${fileExt}`);
        const publicUrl = config.env.R2_PUBLIC_URL
          ? `${config.env.R2_PUBLIC_URL}/${storageKey}`
          : `/content/raw/${username}/posts/${mediaId}.${fileExt}`;

        const tempFilePath = path.join(
          config.paths.temp,
          `${mediaId}_raw${path.extname(new URL(url).pathname) || (type === 'video' ? '.mp4' : '.jpg')}`,
        );

        try {
          // Soft Stop Check
          if (runId) {
            const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
            if (run?.isPaused) {
              logger.info(`[DownloadWorker] Run ${runId} is PAUSED. Skipping item processing.`);
              return { paused: true };
            }
          }

          if (r2Client && config.env.R2_BUCKET_NAME) {
            // 1. Download to memory or temp stream
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(tempFilePath, buffer);

            // 2. Upload to R2 (RAW file)
            await r2Client.send(
              new PutObjectCommand({
                Bucket: config.env.R2_BUCKET_NAME,
                Key: storageKey,
                Body: buffer,
                ContentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
              }),
            );
          } else {
            // Fallback to local storage (existing logic)
            if (!fs.existsSync(finalPath)) {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
              await pipeline(response.body as any, createWriteStream(tempFilePath));

              // Save raw to local fallback
              await pipeline(response.body as any, createWriteStream(finalPath));
            }
          }

          // 3. Update DB
          await prisma.media.update({
            where: { id: mediaId },
            data: { storageUrl: publicUrl },
          });

          // 4. Check if we should trigger next phase (Optimizing)
          if (runId) {
            // Re-check pause before transitioning
            const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
            if (run?.isPaused) return { paused: true };

            const pendingCount = await prisma.media.count({
              where: {
                post: { runId: runId },
                NOT: [
                  {
                    storageUrl: {
                      startsWith: config.env.R2_PUBLIC_URL
                        ? `${config.env.R2_PUBLIC_URL}/`
                        : `/content/`,
                    },
                  },
                ],
              },
            });

            if (pendingCount === 0) {
              const runState = await prisma.scrapingRun.findUnique({ where: { id: runId } });
              if (runState?.phase === 'downloading') {
                logger.info(
                  `[DownloadWorker] Run ${runId} fully downloaded. Securing raw forms complete. Transitioning to OPTIMIZING.`,
                );

                await prisma.scrapingRun.update({
                  where: { id: runId },
                  data: { phase: 'optimizing' },
                });

                // Find all media that are currently in raw state
                const rawMedia = await prisma.media.findMany({
                  where: {
                    post: { runId: runId },
                    storageUrl: { contains: '/raw/' }, // Targets raw entries explicitly
                  },
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
                  // Fallback if no media needed optimization? Extremely rare
                  logger.warn(
                    `[DownloadWorker] Reached optimization transition but found no raw media fields. Skipping to visualizing.`,
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

        const profilesDir = path.join(config.paths.storage, contextUsername, 'profiles');
        ensureDir(profilesDir);

        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const storageKey = `content/${contextUsername}/profiles/${username}${ext}`;
        const finalPath = path.join(profilesDir, `${username}${ext}`);
        const publicUrl = config.env.R2_PUBLIC_URL
          ? `${config.env.R2_PUBLIC_URL}/${storageKey}`
          : `/content/${contextUsername}/profiles/${username}${ext}`;

        try {
          if (r2Client && config.env.R2_BUCKET_NAME) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());

            // Temporary save for optimization
            const tempProfilePath = path.join(
              config.paths.temp,
              `profile_${username}_${Date.now()}.jpg`,
            );
            fs.writeFileSync(tempProfilePath, buffer);
            const optimizedProfilePath = path.join(
              config.paths.temp,
              `profile_${username}_opt_${Date.now()}.jpg`,
            );

            await optimizeImage(tempProfilePath, optimizedProfilePath);

            await r2Client.send(
              new PutObjectCommand({
                Bucket: config.env.R2_BUCKET_NAME,
                Key: storageKey,
                Body: fs.createReadStream(optimizedProfilePath),
                ContentType: 'image/jpeg',
              }),
            );

            // Cleanup
            if (fs.existsSync(tempProfilePath)) fs.unlinkSync(tempProfilePath);
            if (fs.existsSync(optimizedProfilePath)) fs.unlinkSync(optimizedProfilePath);
          } else {
            // Fallback
            if (!fs.existsSync(finalPath)) {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
              const buffer = Buffer.from(await response.arrayBuffer());
              const tempProfilePath = path.join(
                config.paths.temp,
                `profile_${username}_${Date.now()}.jpg`,
              );
              fs.writeFileSync(tempProfilePath, buffer);
              await optimizeImage(tempProfilePath, finalPath);
              if (fs.existsSync(tempProfilePath)) fs.unlinkSync(tempProfilePath);
            }
          }

          // If this is the profile pic of the account being scraped, update its main profile URL
          if (username === contextUsername) {
            await prisma.igProfile.update({
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
