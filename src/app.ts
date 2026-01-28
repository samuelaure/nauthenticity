import Fastify from 'fastify';
import { config } from './config';
import { ingestProfile } from './modules/ingestion/ingester';
import { prisma } from './db/prisma';
import cors from '@fastify/cors';
import './queues/processing.worker'; // Register worker


const fastify = Fastify({ logger: true });

fastify.register(cors, {
    origin: true
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
        return post;
    } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: "Failed to fetch post" });
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
