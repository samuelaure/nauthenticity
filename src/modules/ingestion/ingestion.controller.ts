import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ingestionQueue } from '../../queues/ingestion.queue';
import { downloadQueue } from '../../queues/download.queue';
import { computeQueue } from '../../queues/compute.queue';
import { abortActorRun } from '../../services/apify.service';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';

export const ingestionController = async (fastify: FastifyInstance) => {
  fastify.post(
    '/ingest',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, limit } = request.body as { username: string; limit?: number };

      if (!username) {
        return reply.status(400).send({ error: 'Username is required' });
      }

      try {
        // Prevent duplicates
        const jobs = await ingestionQueue.getJobs(['active', 'waiting', 'delayed']);
        const existingJob = jobs.find((j) => j.data.username === username);

        if (existingJob) {
          return reply.status(409).send({
            error: 'Conflict',
            message: `An ingestion job for ${username} is already in progress`,
            jobId: existingJob.id,
          });
        }

        const job = await ingestionQueue.add('start-ingestion', {
          username,
          limit: limit || 10,
        });

        logger.info(`[IngestionController] Queued ingestion job ${job.id} for ${username}`);

        return reply.status(202).send({
          status: 'accepted',
          jobId: job.id,
          message: `Ingestion job queued for ${username}`,
        });
      } catch (error) {
        logger.error(`[IngestionController] Failed to queue job for ${username}: ${error}`);
        return reply.status(500).send({ error: 'Failed to queue ingestion job' });
      }
    },
  );

  fastify.post(
    '/abort',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username } = request.body as { username: string };

      if (!username) {
        return reply.status(400).send({ error: 'Username is required' });
      }

      logger.info(`[IngestionController] Aborting all jobs for ${username}`);

      try {
        // 1. Kill Ingestion Jobs
        const ingJobs = await ingestionQueue.getJobs(['active', 'waiting', 'delayed']);
        for (const job of ingJobs) {
          if (job.data.username === username) {
            await job.remove();
            logger.info(`[IngestionController] Removed ingestion job ${job.id}`);
          }
        }

        // 2. Kill Download Jobs
        const dlJobs = await downloadQueue.getJobs(['active', 'waiting', 'delayed']);
        for (const job of dlJobs) {
          if (job.data.username === username) {
            await job.remove();
          }
        }

        // 3. Kill Compute Jobs
        const compJobs = await computeQueue.getJobs(['active', 'waiting', 'delayed']);
        for (const job of compJobs) {
          if (job.data.username === username) {
            await job.remove();
          }
        }

        // 4. Abort Apify Actor Run
        // We look for the most recent run that hasn't finished yet or was just started
        const activeRun = await prisma.scrapingRun.findFirst({
          where: { username, status: 'pending' },
          orderBy: { createdAt: 'desc' }
        });

        if (activeRun && activeRun.actorRunId) {
          await abortActorRun(activeRun.actorRunId);
          await prisma.scrapingRun.update({
            where: { id: activeRun.id },
            data: { status: 'failed' }
          });
        } else {
          // Alternative: check progress data if runId was reported
          // We don't have a direct way to get the runId from a running worker easily without shared state
          // but if we just added it to onProgress, the dashboard might have it.
        }

        return reply.send({ status: 'aborted', message: `All jobs for ${username} have been requested to stop.` });
      } catch (error) {
        logger.error(`[IngestionController] Error during abort for ${username}: ${error}`);
        return reply.status(500).send({ error: 'Failed to abort jobs' });
      }
    }
  );

  fastify.get('/ingest/status/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await ingestionQueue.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  });
};
