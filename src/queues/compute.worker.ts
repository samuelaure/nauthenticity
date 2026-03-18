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
import { getProfilesInfo } from '../services/apify.service';

// ---------------------------------------------------------------------------
// Pipeline Step Registry
// Each step is a named handler. The PIPELINE constant below defines the order.
// To re-sort the pipeline, simply change the order of step names in PIPELINE.
// ---------------------------------------------------------------------------

type PipelineStepName =
  | 'visualize-batch'
  | 'profile-sync-batch'
  | 'optimize-batch'
  | 'transcribe-batch';

/** Ordered execution sequence. Modify this array to re-sort the pipeline. */
const PIPELINE: PipelineStepName[] = [
  'visualize-batch',
  'profile-sync-batch',
  'optimize-batch',
  'transcribe-batch',
];

/** Maps a pipeline step name to the DB phase label used in scrapingRun.phase */
const PHASE_LABELS: Record<PipelineStepName, string> = {
  'visualize-batch': 'visualizing',
  'profile-sync-batch': 'profiling',
  'optimize-batch': 'optimizing',
  'transcribe-batch': 'transcribing',
};

/** Returns the next step name in the pipeline, or null if this is the last step. */
function getNextStep(current: PipelineStepName): PipelineStepName | null {
  const idx = PIPELINE.indexOf(current);
  if (idx === -1 || idx === PIPELINE.length - 1) return null;
  return PIPELINE[idx + 1];
}

/** Transitions the run to the next pipeline step, or marks it finished. */
async function advanceOrFinish(
  runId: string,
  username: string,
  current: PipelineStepName,
): Promise<void> {
  const next = getNextStep(current);

  if (next) {
    await prisma.scrapingRun.update({
      where: { id: runId },
      data: { phase: PHASE_LABELS[next] },
    });
    await computeQueue.add(next, { runId, username });
  } else {
    await prisma.scrapingRun.update({
      where: { id: runId },
      data: { phase: 'finished', status: 'completed' },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const atomicMove = (oldPath: string, newPath: string): void => {
  try {
    fs.renameSync(oldPath, newPath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'EXDEV') {
      fs.copyFileSync(oldPath, newPath);
      fs.unlinkSync(oldPath);
    } else {
      throw err;
    }
  }
};

const optimizeMedia = async (mediaId: string, filePath: string): Promise<void> => {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.type !== 'video') return;

  const optimizedTempFilePath = path.join(config.paths.temp, `${mediaId}_optimized.mp4`);
  ensureDir(config.paths.temp);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions(['-c:v libx264', '-crf 28', '-vf scale=-2:720', '-c:a aac', '-b:a 128k'])
        .save(optimizedTempFilePath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
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
): Promise<void> => {
  const thumbFilename = `${mediaId}_thumb.jpg`;
  const thumbPath = path.join(userDir, thumbFilename);
  const thumbPublicUrl = `/content/${username}/posts/${thumbFilename}`;

  await new Promise<void>((resolve, reject) => {
    const proc = ffmpeg(filePath);
    if (type === 'video') {
      proc
        .screenshots({ timestamps: [1], filename: thumbFilename, folder: userDir, size: '640x?' })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    } else {
      proc
        .size('640x?')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(thumbPath);
    }
  });

  await prisma.media.update({ where: { id: mediaId }, data: { thumbnailUrl: thumbPublicUrl } });
};

const transcribeVideo = async (
  mediaId: string,
  postId: string,
  filePath: string,
): Promise<void> => {
  const audioPath = path.join(config.paths.temp, `${mediaId}.mp3`);
  ensureDir(config.paths.temp);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .toFormat('mp3')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(audioPath);
    });
    const transcription = await transcribeAudio(audioPath);
    // Cast via unknown first to satisfy Prisma's InputJsonValue type
    const jsonPayload = transcription as unknown as import('@prisma/client').Prisma.InputJsonValue;
    await prisma.transcript.upsert({
      where: { mediaId },
      update: { text: transcription.text, json: jsonPayload },
      create: {
        postId,
        mediaId,
        text: transcription.text,
        json: jsonPayload,
      },
    });
  } finally {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
};

// ---------------------------------------------------------------------------
// Pipeline Step Handlers
// ---------------------------------------------------------------------------

type PauseChecker = (runId: string) => Promise<boolean>;

const handleVisualizeBatch = async (
  job: Job,
  runId: string,
  username: string,
  checkPaused: PauseChecker,
): Promise<{ paused: true } | void> => {
  logger.info(`[ComputeWorker] Phase: Visualizing Run ${runId}`);
  const mediaItems = await prisma.media.findMany({
    where: { post: { runId } },
    include: { post: true },
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
      type: m.type,
    };

    await job.updateProgress({
      progress: Math.round((i / mediaItems.length) * 100),
      step: `Thumbnails ${i + 1}/${mediaItems.length}`,
      currentItem,
    });

    if (m.storageUrl.startsWith('/content/')) {
      const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
      if (fs.existsSync(filePath)) {
        logger.info(`[ComputeWorker] Thumbnail for ${m.id} (@${currentItem.username})`);
        await generateThumbnail(m.id, filePath, userDir, username, m.type);
      }
    }
  }
};

const handleProfileSyncBatch = async (
  job: Job,
  runId: string,
  username: string,
  checkPaused: PauseChecker,
): Promise<{ paused: true } | void> => {
  logger.info(`[ComputeWorker] Phase: Profiling Run ${runId}`);

  if (await checkPaused(runId)) return { paused: true };

  const usernamesToScrape = new Set<string>();
  const posts = await prisma.post.findMany({
    where: { runId },
    select: { username: true, postedAt: true, collaborators: true },
  });

  for (let i = 0; i < posts.length; i++) {
    if (await checkPaused(runId)) return { paused: true };
    const p = posts[i];

    await job.updateProgress({
      progress: Math.round((i / posts.length) * 100),
      step: `Identifying Collaborators ${i + 1}/${posts.length}`,
      currentItem: {
        username: p.username,
        postedAt: p.postedAt.toISOString().split('T')[0],
        type: 'profile',
      },
    });

    const cs = p.collaborators as { username?: string }[] | null;
    if (Array.isArray(cs)) {
      cs.forEach((c) => {
        if (c.username && c.username !== username) {
          usernamesToScrape.add(c.username);
        }
      });
    }
  }

  const usernamesArray = Array.from(usernamesToScrape);
  if (usernamesArray.length > 0) {
    logger.info(
      `[ComputeWorker] Fetching fresh HD profile info for ${usernamesArray.length} collaborators in batch...`,
    );

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
          currentItem: { username: profile.username, postedAt: '(collab)', type: 'profile' },
        });

        const imgUrl = profile.profilePicUrlHD || profile.profilePicUrl;

        await prisma.account.updateMany({
          where: { username: profile.username },
          data: { profileImageUrl: imgUrl },
        });

        await downloadQueue.add('process-profile-image', {
          username: profile.username,
          url: imgUrl,
          contextUsername: username,
        });
      }
    } catch (e) {
      logger.warn(`[ComputeWorker] Failed to sync batch profiles: ${e}`);
    }
  } else {
    logger.info(`[ComputeWorker] No new collaborators to sync.`);
  }
};

