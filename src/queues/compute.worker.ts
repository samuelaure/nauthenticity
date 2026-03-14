import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { transcribeAudio } from '../services/transcription.service';
import { logContextStorage } from '../utils/context';

interface ComputeVideoData {
  postId: string;
  mediaId: string;
  filePath: string;
  publicUrl: string;
}

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const computeWorker = new Worker(
  'compute-queue',
  async (job: Job<any>) => {
    return logContextStorage.run({ jobId: job.id, ...job.data }, async () => {
      if (job.name === 'compute-video') {
        const { postId, mediaId, filePath, publicUrl } = job.data as ComputeVideoData;
        logger.info(`[ComputeWorker] Computing Video: ${mediaId}`);
        ensureDir(config.paths.temp);

        const audioPath = path.join(config.paths.temp, `${mediaId}.mp3`);
        const optimizedTempFilePath = path.join(config.paths.temp, `${mediaId}_optimized.mp4`);

        try {
          if (!fs.existsSync(filePath)) {
            throw new Error(`[ComputeWorker] File not found perfectly at ${filePath}`);
          }

          // 1. Extract Audio & Transcribe
          logger.info(`[ComputeWorker] Extracting audio for ${mediaId}`);
          await new Promise((resolve, reject) => {
            ffmpeg(filePath).toFormat('mp3').on('end', resolve).on('error', reject).save(audioPath);
          });

          logger.info(`[ComputeWorker] Transcribing ${mediaId}`);
          const translation = await transcribeAudio(audioPath);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const jsonPayload = translation as any;
          await prisma.transcript.upsert({
            where: { mediaId: mediaId },
            update: { text: translation.text, json: jsonPayload },
            create: { postId, mediaId, text: translation.text, json: jsonPayload },
          });

          // 2. Optimize Video
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
          fs.renameSync(optimizedTempFilePath, filePath);

          logger.info(`[ComputeWorker] Video processing complete: ${publicUrl}`);
        } catch (error) {
          logger.error(`[ComputeWorker] Failed to compute video ${mediaId}: ${error}`);
          throw error;
        } finally {
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          if (fs.existsSync(optimizedTempFilePath)) fs.unlinkSync(optimizedTempFilePath);
        }
      }
    });
  },
  { connection: config.redis, concurrency: 1 }, // Compute intensive, set concurrency to 1 to prevent resource exhaustion
);

computeWorker.on('failed', (job, err) => {
  logger.error(`[ComputeWorker] Job ${job?.id} failed: ${err.message}`);
});
