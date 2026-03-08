import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ingestionQueue } from '../../queues/ingestion.queue';
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
