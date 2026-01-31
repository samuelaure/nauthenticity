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
        // USE DETERMINISTIC ID for resumability
        const uniqueId = postId;
        const videoPath = path.join(config.paths.temp, `${uniqueId}.mp4`);
        const audioPath = path.join(config.paths.temp, `${uniqueId}.mp3`);
        const transcriptPath = path.join(config.paths.temp, `${uniqueId}_transcript.json`);

        try {
            // 1. Download Video
            if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
                console.log(`[Worker] Video already exists, skipping download: ${videoPath}`);
            } else {
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
            }

            // 2. Extract Audio
            if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0) {
                console.log(`[Worker] Audio already exists, skipping extraction: ${audioPath}`);
            } else {
                console.log(`[Worker] Extracting audio...`);
                await new Promise((resolve, reject) => {
                    ffmpeg(videoPath).toFormat('mp3').on('end', resolve).on('error', reject).save(audioPath);
                });
            }

            // 3. Size Check & Transcription
            let finalTranscript = '';
            let fullResponse = {};

            if (fs.existsSync(transcriptPath) && fs.statSync(transcriptPath).size > 0) {
                console.log(`[Worker] Transcript cache found, skipping OpenAI call.`);
                const cached = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
                finalTranscript = cached.text;
                fullResponse = cached.fullResponse;
            } else {
                const stats = fs.statSync(audioPath);
                const MAX_SIZE = 25 * 1024 * 1024; // 25MB limit

                if (stats.size > MAX_SIZE) {
                    console.log(
                        `[Worker] Audio file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Splitting...`,
                    );
                    // Split into 10 min chunks (600s)
                    const chunkPattern = path.join(config.paths.temp, `${uniqueId}_%03d.mp3`);

                    // Check if chunks already exist? 
                    // For simplicity, we regenerate chunks if *main* transcript doesn't exist.
                    // Ideally we could check for chunks too, but ffmpeg split is relatively fast compared to download/transcribe.

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
                        // We could also cache individual chunk transcripts here if we wanted deeper resumability
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

                // Save transcript to cache
                fs.writeFileSync(
                    transcriptPath,
                    JSON.stringify({ text: finalTranscript, fullResponse }, null, 2)
                );
            }

            // 4. Save to Database
            console.log(`[Worker] Saving transcript...`);
            // Idempotency check: check if it already exists? 
            // Upsert might be safer if we are retrying, but `create` with unique constraint?
            // Transcript doesn't have unique constraint on `postId` in schema, but relationship is one-to-many?
            // Schema: `postId` is field. `Post` has `transcripts Transcript[]`.
            // We should check if one exists to avoid duplicates.
            const existingTranscript = await prisma.transcript.findFirst({ where: { postId } });
            if (!existingTranscript) {
                await prisma.transcript.create({
                    data: {
                        postId,
                        text: finalTranscript.trim(),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        json: fullResponse as any,
                    },
                });
            } else {
                console.log(`[Worker] Transcript already in DB, skipping create.`);
            }

            // 5. Optimize Video (Moved from finally)
            const storageDir = config.paths.storage;
            if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);

            const optimizedPath = path.join(storageDir, `${postId}.mp4`);

            if (fs.existsSync(optimizedPath)) {
                console.log(`[Worker] Optimized video already exists at ${optimizedPath}`);
            } else {
                if (fs.existsSync(videoPath)) {
                    console.log(`[Worker] Optimizing video for storage...`);
                    await new Promise((resolve, reject) => {
                        ffmpeg(videoPath)
                            .outputOptions([
                                '-c:v libx264',
                                '-crf 28',
                                '-preset slow',
                                '-vf scale=-2:720',
                                '-c:a aac',
                                '-b:a 128k',
                            ])
                            .save(optimizedPath)
                            .on('end', resolve)
                            .on('error', reject);
                    });
                    console.log(`[Worker] Video optimized and saved to ${optimizedPath}`);
                }
            }

            // Update Media URL to local path
            const media = await prisma.media.findFirst({
                where: { postId, type: 'video' },
            });

            if (media && media.storageUrl !== optimizedPath) {
                await prisma.media.update({
                    where: { id: media.id },
                    data: { storageUrl: optimizedPath },
                });
            }

            // 6. Cleanup (Only on success!)
            console.log(`[Worker] Job Complete. Cleaning up temp files...`);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            if (fs.existsSync(transcriptPath)) fs.unlinkSync(transcriptPath);

        } catch (error) {
            console.error(`[Worker] Job Failed:`, error);
            // DO NOT CLEANUP on error - allow retry to pick up files
            throw error;
        }
    },
    {
        connection: config.redis,
    },
);

