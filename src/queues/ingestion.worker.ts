import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { ingestProfile } from '../modules/ingestion/ingester';
import { logger } from '../utils/logger';
import { withTimeout } from '../utils/timeout';

import { logContextStorage } from '../utils/context';

interface IngestionJobData {
  username: string;
  limit: number;
}

export const ingestionWorker = new Worker(
  'ingestion-queue',
  async (job: Job<IngestionJobData>) => {
    return logContextStorage.run({ jobId: job.id, username: job.data.username }, async () => {
      if (job.name === 'start-ingestion') {
        const { username, limit } = job.data;
        logger.info(`[IngestionWorker] Starting ingestion job for ${username}`);

        try {
          const result = await withTimeout(
            ingestProfile(username, limit, async (progress, data) => {
              await job.updateProgress({ progress, ...data });
            }),
            120 * 60 * 1000, // 2 hours window for massive accounts
            `Ingestion for ${username} timed out after 2 hours`,
          );
          logger.info(
            `[IngestionWorker] Finished ingestion job for ${username}: Found ${result.found}, Queued ${result.queued}`,
          );
          return result;
        } catch (error) {
          logger.error(`[IngestionWorker] Job failed for ${username}: ${error}`);
          throw error;
        }
      }
    });
  },
  { connection: config.redis },
);

ingestionWorker.on('error', (err) => {
  logger.error(`[IngestionWorker] Global error: ${err.message}`);
});

ingestionWorker.on('failed', (job, err) => {
  logger.error(`[IngestionWorker] Job ${job?.id} failed: ${err.message}`);
});
