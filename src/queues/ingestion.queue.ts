import { Queue } from 'bullmq';
import { config } from '../config';

export const ingestionQueue = new Queue('ingestion-queue', {
  connection: config.redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});
