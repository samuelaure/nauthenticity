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

export const processingWorker = new Worker('processing-queue', async (job: Job<ProcessJobData>) => {
    console.log(`[Worker] Processing Job ${job.id} for Post ${job.data.postId}`);
    ensureTempDir();

    const { postId, videoUrl } = job.data;
    const uniqueId = `${Date.now()}-${postId}`;
    const videoPath = path.join(config.paths.temp, `${uniqueId}.mp4`);
    const audioPath = path.join(config.paths.temp, `${uniqueId}.mp3`);

    try {
        // 1. Download Video
        console.log(`[Worker] Downloading video...`);
        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.statusText}`);
        // @ts-ignore
        await pipeline(response.body, createWriteStream(videoPath));

        // 2. Extract Audio
        console.log(`[Worker] Extracting audio...`);
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .toFormat('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(audioPath);
        });

        // 3. Transcribe with Whisper API
        console.log(`[Worker] Transcribing with OpenAI Whisper...`);
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-1',
        });

        // 4. Save to Database
        console.log(`[Worker] Saving transcript...`);
        await prisma.transcript.create({
            data: {
                postId,
                text: transcription.text,
                json: transcription as any,
            },
        });

        // 5. Cleanup
        console.log(`[Worker] Cleanup done.`);
    } catch (error) {
        console.error(`[Worker] Job Failed:`, error);
        throw error;
    } finally {
        // Cleanup files
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }

}, {
    connection: config.redis,
});
