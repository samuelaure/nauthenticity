import Fastify from 'fastify';
import { config } from './config';
import { ingestProfile } from './modules/ingestion/ingester';
import './queues/processing.worker'; // Register worker

const fastify = Fastify({ logger: true });

fastify.post('/ingest', async (request, reply) => {
    const { username, limit } = request.body as { username: string; limit?: number };

    if (!username) {
        return reply.status(400).send({ error: 'Username is required' });
    }

    // Run in background to avoid timeout
    ingestProfile(username, limit || 10).catch(err => {
        fastify.log.error(err);
    });

    return { status: 'started', message: `Ingestion started for ${username}` };
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
