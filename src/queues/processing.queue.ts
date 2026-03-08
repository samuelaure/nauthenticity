import { Queue } from 'bullmq';
import { config } from '../config';

export const processingQueue = new Queue('processing-queue', {
  connection: config.redis,
  defaultJobOptions: {
    removeOnComplete: { count: 50, age: 12 * 3600 },
    removeOnFail: { count: 200 },
    attempts: 5, // Media processing is more flaky (FFmpeg)
    backoff: { type: 'exponential', delay: 10000 },
  },
});
