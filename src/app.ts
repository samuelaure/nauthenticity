import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'path';

import { env } from './config/env';
import { config } from './config';
import { prisma } from './db/prisma';
import { logger } from './utils/logger';
import { errorHandler } from './utils/errorHandler';

// Import Workers (Registers them with BullMQ)
import './queues/processing.worker';
import './queues/ingestion.worker';

// Import Controllers
import { ingestionController } from './modules/ingestion/ingestion.controller';
import { contentController } from './modules/content/content.controller';
import { analyticsController } from './modules/analytics/analytics.controller';

const fastify = Fastify({
  logger: true,
});

// Configure Plugins
fastify.register(cors, { origin: true });
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Static assets (Media)
fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../storage'),
  prefix: '/content/',
});

// Dashboard Static Files
fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../dashboard/dist'),
  prefix: '/',
  decorateReply: false,
});

// Set Global Error Handler
fastify.setErrorHandler(errorHandler);

import { ingestionQueue } from './queues/ingestion.queue';
import { processingQueue } from './queues/processing.queue';

// Register Routes/Controllers
fastify.get('/health', async () => {
  const [dbHealth, ingestionCount, processingCount] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'error'),
    ingestionQueue.getJobCounts().catch(() => ({})),
    processingQueue.getJobCounts().catch(() => ({})),
  ]);

  return {
    status: dbHealth === 'ok' ? 'ok' : 'degraded',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth,
      ingestionQueue: ingestionCount,
      processingQueue: processingCount,
    },
  };
});

// SPA Fallback: Serve index.html for non-api routes
fastify.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith('/api') || request.raw.url?.startsWith('/content')) {
    return reply.status(404).send({ error: 'Not Found' });
  }
  return reply.sendFile('index.html');
});

fastify.register(ingestionController, { prefix: '/api' });
fastify.register(contentController, { prefix: '/api' });
fastify.register(analyticsController, { prefix: '/api' });
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`[App] Server listening on ${config.port} in ${env.NODE_ENV} mode`);
  } catch (err) {
    logger.error(`[App] Failed to start server: ${err}`);
    process.exit(1);
  }
};

// Graceful Shutdown
const shutdown = async (signal: string) => {
  logger.info(`[App] ${signal} received. Starting graceful shutdown...`);

  try {
    await fastify.close();
    logger.info('[App] Fastify server closed.');

    await prisma.$disconnect();
    logger.info('[App] Prisma disconnected.');

    // Redis/BullMQ cleanup handled by worker process exits usually,
    // but explicit close is better if workers are in the same process.
    // For now, these are enough.

    process.exit(0);
  } catch (err) {
    logger.error(`[App] Error during shutdown: ${err}`);
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
