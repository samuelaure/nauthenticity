import { Queue } from 'bullmq';
import { config } from '../config';

export const ingestionQueue = new Queue('ingestion-queue', {
  connection: config.redis,
});
