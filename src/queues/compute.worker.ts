import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { transcribeAudio } from '../services/transcription.service';
import { logContextStorage } from '../utils/context';
import { computeQueue } from './compute.queue';
import { downloadQueue } from './download.queue';
import { getProfileInfo, getProfilesInfo } from '../services/apify.service';

interface ComputeMediaData {
  postId: string;
  mediaId: string;
  type: 'video' | 'image'; // Added back to help compute extension
  username: string;
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

const optimizeMedia = async (mediaId: string, filePath: string) => {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.type !== 'video') return;

  const optimizedTempFilePath = path.join(config.paths.temp, `${mediaId}_optimized.mp4`);
  ensureDir(config.paths.temp);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions(['-c:v libx264', '-crf 28', '-vf scale=-2:720', '-c:a aac', '-b:a 128k'])
        .save(optimizedTempFilePath)
        .on('end', resolve)
        .on('error', reject);
    });
    atomicMove(optimizedTempFilePath, filePath);
  } finally {
    if (fs.existsSync(optimizedTempFilePath)) fs.unlinkSync(optimizedTempFilePath);
  }
};

const generateThumbnail = async (
  mediaId: string,
  filePath: string,
  userDir: string,
  username: string,
  type: string,
) => {
  const thumbFilename = `${mediaId}_thumb.jpg`;
  const thumbPath = path.join(userDir, thumbFilename);
  const thumbPublicUrl = `/content/${username}/posts/${thumbFilename}`;

  await new Promise((resolve, reject) => {
    const proc = ffmpeg(filePath);
    if (type === 'video') {
      proc
        .screenshots({ timestamps: [1], filename: thumbFilename, folder: userDir, size: '640x?' })
        .on('end', resolve)
        .on('error', reject);
    } else {
      proc
        .size('640x?')
        .on('end', resolve)
        .on('error', reject)
        .save(thumbPath);
    }
  });

  await prisma.media.update({ where: { id: mediaId }, data: { thumbnailUrl: thumbPublicUrl } });
};

const transcribeVideo = async (mediaId: string, postId: string, filePath: string) => {
  const audioPath = path.join(config.paths.temp, `${mediaId}.mp3`);
  ensureDir(config.paths.temp);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(filePath).toFormat('mp3').on('end', resolve).on('error', reject).save(audioPath);
    });
    const transcription = await transcribeAudio(audioPath);
    await prisma.transcript.upsert({
      where: { mediaId },
      update: { text: transcription.text, json: transcription as any },
      create: { postId, mediaId, text: transcription.text, json: transcription as any },
    });
  } finally {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
};

