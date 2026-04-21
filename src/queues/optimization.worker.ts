import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { optimizeImage, optimizeVideo } from '../utils/media';
import { computeQueue } from './compute.queue';
import { logContextStorage } from '../utils/context';

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

interface OptimizeMediaData {
  runId: string;
  mediaId: string;
  username: string;
  rawUrl: string;
  type: 'image' | 'video';
  fileExt: string;
}

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const optimizationWorker = new Worker(
  'optimization-queue',
  async (job: Job<OptimizeMediaData>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (job.name === 'optimize-media') {
        const { runId, mediaId, username, rawUrl, type, fileExt } = job.data;
        logger.info(`[OptimizationWorker] Optimizing Media (${type}) for ${username}`);

        ensureDir(config.paths.temp);

        const tempRawPath = path.join(config.paths.temp, `${mediaId}_raw_opt.${fileExt}`);
        const tempOptimizedPath = path.join(config.paths.temp, `${mediaId}_final_opt.${fileExt}`);
        
        const finalStorageKey = `content/${username}/posts/${mediaId}.${fileExt}`;
        const rawStorageKey = `raw/${username}/posts/${mediaId}.${fileExt}`;
        const publicUrl = config.env.R2_PUBLIC_URL
          ? `${config.env.R2_PUBLIC_URL}/${finalStorageKey}`
          : `/content/${username}/posts/${mediaId}.${fileExt}`;

        try {
          if (r2Client && config.env.R2_BUCKET_NAME) {
            // 1. Download raw file from R2
            logger.info(`[OptimizationWorker] Downloading raw media ${mediaId} from R2`);
            const response = await fetch(rawUrl);
            if (!response.ok) throw new Error(`Failed to fetch raw from R2: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(tempRawPath, buffer);

            // 2. Optimize
            logger.info(`[OptimizationWorker] Optimizing media ${mediaId}`);
            if (type === 'video') {
              await optimizeVideo(tempRawPath, tempOptimizedPath);
            } else {
              await optimizeImage(tempRawPath, tempOptimizedPath);
            }

            // 3. Upload Optimized to R2
            logger.info(`[OptimizationWorker] Uploading optimized media ${mediaId} to R2`);
            await r2Client.send(
              new PutObjectCommand({
                Bucket: config.env.R2_BUCKET_NAME,
                Key: finalStorageKey,
                Body: fs.createReadStream(tempOptimizedPath),
                ContentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
              }),
            );
            
            // 4. Delete Raw from R2
            logger.info(`[OptimizationWorker] Deleting raw media ${mediaId} from R2`);
            await r2Client.send(
              new DeleteObjectCommand({
                 Bucket: config.env.R2_BUCKET_NAME,
                 Key: rawStorageKey,
              })
            );
          } else {
            // Fallback Logic (Local)
            const localRawPath = path.join(config.paths.storage, 'raw', username, 'posts', `${mediaId}.${fileExt}`);
            const finalLocalPath = path.join(config.paths.storage, username, 'posts', `${mediaId}.${fileExt}`);
            
            if (fs.existsSync(localRawPath)) {
              if (type === 'video') {
                 await optimizeVideo(localRawPath, tempOptimizedPath);
              } else {
                 await optimizeImage(localRawPath, tempOptimizedPath);
              }
              ensureDir(path.dirname(finalLocalPath));
              fs.copyFileSync(tempOptimizedPath, finalLocalPath);
              fs.unlinkSync(localRawPath); // delete raw
            }
          }

          // 5. Update DB
          await prisma.media.update({
            where: { id: mediaId },
            data: { storageUrl: publicUrl },
          });

          // 6. Check Completion
          const countPendingOptimization = await prisma.media.count({
            where: {
              post: { runId: runId },
              storageUrl: { contains: '/raw/' }
            },
          });

          if (countPendingOptimization === 0) {
            const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
            if (run?.phase === 'optimizing') {
              logger.info(`[OptimizationWorker] Run ${runId} fully optimized. Transitioning to VISUALIZING.`);
              await prisma.scrapingRun.update({
                where: { id: runId },
                data: { phase: 'visualizing' },
              });
              await computeQueue.add('visualize-batch', { runId, username });
            }
          }

        } catch (error) {
          logger.error(`[OptimizationWorker] Failed to optimize media ${mediaId}: ${error}`);
          throw error;
        } finally {
          if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
          if (fs.existsSync(tempOptimizedPath)) fs.unlinkSync(tempOptimizedPath);
        }
      }
    });
  },
  { connection: config.redis, concurrency: 1 } // Low concurrency to protect CPU from starvation
);

optimizationWorker.on('failed', (job, err) => {
  logger.error(`[OptimizationWorker] Job ${job?.id} failed: ${err.message}`);
});
