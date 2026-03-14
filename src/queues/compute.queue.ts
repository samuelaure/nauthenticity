import { Queue } from 'bullmq';
import { config } from '../config';

export const computeQueue = new Queue('compute-queue', {
  connection: config.redis,
  defaultJobOptions: {
    removeOnComplete: { count: 50, age: 12 * 3600 },
    removeOnFail: { count: 200 },
    attempts: 3, // CPU-bound tasks shouldn't randomly fail unless there's an actual bug or memory limit, so fewer retries are fine
    backoff: { type: 'exponential', delay: 20000 },
  },
});