export const computeWorker = new Worker(
  'compute-queue',
  async (job: Job<any>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (process.env.PAUSE_COMPUTE === 'true') {
        throw new Error('Compute is paused');
      }

      const checkPaused = async (runId: string) => {
        const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
        return run?.isPaused || false;
      };

      if (job.name === 'optimize-batch') {
        const { runId, username } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Optimizing Run ${runId}`);
        const mediaItems = await prisma.media.findMany({ 
          where: { post: { runId } },
          include: { post: true }
        });

        for (let i = 0; i < mediaItems.length; i++) {
          if (await checkPaused(runId)) {
            logger.info(`[ComputeWorker] Run ${runId} PAUSED during Optimization. Stopping batch.`);
            return { paused: true };
          }

          const m = mediaItems[i];
          const currentItem = {
            username: m.post.username,
            postedAt: m.post.postedAt.toISOString().split('T')[0],
            type: m.type
          };

          await job.updateProgress({ 
            progress: Math.round((i / mediaItems.length) * 100), 
            step: `Optimizing ${i + 1}/${mediaItems.length}`,
            currentItem
          });

          if (m.type === 'video' && m.storageUrl.startsWith('/content/')) {
            const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
            if (fs.existsSync(filePath)) {
               // Idempotency check: we don't have an 'isOptimized' flag easily, 
               // but we can check if it's already a small file or just trust optimizeMedia to be safe.
               // For now, optimizeMedia will just do the work.
              logger.info(`[ComputeWorker] Optimizing ${m.id} for @${currentItem.username}`);
              await optimizeMedia(m.id, filePath);
            }
          }
        }

        if (await checkPaused(runId)) return { paused: true };

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'visualizing' } });
        await computeQueue.add('visualize-batch', { runId, username });

      } else if (job.name === 'visualize-batch') {
        const { runId, username } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Visualizing Run ${runId}`);
        const mediaItems = await prisma.media.findMany({ 
          where: { post: { runId } },
          include: { post: true }
        });
        const userDir = path.join(config.paths.storage, username, 'posts');
        ensureDir(userDir);

        for (let i = 0; i < mediaItems.length; i++) {
          if (await checkPaused(runId)) {
            logger.info(`[ComputeWorker] Run ${runId} PAUSED during Visualization. Stopping batch.`);
            return { paused: true };
          }
          const m = mediaItems[i];
          
          if (m.thumbnailUrl) {
             logger.info(`[ComputeWorker] Thumbnail already exists for ${m.id}, skipping.`);
             continue;
          }

          const currentItem = {
            username: m.post.username,
            postedAt: m.post.postedAt.toISOString().split('T')[0],
            type: m.type
          };

          await job.updateProgress({ 
            progress: Math.round((i / mediaItems.length) * 100), 
            step: `Thumbnails ${i + 1}/${mediaItems.length}`,
            currentItem
          });

          if (m.storageUrl.startsWith('/content/')) {
            const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
            if (fs.existsSync(filePath)) {
              logger.info(`[ComputeWorker] Thumbnail for ${m.id} (@${currentItem.username})`);
              await generateThumbnail(m.id, filePath, userDir, username, m.type);
            }
          }
        }

        if (await checkPaused(runId)) return { paused: true };

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'profiling' } });
        await computeQueue.add('profile-sync-batch', { runId, username });

      } else if (job.name === 'profile-sync-batch') {
        const { runId, username: contextUsername } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Profiling Run ${runId}`);
        
        if (await checkPaused(runId)) return { paused: true };

        // Get All unique collaborators in one shot (batching)
        // Skip the main contextUsername because we already got their HD profile during the feed ingest!
        const usernamesToScrape = new Set<string>();

        const posts = await prisma.post.findMany({ where: { runId }, select: { username: true, postedAt: true, collaborators: true } });
        for (let i = 0; i < posts.length; i++) {
          if (await checkPaused(runId)) return { paused: true };
          const p = posts[i];

          await job.updateProgress({ 
            progress: Math.round((i / posts.length) * 100), 
            step: `Identifying Collaborators ${i + 1}/${posts.length}`,
            currentItem: { username: p.username, postedAt: p.postedAt.toISOString().split('T')[0], type: 'profile' }
          });

          const cs = p.collaborators as any[];
          if (Array.isArray(cs)) {
            cs.forEach(c => {
              if (c.username && c.username !== contextUsername) {
                usernamesToScrape.add(c.username);
              }
            });
          }
        }

        const usernamesArray = Array.from(usernamesToScrape);
        if (usernamesArray.length > 0) {
          logger.info(`[ComputeWorker] Fetching fresh HD profile info for ${usernamesArray.length} collaborators in batch...`);

        try {
          const profiles = await getProfilesInfo(usernamesArray, async (msg: string) => {
            logger.info(`[ComputeWorker-Profiles] ${msg}`);
          });

          for (let i = 0; i < profiles.length; i++) {
            if (await checkPaused(runId)) return { paused: true };

            const profile = profiles[i];
            if (!profile || !profile.username) continue;

            await job.updateProgress({ 
              progress: Math.round((i / profiles.length) * 100), 
              step: `Syncing Collaborator ${i + 1}/${profiles.length}`,
              currentItem: { username: profile.username, postedAt: '(collab)', type: 'profile' }
            });

            const imgUrl = profile.profilePicUrlHD || profile.profilePicUrl;

            // Upsert the updated high-res URL
            await prisma.account.updateMany({
              where: { username: profile.username },
              data: { profileImageUrl: imgUrl }
            });

            // Queue download of the new high-res image
            await downloadQueue.add('process-profile-image', { 
              username: profile.username, 
              url: imgUrl, 
              contextUsername 
            });
          }
          } catch (e) {
            logger.warn(`[ComputeWorker] Failed to sync batch profiles: ${e}`);
          }
        } else {
          logger.info(`[ComputeWorker] No new collaborators to sync.`);
        }

        if (await checkPaused(runId)) return { paused: true };

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'transcribing' } });
        await computeQueue.add('transcribe-batch', { runId, username: contextUsername });

      } else if (job.name === 'transcribe-batch') {
        const { runId, username } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Transcribing Run ${runId}`);
        const mediaItems = await prisma.media.findMany({ 
          where: { post: { runId }, type: 'video' },
          include: { post: true, transcript: true }
        });

        for (let i = 0; i < mediaItems.length; i++) {
          if (await checkPaused(runId)) {
            logger.info(`[ComputeWorker] Run ${runId} PAUSED during Transcription. Stopping batch.`);
            return { paused: true };
          }
          const m = mediaItems[i];

          if (m.transcript) {
            logger.info(`[ComputeWorker] Transcript already exists for ${m.id}, skipping.`);
            continue;
          }

          const currentItem = {
            username: m.post.username,
            postedAt: m.post.postedAt.toISOString().split('T')[0],
            type: m.type
          };

          await job.updateProgress({ 
            progress: Math.round((i / mediaItems.length) * 100), 
            step: `Transcribing ${i + 1}/${mediaItems.length}`,
            currentItem
          });

          if (m.storageUrl.startsWith('/content/')) {
            const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
            if (fs.existsSync(filePath)) {
              logger.info(`[ComputeWorker] Transcribing ${m.id} (@${currentItem.username})`);
              await transcribeVideo(m.id, m.postId, filePath);
            }
          }
        }
        
        if (await checkPaused(runId)) return { paused: true };

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'finished', status: 'completed' } });
      }
    });
  },
  { connection: config.redis, concurrency: 1 }, // Compute intensive, set concurrency to 1
);

computeWorker.on('failed', (job, err) => {
  logger.error(`[ComputeWorker] Job ${job?.id} failed: ${err.message}`);
});
