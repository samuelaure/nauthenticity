import { Queue } from 'bullmq';
import { config } from '../config';

export const optimizationQueue = new Queue('optimization-queue', {
  connection: config.redis,
});
