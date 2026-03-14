import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { transcribeAudio } from '../services/transcription.service';
import { logContextStorage } from '../utils/context';

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

export const computeWorker = new Worker(
  'compute-queue',
  async (job: Job<any>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      const { postId, mediaId, type, username } = job.data as ComputeMediaData;
      
      const media = await prisma.media.findUnique({ where: { id: mediaId } });
      if (!media) throw new Error(`[ComputeWorker] Media ${mediaId} not found in DB`);

      // storageUrl is e.g. "/content/violeta_homeschool/posts/abc.mp4"
      // we need to map it to local filesystem path
      if (!media.storageUrl.startsWith('/content/')) {
        throw new Error(`[ComputeWorker] Media ${mediaId} is not yet local (${media.storageUrl}). Postponing.`);
      }

      const relativePath = media.storageUrl.replace('/content/', '');
      const filePath = path.join(config.paths.storage, relativePath);
      
      const userDir = path.join(config.paths.storage, username, 'posts');
      const thumbFilename = `${mediaId}_thumb.jpg`;
      const thumbPath = path.join(userDir, thumbFilename);
      const thumbPublicUrl = `/content/${username}/posts/${thumbFilename}`;
      const publicUrl = media.storageUrl;

      if (job.name === 'compute-video') {
        logger.info(`[ComputeWorker] Computing Video: ${mediaId} (${username})`);
        
        // Check if we even need to work
        const existingTranscript = await prisma.transcript.findUnique({ where: { mediaId } });
        const hasThumbnail = !!media.thumbnailUrl && fs.existsSync(thumbPath);

        if (existingTranscript && hasThumbnail) {
           logger.info(`[ComputeWorker] Video ${mediaId} already has transcript and thumbnail. Skipping.`);
           return;
        }

        ensureDir(config.paths.temp);

        const audioPath = path.join(config.paths.temp, `${mediaId}.mp3`);
        const optimizedTempFilePath = path.join(config.paths.temp, `${mediaId}_optimized.mp4`);

        try {
          if (!fs.existsSync(filePath)) {
            throw new Error(`[ComputeWorker] File not found at ${filePath}`);
          }

          // 1. Extract Audio & Transcribe (Only if missing)
          if (!existingTranscript) {
            logger.info(`[ComputeWorker] Extracting audio for ${mediaId}`);
            await new Promise((resolve, reject) => {
              ffmpeg(filePath)
                .toFormat('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(audioPath);
            });

            logger.info(`[ComputeWorker] Transcribing ${mediaId}`);
            const translation = await transcribeAudio(audioPath);

            const jsonPayload = translation as any;
            await prisma.transcript.upsert({
              where: { mediaId: mediaId },
              update: { text: translation.text, json: jsonPayload },
              create: { postId, mediaId, text: translation.text, json: jsonPayload },
            });
          } else {
            logger.info(`[ComputeWorker] Transcript already exists for ${mediaId}, skipping AI.`);
          }

          // 2. Generate Thumbnail (Screenshot) (Only if missing)
          if (!hasThumbnail) {
            logger.info(`[ComputeWorker] Generating video thumbnail for ${mediaId}`);
            await new Promise((resolve, reject) => {
              ffmpeg(filePath)
                .screenshots({
                  timestamps: [1], // 1 second in
                  filename: thumbFilename,
                  folder: userDir,
                  size: '640x?',
                })
                .on('end', resolve)
                .on('error', reject);
            });

            // 3. Optimize Video (We only optimize when we generate a new thumbnail usually, 
            // or if we want to ensure all videos are lean. Let's keep it tied to thumbnail generation 
            // or missing thumb for simplicity of this "fix")
            logger.info(`[ComputeWorker] Optimizing video for ${mediaId}`);
            await new Promise((resolve, reject) => {
              ffmpeg(filePath)
                .outputOptions([
                  '-c:v libx264',
                  '-crf 28',
                  '-vf scale=-2:720',
                  '-c:a aac',
                  '-b:a 128k',
                ])
                .save(optimizedTempFilePath)
                .on('end', resolve)
                .on('error', reject);
            });

            // Atomic rename overwriting the original file with the optimized version
            atomicMove(optimizedTempFilePath, filePath);

            // Update DB with thumbnail
            await prisma.media.update({
              where: { id: mediaId },
              data: { thumbnailUrl: thumbPublicUrl },
            });
          }

          logger.info(`[ComputeWorker] Video processing complete: ${publicUrl}`);
        } catch (error) {
          logger.error(`[ComputeWorker] Failed to compute video ${mediaId}: ${error}`);
          throw error;
        } finally {
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          if (fs.existsSync(optimizedTempFilePath)) fs.unlinkSync(optimizedTempFilePath);
        }
      } else if (job.name === 'compute-image') {
        logger.info(`[ComputeWorker] Computing Image Thumbnail: ${mediaId} (${username})`);
        try {
          if (!fs.existsSync(filePath)) {
            throw new Error(`[ComputeWorker] Image file not found at ${filePath}`);
          }
          await new Promise((resolve, reject) => {
            ffmpeg(filePath)
              .size('640x?')
              .save(thumbPath)
              .on('end', resolve)
              .on('error', reject);
          });

          await prisma.media.update({
            where: { id: mediaId },
            data: { thumbnailUrl: thumbPublicUrl },
          });
          logger.info(`[ComputeWorker] Image thumbnail complete: ${thumbPublicUrl}`);
        } catch (error) {
          logger.error(`[ComputeWorker] Failed to compute image ${mediaId}: ${error}`);
          throw error;
        }
      }
    });
  },
  { connection: config.redis, concurrency: 1 }, // Compute intensive, set concurrency to 1 to prevent resource exhaustion
);

computeWorker.on('failed', (job, err) => {
  logger.error(`[ComputeWorker] Job ${job?.id} failed: ${err.message}`);
});