const handleOptimizeBatch = async (
  job: Job,
  runId: string,
  username: string,
  checkPaused: PauseChecker,
): Promise<{ paused: true } | void> => {
  logger.info(`[ComputeWorker] Phase: Optimizing Run ${runId}`);
  const mediaItems = await prisma.media.findMany({
    where: { post: { runId } },
    include: { post: true },
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
      type: m.type,
    };

    await job.updateProgress({
      progress: Math.round((i / mediaItems.length) * 100),
      step: `Optimizing ${i + 1}/${mediaItems.length}`,
      currentItem,
    });

    if (m.type === 'video' && m.storageUrl.startsWith('/content/')) {
      const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
      if (fs.existsSync(filePath)) {
        logger.info(`[ComputeWorker] Optimizing ${m.id} for @${currentItem.username}`);
        await optimizeMedia(m.id, filePath);
      }
    }
  }
};

const handleTranscribeBatch = async (
  job: Job,
  runId: string,
  _username: string,
  checkPaused: PauseChecker,
): Promise<{ paused: true } | void> => {
  logger.info(`[ComputeWorker] Phase: Transcribing Run ${runId}`);
  const mediaItems = await prisma.media.findMany({
    where: { post: { runId }, type: 'video' },
    include: { post: true, transcript: true },
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
      type: m.type,
    };

    await job.updateProgress({
      progress: Math.round((i / mediaItems.length) * 100),
      step: `Transcribing ${i + 1}/${mediaItems.length}`,
      currentItem,
    });

    if (m.storageUrl.startsWith('/content/')) {
      const filePath = path.join(config.paths.storage, m.storageUrl.replace('/content/', ''));
      if (fs.existsSync(filePath)) {
        logger.info(`[ComputeWorker] Transcribing ${m.id} (@${currentItem.username})`);
        await transcribeVideo(m.id, m.postId, filePath);
      }
    }
  }
};

/** Dispatch table mapping each step name to its handler. */
const STEP_HANDLERS: Record<
  PipelineStepName,
  (
    job: Job,
    runId: string,
    username: string,
    checkPaused: PauseChecker,
  ) => Promise<{ paused: true } | void>
> = {
  'visualize-batch': handleVisualizeBatch,
  'profile-sync-batch': handleProfileSyncBatch,
  'optimize-batch': handleOptimizeBatch,
  'transcribe-batch': handleTranscribeBatch,
};

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export const computeWorker = new Worker(
  'compute-queue',
  async (job: Job) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (process.env.PAUSE_COMPUTE === 'true') {
        throw new Error('Compute is paused');
      }

      const checkPaused: PauseChecker = async (runId: string) => {
        const run = await prisma.scrapingRun.findUnique({ where: { id: runId } });
        return run?.isPaused ?? false;
      };

      const stepName = job.name as PipelineStepName;
      const handler = STEP_HANDLERS[stepName];

      if (!handler) {
        logger.warn(`[ComputeWorker] Unknown job name: "${job.name}". Skipping.`);
        return;
      }

      const { runId, username } = job.data as { runId: string; username: string };

      const result = await handler(job, runId, username, checkPaused);
      if (result?.paused) return result;

      if (await checkPaused(runId)) return { paused: true };

      await advanceOrFinish(runId, username, stepName);
    });
  },
  { connection: config.redis, concurrency: 1 }, // Compute intensive, set concurrency to 1
);

computeWorker.on('failed', (job, err) => {
  logger.error(`[ComputeWorker] Job ${job?.id} failed: ${err.message}`);
});
