import Fastify from 'fastify';
import { config } from './config';
import { ingestProfile } from './modules/ingestion/ingester';
import { prisma } from './db/prisma';
import cors from '@fastify/cors';
import './queues/processing.worker'; // Register worker


const fastify = Fastify({ logger: true });

import fastifyStatic from '@fastify/static';
import path from 'path';

// ...

fastify.register(cors, {
    origin: true
});

fastify.register(fastifyStatic, {
    root: path.resolve(__dirname, '../storage'),
    prefix: '/content/',
});

fastify.post('/ingest', async (request, reply) => {
    const { username, limit } = request.body as { username: string; limit?: number };

    if (!username) {
        return reply.status(400).send({ error: 'Username is required' });
    }

    // Run in background to avoid timeout
    ingestProfile(username, limit || 10)
        .then(res => {
            fastify.log.info(`[App] Ingestion completed for ${username}: Found ${res.found}, Queued ${res.queued}`);
        })
        .catch(err => {
            fastify.log.error(`[App] Ingestion failed for ${username}: ${err.message}`);
        });

    return { status: 'started', message: `Ingestion started for ${username}` };
});

fastify.get('/accounts', async (request, reply) => {
    try {
        // @ts-ignore
        const accounts = await prisma.account.findMany({
            orderBy: { lastScrapedAt: 'desc' },
            include: { _count: { select: { posts: true } } }
        });
        return accounts;
    } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: "Failed to fetch accounts" });
    }
});

fastify.get('/accounts/:username', async (request, reply) => {
    const { username } = request.params as { username: string };
    try {
        // @ts-ignore
        const account = await prisma.account.findUnique({
            where: { username },
            include: {
                posts: {
                    orderBy: { postedAt: 'desc' },
                    include: {
                        media: true,
                        transcripts: true // Include transcripts for full data access
                    }
                }
            }
        });
        if (!account) return reply.status(404).send({ error: "Account not found" });
        return account;
    } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: "Failed to fetch account" });
    }
});

fastify.get('/posts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
        const post = await prisma.post.findUnique({
            where: { id },
            include: {
                media: true,
                transcripts: true,
                account: true
            }
        });
        if (!post) return reply.status(404).send({ error: "Post not found" });

        // Navigation (Next/Prev based on postedAt for the same account)
        // Newer post (postedAt > current) -> Order ASC, Take 1
        const newerPost = await prisma.post.findFirst({
            where: {
                username: post.username,
                postedAt: { gt: post.postedAt }
            },
            orderBy: { postedAt: 'asc' },
            select: { id: true }
        });

        // Older post (postedAt < current) -> Order DESC, Take 1
        const olderPost = await prisma.post.findFirst({
            where: {
                username: post.username,
                postedAt: { lt: post.postedAt }
            },
            orderBy: { postedAt: 'desc' },
            select: { id: true }
        });

        return {
            ...post,
            newerPostId: newerPost?.id,
            olderPostId: olderPost?.id
        };
    } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: "Failed to fetch post" });
    }
});

fastify.put('/posts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { caption, transcriptText } = request.body as { caption?: string; transcriptText?: string };

    try {
        const post = await prisma.post.findUnique({
            where: { id },
            include: { transcripts: true }
        });

        if (!post) return reply.status(404).send({ error: "Post not found" });

        // Update Caption
        if (caption !== undefined && caption !== post.caption) {
            await prisma.post.update({
                where: { id },
                data: {
                    caption,
                    // If originalCaption is not set, set it to the OLD caption
                    originalCaption: post.originalCaption ?? post.caption
                }
            });
        }

        // Update Transcript (First one)
        if (transcriptText !== undefined && post.transcripts.length > 0) {
            const transcript = post.transcripts[0];
            if (transcript.text !== transcriptText) {
                await prisma.transcript.update({
                    where: { id: transcript.id },
                    data: {
                        text: transcriptText,
                        // If originalText is not set, set it to the OLD text
                        originalText: transcript.originalText ?? transcript.text
                    }
                });
            }
        } else if (transcriptText !== undefined && post.transcripts.length === 0) {
            // Create new if doesn't exist? (Optional, implies manual transcription addition)
            // For now, ignore or throw. Let's create one.
            await prisma.transcript.create({
                data: {
                    postId: id,
                    text: transcriptText,
                    originalText: ''
                }
            });
        }

        return { success: true };
    } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: "Failed to update post" });
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: config.port, host: '0.0.0.0' });
        console.log(`Server listening on ${config.port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
