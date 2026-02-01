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

interface ProcessMediaData {
    postId: string;
    mediaId: string;
    url: string;
    type: 'video' | 'image';
    username: string;
}

interface ProcessProfileImageData {
    username: string;
    url: string;
    contextUsername: string;
}

const ensureDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

export const processingWorker = new Worker(
    'processing-queue',
    async (job: Job<any>) => {
        if (job.name === 'process-media') {
            const { postId, mediaId, url, type, username } = job.data as ProcessMediaData;
            console.log(`[Worker] Processing Media ${mediaId} (${type}) for ${username}`);

            const userDir = path.join(config.paths.storage, username, 'posts');
            ensureDir(userDir);
            ensureDir(config.paths.temp);

            const fileExt = type === 'video' ? 'mp4' : 'jpg';
            const finalFilename = `${mediaId}.${fileExt}`;
            const finalPath = path.join(userDir, finalFilename);
            const publicUrl = `/content/${username}/posts/${finalFilename}`;

            const tempFilePath = path.join(config.paths.temp, `${mediaId}_raw${path.extname(new URL(url).pathname) || (type === 'video' ? '.mp4' : '.jpg')}`);

            try {
                // 1. Download
                console.log(`[Worker] Downloading ${type}: ${url}`);
                const response = await fetch(url, {
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                    },
                });
                if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                // @ts-ignore
                await pipeline(response.body, createWriteStream(tempFilePath));

                if (type === 'video') {
                    // 2. Extract Audio & Transcribe
                    const audioPath = path.join(config.paths.temp, `${mediaId}.mp3`);
                    console.log(`[Worker] Extracting audio...`);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempFilePath).toFormat('mp3').on('end', resolve).on('error', reject).save(audioPath);
                    });

                    console.log(`[Worker] Transcribing...`);
                    const translation = await openai.audio.transcriptions.create({
                        file: fs.createReadStream(audioPath),
                        model: 'whisper-1',
                    });

                    await prisma.transcript.upsert({
                        where: { mediaId: mediaId },
                        update: { text: translation.text, json: translation as any },
                        create: { postId, mediaId, text: translation.text, json: translation as any }
                    });

                    // 3. Optimize Video
                    console.log(`[Worker] Optimizing video...`);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempFilePath)
                            .outputOptions(['-c:v libx264', '-crf 28', '-vf scale=-2:720', '-c:a aac', '-b:a 128k'])
                            .save(finalPath)
                            .on('end', resolve)
                            .on('error', reject);
                    });

                    fs.unlinkSync(audioPath);
                } else {
                    // 2. Just move image to final spot
                    fs.renameSync(tempFilePath, finalPath);
                }

                // 4. Update Database
                await prisma.media.update({
                    where: { id: mediaId },
                    data: { storageUrl: publicUrl }
                });

                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                console.log(`[Worker] Media ${mediaId} complete: ${publicUrl}`);

            } catch (error) {
                console.error(`[Worker] Media Job Failed:`, error);
                throw error;
            }
        }

        else if (job.name === 'process-profile-image') {
            const { username, url, contextUsername } = job.data as ProcessProfileImageData;
            console.log(`[Worker] Processing Profile Image for ${username} (Context: ${contextUsername})`);

            const profilesDir = path.join(config.paths.storage, contextUsername, 'profiles');
            ensureDir(profilesDir);

            const ext = path.extname(new URL(url).pathname) || '.jpg';
            const finalFilename = `${username}${ext}`;
            const finalPath = path.join(profilesDir, finalFilename);
            const publicUrl = `/content/${contextUsername}/profiles/${finalFilename}`;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch profile: ${response.status}`);
                // @ts-ignore
                await pipeline(response.body, createWriteStream(finalPath));

                // If this is the profile pic of the account being scraped, update its main profile URL
                if (username === contextUsername) {
                    await prisma.account.update({
                        where: { username },
                        data: { profileImageUrl: publicUrl }
                    });
                }

                // Update collaborator references in all posts of THIS context account
                const allAccountPosts = await prisma.post.findMany({
                    where: { username: contextUsername }
                });
                const postsWithThisCollab = allAccountPosts.filter(p => p.collaborators !== null);

                for (const p of postsWithThisCollab) {
                    const cs = p.collaborators as any[];
                    if (Array.isArray(cs)) {
                        const newCs = cs.map(c => c.username === username ? { ...c, profilePicUrl: publicUrl } : c);
                        await prisma.post.update({
                            where: { id: p.id },
                            data: { collaborators: newCs }
                        });
                    }
                }

                console.log(`[Worker] Profile image for ${username} complete: ${publicUrl}`);
            } catch (error) {
                console.error(`[Worker] Profile Image Job Failed:`, error);
                throw error;
            }
        }
    },
    { connection: config.redis }
);

