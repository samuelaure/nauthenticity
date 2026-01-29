import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { prisma } from '../db/prisma';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

interface ProcessJobData {
  postId: string;
  videoUrl: string;
  instagramUrl: string;
}

const ensureTempDir = () => {
  if (!fs.existsSync(config.paths.temp)) {
    fs.mkdirSync(config.paths.temp);
  }
};

export const processingWorker = new Worker(
  'processing-queue',
  async (job: Job<ProcessJobData>) => {
    console.log(`[Worker] Processing Job ${job.id} for Post ${job.data.postId}`);
    ensureTempDir();

    const { postId, videoUrl } = job.data;
    const uniqueId = `${Date.now()}-${postId}`;
    const videoPath = path.join(config.paths.temp, `${uniqueId}.mp4`);
    const audioPath = path.join(config.paths.temp, `${uniqueId}.mp3`);

    try {
      // 1. Download Video
      console.log(`[Worker] Downloading video: ${videoUrl}`);
      const response = await fetch(videoUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
        },
      });
      if (!response.ok)
        throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
      // @ts-ignore
      await pipeline(response.body, createWriteStream(videoPath));

      // 2. Extract Audio
      console.log(`[Worker] Extracting audio...`);
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath).toFormat('mp3').on('end', resolve).on('error', reject).save(audioPath);
      });

      // 3. Size Check & Transcription
      const stats = fs.statSync(audioPath);
      const MAX_SIZE = 25 * 1024 * 1024; // 25MB limit
      let finalTranscript = '';
      let fullResponse = {};

      if (stats.size > MAX_SIZE) {
        console.log(
          `[Worker] Audio file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Splitting...`,
        );
        // Split into 10 min chunks (600s)
        const chunkPattern = path.join(config.paths.temp, `${uniqueId}_%03d.mp3`);

        await new Promise((resolve, reject) => {
          ffmpeg(audioPath)
            .outputOptions(['-f segment', '-segment_time 600', '-c copy'])
            .on('end', resolve)
            .on('error', reject)
            .save(chunkPattern);
        });

        const chunks = fs
          .readdirSync(config.paths.temp)
          .filter((f) => f.startsWith(`${uniqueId}_`) && f.endsWith('.mp3'))
          .sort();

        console.log(`[Worker] Transcribing ${chunks.length} chunks...`);
        for (const chunk of chunks) {
          const chunkPath = path.join(config.paths.temp, chunk);
          const translation = await openai.audio.transcriptions.create({
            file: fs.createReadStream(chunkPath),
            model: 'whisper-1',
          });
          finalTranscript += translation.text + ' ';
          fs.unlinkSync(chunkPath);
        }
      } else {
        console.log(`[Worker] Transcribing with OpenAI Whisper...`);
        const translation = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          model: 'whisper-1',
        });
        finalTranscript = translation.text;
        fullResponse = translation;
      }

      // 4. Save to Database
      console.log(`[Worker] Saving transcript...`);
      await prisma.transcript.create({
        data: {
          postId,
          text: finalTranscript.trim(),
          json: fullResponse as any,
        },
      });

      // 5. Cleanup
      console.log(`[Worker] Cleanup done.`);
    } catch (error) {
      console.error(`[Worker] Job Failed:`, error);
      throw error;
    } finally {
      // Optimize video and clean up
      const storageDir = config.paths.storage;
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);

      const optimizedPath = path.join(storageDir, `${postId}.mp4`);

      try {
        if (fs.existsSync(videoPath)) {
          console.log(`[Worker] Optimizing video for storage...`);
          await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
              .outputOptions([
                '-c:v libx264',
                '-crf 28', // Balance between size and quality
                '-preset slow', // Better compression
                '-vf scale=-2:720', // Resize to 720p (maintain aspect ratio)
                '-c:a aac',
                '-b:a 128k',
              ])
              .save(optimizedPath)
              .on('end', resolve)
              .on('error', reject);
          });
          console.log(`[Worker] Video optimized and saved to ${optimizedPath}`);

          // Update Media URL to local path
          const media = await prisma.media.findFirst({
            where: { postId, type: 'video' },
          });

          if (media) {
            await prisma.media.update({
              where: { id: media.id },
              data: { storageUrl: optimizedPath },
            });
          }
        }
      } catch (optimizeError) {
        console.error(`[Worker] Optimization failed:`, optimizeError);
        // Don't throw, we successfully transcribed
      }

      // Cleanup temp files
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
  },
  {
    connection: config.redis,
  },
);
