import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { ingestProfile } from '../modules/ingestion/ingester';
import { logger } from '../utils/logger';

interface IngestionJobData {
  username: string;
  limit: number;
}

export const ingestionWorker = new Worker(
  'ingestion-queue',
  async (job: Job<IngestionJobData>) => {
    if (job.name === 'start-ingestion') {
      const { username, limit } = job.data;
      logger.info(`[IngestionWorker] Starting ingestion job ${job.id} for ${username}`);

      try {
        const result = await ingestProfile(username, limit);
        logger.info(
          `[IngestionWorker] Finished ingestion job ${job.id} for ${username}: Found ${result.found}, Queued ${result.queued}`,
        );
        return result;
      } catch (error) {
        logger.error(`[IngestionWorker] Job ${job.id} failed for ${username}: ${error}`);
        throw error;
      }
    }
  },
  { connection: config.redis },
);

ingestionWorker.on('error', (err) => {
  logger.error(`[IngestionWorker] Global error: ${err.message}`);
});

ingestionWorker.on('failed', (job, err) => {
  logger.error(`[IngestionWorker] Job ${job?.id} failed: ${err.message}`);
});
