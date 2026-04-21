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
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// R2 Client Initialization
// ---------------------------------------------------------------------------
const r2Client =
  config.env.R2_ACCESS_KEY_ID && config.env.R2_SECRET_ACCESS_KEY && config.env.R2_ENDPOINT
    ? new S3Client({
        region: 'auto',
        endpoint: config.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: config.env.R2_ACCESS_KEY_ID,
          secretAccessKey: config.env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

// ---------------------------------------------------------------------------
// Pipeline Step Registry
// Each step is a named handler. The PIPELINE constant below defines the order.
// To re-sort the pipeline, simply change the order of step names in PIPELINE.
// ---------------------------------------------------------------------------

export type PipelineStepName =
  | 'visualize-batch'
  | 'profile-sync-batch'
  | 'optimize-batch'
  | 'transcribe-batch'
  | 'embed-batch';

/** Ordered execution sequence. Modify this array to re-sort the pipeline. */
const PIPELINE: PipelineStepName[] = [
  'visualize-batch',
  'profile-sync-batch',
  'optimize-batch',
  'transcribe-batch',
  'embed-batch',
];

/** Maps a pipeline step name to the DB phase label used in scrapingRun.phase */
export const PHASE_LABELS: Record<PipelineStepName, string> = {
  'visualize-batch': 'visualizing',
  'profile-sync-batch': 'profiling',
  'optimize-batch': 'optimizing',
  'transcribe-batch': 'transcribing',
  'embed-batch': 'embedding',
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

const optimizeMedia = async (mediaId: string, filePath: string): Promise<string> => {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) throw new Error('Media not found');

  const optimizedTempFilePath = path.join(
    config.paths.temp,
    `${mediaId}_opt${media.type === 'video' ? '.mp4' : '.jpg'}`,
  );
  ensureDir(config.paths.temp);

  try {
    if (media.type === 'video') {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .outputOptions(['-c:v libx264', '-crf 28', '-vf scale=-2:720', '-c:a aac', '-b:a 128k'])
          .save(optimizedTempFilePath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
    } else {
      // For images, we can do a simple resize/compression if needed,
      // but for now we'll just copy or leave placeholder for future image optimization
      fs.copyFileSync(filePath, optimizedTempFilePath);
    }
    return optimizedTempFilePath;
  } catch (err) {
    if (fs.existsSync(optimizedTempFilePath)) fs.unlinkSync(optimizedTempFilePath);
    throw err;
  }
};

const ensureLocalFile = async (
  storageUrl: string,
  mediaId: string,
): Promise<{ path: string; isTemp: boolean }> => {
  if (storageUrl.startsWith('/content/')) {
    const localPath = path.join(config.paths.storage, storageUrl.replace('/content/', ''));
    if (fs.existsSync(localPath)) {
      return { path: localPath, isTemp: false };
    }
    throw new Error(`Local file not found: ${localPath}`);
  }

  // Handle R2 or other remote URLs
  if (!r2Client || !config.env.R2_BUCKET_NAME) {
    throw new Error('R2 client not configured for remote file download');
  }

  const url = new URL(storageUrl);
  const key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  // If the PUBLIC_URL is used, it might contain the bucket name or a custom domain.
  // We need to extract the key properly.
  // Let's assume the key is simply the part after the last slash if it's a simple CDN,
  // or use the pathname if it's a direct R2 URL.
  // For naŭthenticity, the key is usually 'content/{username}/posts/{mediaId}.{ext}'
  const actualKey = key.includes('content/') ? key.substring(key.indexOf('content/')) : key;

  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: config.env.R2_BUCKET_NAME,
      Key: actualKey,
    }),
  );

  const tempPath = path.join(config.paths.temp, `${mediaId}_raw`);
  ensureDir(config.paths.temp);

  const stream = response.Body as Readable;
  const writeStream = fs.createWriteStream(tempPath);
  await new Promise((resolve, reject) => {
    stream.pipe(writeStream).on('finish', resolve).on('error', reject);
  });

  return { path: tempPath, isTemp: true };
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
  let finalThumbUrl = thumbPublicUrl;

  // 1. Generate local thumbnail
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

  // 2. Upload to R2 if enabled
  if (r2Client && config.env.R2_BUCKET_NAME) {
    const storageKey = `content/${username}/posts/${thumbFilename}`;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: config.env.R2_BUCKET_NAME,
        Key: storageKey,
        Body: fs.createReadStream(thumbPath),
        ContentType: 'image/jpeg',
      }),
    );
    finalThumbUrl = config.env.R2_PUBLIC_URL
      ? `${config.env.R2_PUBLIC_URL}/${storageKey}`
      : thumbPublicUrl;

    // Cleanup local thumb after upload
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }

  await prisma.media.update({ where: { id: mediaId }, data: { thumbnailUrl: finalThumbUrl } });
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
    const jsonPayload = transcription as any; // Final fallback for pervasive type issue
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

