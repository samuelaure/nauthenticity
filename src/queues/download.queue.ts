import { Queue } from 'bullmq';
import { config } from '../config';

export const downloadQueue = new Queue('download-queue', {
  connection: config.redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 500 },
    attempts: 3, // Network bound, so retries are useful
    backoff: { type: 'exponential', delay: 5000 },
  },
});
