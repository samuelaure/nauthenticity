import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { processingQueue } from '../../queues/processing.queue';
import { ingestionQueue } from '../../queues/ingestion.queue';

export const analyticsController = async (fastify: FastifyInstance) => {
  fastify.get('/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [pCounts, pActive, pWaiting, pFailed, iCounts, iActive, iWaiting, iFailed] =
        await Promise.all([
          processingQueue.getJobCounts(),
          processingQueue.getActive(0, 50),
          processingQueue.getWaiting(0, 50),
          processingQueue.getFailed(0, 50),
          ingestionQueue.getJobCounts(),
          ingestionQueue.getActive(0, 50),
          ingestionQueue.getWaiting(0, 50),
          ingestionQueue.getFailed(0, 50),
        ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatJob = (j: any) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        timestamp: j.timestamp,
        failedReason: j.failedReason,
        progress: j.progress,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
        opts: j.opts,
      });

      return {
        processing: {
          counts: pCounts,
          active: pActive.map(formatJob),
          waiting: pWaiting.map(formatJob),
          failed: pFailed.map(formatJob),
        },
        ingestion: {
          counts: iCounts,
          active: iActive.map(formatJob),
          waiting: iWaiting.map(formatJob),
          failed: iFailed.map(formatJob),
        },
      };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to fetch queue status' });
    }
  });

  fastify.post('/queue/retry-failed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { queueName } = (request.body as { queueName?: string }) || {};

      if (queueName === 'ingestion') {
        await ingestionQueue.retryJobs();
      } else if (queueName === 'processing') {
        await processingQueue.retryJobs();
      } else {
        await Promise.all([ingestionQueue.retryJobs(), processingQueue.retryJobs()]);
      }

      return { status: 'ok', message: 'Failed jobs retried' };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to retry jobs' });
    }
  });

  fastify.post('/queue/clear-failed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { queueName } = (request.body as { queueName?: string }) || {};

      if (queueName === 'ingestion') {
        await ingestionQueue.clean(0, 0, 'failed');
      } else if (queueName === 'processing') {
        await processingQueue.clean(0, 0, 'failed');
      } else {
        await Promise.all([
          ingestionQueue.clean(0, 0, 'failed'),
          processingQueue.clean(0, 0, 'failed'),
        ]);
      }

      return { status: 'ok', message: 'Failed jobs cleared' };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to clear jobs' });
    }
  });
};
