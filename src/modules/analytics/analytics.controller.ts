import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { processingQueue } from '../../queues/processing.queue';

export const analyticsController = async (fastify: FastifyInstance) => {
  fastify.get('/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [counts, active, waiting, failed] = await Promise.all([
        processingQueue.getJobCounts(),
        processingQueue.getActive(0, 50),
        processingQueue.getWaiting(0, 50),
        processingQueue.getFailed(0, 50),
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
        counts,
        active: active.map(formatJob),
        waiting: waiting.map(formatJob),
        failed: failed.map(formatJob),
      };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to fetch queue status' });
    }
  });
};
