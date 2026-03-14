import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { downloadQueue } from '../../queues/download.queue';
import { computeQueue } from '../../queues/compute.queue';
import { ingestionQueue } from '../../queues/ingestion.queue';

export const analyticsController = async (fastify: FastifyInstance) => {
  fastify.get('/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        dCounts,
        dActive,
        dWaiting,
        dFailed,
        cCounts,
        cActive,
        cWaiting,
        cFailed,
        iCounts,
        iActive,
        iWaiting,
        iFailed,
      ] = await Promise.all([
        downloadQueue.getJobCounts(),
        downloadQueue.getActive(0, 50),
        downloadQueue.getWaiting(0, 50),
        downloadQueue.getFailed(0, 50),
        computeQueue.getJobCounts(),
        computeQueue.getActive(0, 50),
        computeQueue.getWaiting(0, 50),
        computeQueue.getFailed(0, 50),
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
        progress: typeof j.progress === 'object' ? j.progress.progress : j.progress,
        progressData: typeof j.progress === 'object' ? j.progress : {},
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
        opts: j.opts,
        attemptsMade: j.attemptsMade,
      });

      return {
        download: {
          counts: dCounts,
          active: dActive.map(formatJob),
          waiting: dWaiting.map(formatJob),
          failed: dFailed.map(formatJob),
        },
        compute: {
          counts: cCounts,
          active: cActive.map(formatJob),
          waiting: cWaiting.map(formatJob),
          failed: cFailed.map(formatJob),
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
      } else if (queueName === 'download') {
        await downloadQueue.retryJobs();
      } else if (queueName === 'compute') {
        await computeQueue.retryJobs();
      } else {
        await Promise.all([
          ingestionQueue.retryJobs(),
          downloadQueue.retryJobs(),
          computeQueue.retryJobs(),
        ]);
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
      } else if (queueName === 'download') {
        await downloadQueue.clean(0, 0, 'failed');
      } else if (queueName === 'compute') {
        await computeQueue.clean(0, 0, 'failed');
      } else {
        await Promise.all([
          ingestionQueue.clean(0, 0, 'failed'),
          downloadQueue.clean(0, 0, 'failed'),
          computeQueue.clean(0, 0, 'failed'),
        ]);
      }

      return { status: 'ok', message: 'Failed jobs cleared' };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to clear jobs' });
    }
  });

  fastify.post('/queue/delete-job', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { queueName, jobId } = request.body as { queueName: string; jobId: string };
      if (!queueName || !jobId) return reply.status(400).send({ error: 'Missing parameters' });

      let job;
      if (queueName === 'ingestion') job = await ingestionQueue.getJob(jobId);
      else if (queueName === 'download') job = await downloadQueue.getJob(jobId);
      else if (queueName === 'compute') job = await computeQueue.getJob(jobId);

      if (job) {
        await job.remove();
        return { status: 'ok', message: 'Job removed' };
      }
      return reply.status(404).send({ error: 'Job not found' });
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to delete job' });
    }
  });
};
