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
import { startScheduler } from './scheduler';

import { downloadWorker } from './queues/download.worker';
import { computeWorker } from './queues/compute.worker';
import { ingestionWorker } from './queues/ingestion.worker';
import { optimizationWorker } from './queues/optimization.worker';

// Import Controllers
import { authController } from './modules/auth/auth.controller';
import { ingestionController } from './modules/ingestion/ingestion.controller';
import { contentController } from './modules/content/content.controller';
import { analyticsController } from './modules/analytics/analytics.controller';
import { proactiveController } from './modules/proactive/proactive.controller';
import { inspoController } from './modules/content/inspo.controller';
import { workspacesController } from './modules/workspaces/workspaces.controller';
import { dashboardController } from './modules/workspaces/dashboard.controller';

const fastify = Fastify({
  logger: true,
});

// Configure Plugins
fastify.register(cors, {
  origin: process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',')
    : ['http://localhost:3000'],
});
fastify.register(rateLimit, {
  max: 10000,
  timeWindow: '1 minute',
});

// 1. Dashboard Static Files (Primary Decorator)
fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../dashboard/dist'),
  prefix: '/',
});

// 2. Static assets (Media)
fastify.register(fastifyStatic, {
  root: path.resolve(__dirname, '../storage'),
  prefix: '/content/',
  decorateReply: false,
});

// Set Global Error Handler
fastify.setErrorHandler(errorHandler);
import { ingestionQueue } from './queues/ingestion.queue';
import { downloadQueue } from './queues/download.queue';
import { computeQueue } from './queues/compute.queue';
import { optimizationQueue } from './queues/optimization.queue';

// Register Routes/Controllers
fastify.get('/health', async () => {
  const [dbHealth, ingestionCount, processingCount, computeCount, optimizationCount] =
    await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'error'),
      ingestionQueue.getJobCounts().catch(() => ({})),
      downloadQueue.getJobCounts().catch(() => ({})),
      computeQueue.getJobCounts().catch(() => ({})),
      optimizationQueue.getJobCounts().catch(() => ({})),
    ]);

  return {
    status: dbHealth === 'ok' ? 'ok' : 'degraded',
    service: 'nauthenticity',
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth,
      ingestionQueue: ingestionCount,
      downloadQueue: processingCount,
      computeQueue: computeCount,
      optimizationQueue: optimizationCount,
    },
  };
});

// SPA Fallback: Serve index.html for non-api routes
fastify.setNotFoundHandler((request, reply) => {
  const url = request.raw.url || '';
  const accept = request.headers.accept || '';

  // If it's a content asset that's missing
  if (url.startsWith('/content')) {
    return reply.status(404).send({ error: 'Asset Not Found' });
  }

  // If it's an API call (no extension OR JSON accepted)
  // Use only the pathname (strip query string) to avoid false positives from dots in query params (e.g. JWT tokens)
  const pathname = url.split('?')[0];
  const hasExtension = path.extname(pathname).length > 0;
  const acceptsHtml = accept.includes('text/html');

  if (hasExtension || !acceptsHtml) {
    return reply.status(404).send({ error: 'Route Not Found', path: url });
  }

  // This will now correctly look in /app/dashboard/dist because it's the primary decorator
  return reply.sendFile('index.html');
});

// Register Auth Controller (before API routes)
fastify.register(authController);

fastify.register(ingestionController, { prefix: '/api' });
fastify.register(contentController, { prefix: '/api' });
fastify.register(analyticsController, { prefix: '/api' });
fastify.register(proactiveController, { prefix: '/api' });
fastify.register(inspoController, { prefix: '/api' });
fastify.register(workspacesController, { prefix: '/api' });
fastify.register(dashboardController, { prefix: '/api' });

const start = async () => {
  try {
    // D2: Startup Readiness Check
    logger.info('[App] Verifying infrastructure connectivity...');
    await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => logger.info('[App] Postgres connection OK')),
      ingestionWorker
        .waitUntilReady()
        .then(() => logger.info('[App] Redis (BullMQ) connection OK')),
    ]);

    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`[App] Server listening on ${config.port} in ${env.NODE_ENV} mode`);

    // Start the smart fanout scheduler after infrastructure is confirmed ready
    startScheduler();
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

    // B2: Graceful Shutdown for Workers
    logger.info('[App] Closing BullMQ workers...');
    await Promise.all([
      ingestionWorker.close(),
      downloadWorker.close(),
      optimizationWorker.close(),
      computeWorker.close(),
    ]);
    logger.info('[App] All BullMQ workers closed.');

    await prisma.$disconnect();
    logger.info('[App] Prisma disconnected.');

    process.exit(0);
  } catch (err) {
    logger.error(`[App] Error during shutdown: ${err}`);
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