const createEmbedding = async (text: string, transcriptId: string): Promise<void> => {
  const { OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.replace(/\n/g, ' '),
    encoding_format: 'float',
  });

  const embedding = response.data[0].embedding;

  await prisma.$executeRaw`
    INSERT INTO "Embedding" ("id", "transcriptId", "vector", "model", "createdAt")
    VALUES (
      gen_random_uuid(), 
      ${transcriptId}, 
      ${embedding}::vector, 
      'text-embedding-3-small', 
      NOW()
    )
    ON CONFLICT ("transcriptId") DO UPDATE SET
      "vector" = ${embedding}::vector,
      "createdAt" = NOW();
  `;
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
    // B4: Optimize Pause Check (only check every 50 items)
    if (i % 50 === 0) {
      if (await checkPaused(runId)) {
        logger.info(`[ComputeWorker] Run ${runId} PAUSED during Visualization. Stopping batch.`);
        return { paused: true };
      }
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

    try {
      const { path: filePath, isTemp } = await ensureLocalFile(m.storageUrl, m.id);
      try {
        logger.info(`[ComputeWorker] Thumbnail for ${m.id} (@${currentItem.username})`);
        await generateThumbnail(m.id, filePath, userDir, username, m.type);
      } catch (err) {
        logger.error(`[ComputeWorker] Failed to generate thumbnail for ${m.id}: ${err}`);
      } finally {
        if (isTemp && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (err) {
      logger.error(`[ComputeWorker] Failed to ensure local file for thumbnail ${m.id}: ${err}`);
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

        await prisma.igProfile.updateMany({
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
    // B4: Optimize Pause Check (only check every 50 items)
    if (i % 50 === 0) {
      if (await checkPaused(runId)) {
        logger.info(`[ComputeWorker] Run ${runId} PAUSED during Optimization. Stopping batch.`);
        return { paused: true };
      }
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

    try {
      const { path: filePath, isTemp } = await ensureLocalFile(m.storageUrl, m.id);
      try {
        logger.info(`[ComputeWorker] Optimizing ${m.id} for @${currentItem.username}`);
        const optimizedPath = await optimizeMedia(m.id, filePath);

        if (m.storageUrl.startsWith('http') && r2Client && config.env.R2_BUCKET_NAME) {
          // If remote, upload optimized and overwrite
          const url = new URL(m.storageUrl);
          const key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
          const actualKey = key.includes('content/') ? key.substring(key.indexOf('content/')) : key;

          await r2Client.send(
            new PutObjectCommand({
              Bucket: config.env.R2_BUCKET_NAME,
              Key: actualKey,
              Body: fs.createReadStream(optimizedPath),
              ContentType: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
            }),
          );
          logger.info(`[ComputeWorker] Uploaded optimized media to R2: ${actualKey}`);
        } else {
          // If local, overwrite original
          atomicMove(optimizedPath, filePath);
        }

        if (fs.existsSync(optimizedPath)) fs.unlinkSync(optimizedPath);
      } catch (err) {
        logger.error(`[ComputeWorker] Failed to optimize media ${m.id}: ${err}`);
      } finally {
        if (isTemp && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (err) {
      logger.error(`[ComputeWorker] Failed to ensure local file for optimization ${m.id}: ${err}`);
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
    // B4: Optimize Pause Check (only check every 50 items)
    if (i % 50 === 0) {
      if (await checkPaused(runId)) {
        logger.info(`[ComputeWorker] Run ${runId} PAUSED during Transcription. Stopping batch.`);
        return { paused: true };
      }
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

    try {
      const { path: filePath, isTemp } = await ensureLocalFile(m.storageUrl, m.id);
      try {
        logger.info(`[ComputeWorker] Transcribing ${m.id} (@${currentItem.username})`);
        await transcribeVideo(m.id, m.postId, filePath);
      } catch (err) {
        logger.error(`[ComputeWorker] Failed to transcribe media ${m.id}: ${err}`);
      } finally {
        if (isTemp && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (err) {
      logger.error(`[ComputeWorker] Failed to ensure local file for transcription ${m.id}: ${err}`);
    }
  }
};

const handleEmbedBatch = async (
  job: Job,
  runId: string,
  _username: string,
  checkPaused: PauseChecker,
): Promise<{ paused: true } | void> => {
  logger.info(`[ComputeWorker] Phase: Embedding Run ${runId}`);
  const transcripts = await prisma.transcript.findMany({
    where: { post: { runId }, embedding: { is: null } },
    include: { post: true },
  });

  for (let i = 0; i < transcripts.length; i++) {
    if (i % 50 === 0) {
      if (await checkPaused(runId)) {
        logger.info(`[ComputeWorker] Run ${runId} PAUSED during Embedding. Stopping batch.`);
        return { paused: true };
      }
    }
    const t = transcripts[i];

    await job.updateProgress({
      progress: Math.round((i / transcripts.length) * 100),
      step: `Embedding ${i + 1}/${transcripts.length}`,
      currentItem: {
        username: t.post.username ?? 'unknown',
        postedAt: t.post.postedAt.toISOString().split('T')[0],
        type: 'embedding',
      },
    });

    try {
      logger.info(`[ComputeWorker] Generating embedding for transcript ${t.id}`);
      await createEmbedding(t.text, t.id);
    } catch (e) {
      logger.error(`[ComputeWorker] Failed to embed transcript ${t.id}: ${e}`);
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
  'embed-batch': handleEmbedBatch,
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
