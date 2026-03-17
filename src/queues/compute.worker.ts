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

      if (job.name === 'optimize-batch') {
        const { runId, username } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Optimizing Run ${runId}`);
        const mediaItems = await prisma.media.findMany({ where: { post: { runId } } });

        for (let i = 0; i < mediaItems.length; i++) {
          const m = mediaItems[i];
          await job.updateProgress({ progress: Math.round((i / mediaItems.length) * 100), step: `Optimizing ${i + 1}/${mediaItems.length}` });
          if (m.type === 'video' && m.storageUrl.startsWith('/content/')) {
            const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
            if (fs.existsSync(filePath)) {
              logger.info(`[ComputeWorker] Optimizing ${m.id} (${i + 1}/${mediaItems.length})`);
              await optimizeMedia(m.id, filePath);
            }
          }
        }

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'visualizing' } });
        await computeQueue.add('visualize-batch', { runId, username });

      } else if (job.name === 'visualize-batch') {
        const { runId, username } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Visualizing Run ${runId}`);
        const mediaItems = await prisma.media.findMany({ where: { post: { runId } } });
        const userDir = path.join(config.paths.storage, username, 'posts');
        ensureDir(userDir);

        for (let i = 0; i < mediaItems.length; i++) {
          const m = mediaItems[i];
          await job.updateProgress({ progress: Math.round((i / mediaItems.length) * 100), step: `Thumbnails ${i + 1}/${mediaItems.length}` });
          if (m.storageUrl.startsWith('/content/')) {
            const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
            if (fs.existsSync(filePath)) {
              logger.info(`[ComputeWorker] Thumbnail for ${m.id} (${i+1}/${mediaItems.length})`);
              await generateThumbnail(m.id, filePath, userDir, username, m.type);
            }
          }
        }

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'profiling' } });
        await computeQueue.add('profile-sync-batch', { runId, username });

      } else if (job.name === 'profile-sync-batch') {
        const { runId, username: contextUsername } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Profiling Run ${runId}`);
        
        const account = await prisma.account.findUnique({ where: { username: contextUsername } });
        if (account?.profileImageUrl) {
           await downloadQueue.add('process-profile-image', { username: contextUsername, url: account.profileImageUrl, contextUsername });
        }

        const posts = await prisma.post.findMany({ where: { runId }, select: { collaborators: true } });
        const collabs = new Set<string>();
        for (const p of posts) {
          const cs = p.collaborators as any[];
          if (Array.isArray(cs)) cs.forEach(c => c.username && c.profilePicUrl && collabs.add(JSON.stringify({ u: c.username, p: c.profilePicUrl })));
        }

        for (const cStr of collabs) {
          const { u, p } = JSON.parse(cStr);
          await downloadQueue.add('process-profile-image', { username: u, url: p, contextUsername });
        }

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'transcribing' } });
        await computeQueue.add('transcribe-batch', { runId, username: contextUsername });

      } else if (job.name === 'transcribe-batch') {
        const { runId, username } = job.data as { runId: string; username: string };
        logger.info(`[ComputeWorker] Phase: Transcribing Run ${runId}`);
        const mediaItems = await prisma.media.findMany({ where: { post: { runId }, type: 'video' } });

        for (let i = 0; i < mediaItems.length; i++) {
          const m = mediaItems[i];
          await job.updateProgress({ progress: Math.round((i / mediaItems.length) * 100), step: `Transcribing ${i + 1}/${mediaItems.length}` });
          if (m.storageUrl.startsWith('/content/')) {
            const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
            if (fs.existsSync(filePath)) {
              logger.info(`[ComputeWorker] Transcribing ${m.id} (${i+1}/${mediaItems.length})`);
              await transcribeVideo(m.id, m.postId, filePath);
            }
          }
        }

        await prisma.scrapingRun.update({ where: { id: runId }, data: { phase: 'finished', status: 'completed' } });
      }
    });
  },
  { connection: config.redis, concurrency: 1 }, // Compute intensive, set concurrency to 1
);

computeWorker.on('failed', (job, err) => {
  logger.error(`[ComputeWorker] Job ${job?.id} failed: ${err.message}`);
});
