import { Queue } from 'bullmq';
import { config } from '../config';

export const processingQueue = new Queue('processing-queue', {
    connection: config.redis,
});
