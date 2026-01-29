import { processingQueue } from './src/queues/processing.queue';
import { prisma } from './src/db/prisma';

async function retryFailed() {
    const failed = await processingQueue.getFailed();
    console.log(`Found ${failed.length} failed jobs.`);

    if (failed.length > 0) {
        console.log('Retrying all failed jobs...');
        await Promise.all(failed.map(job => job.retry()));
        console.log('Jobs retried.');
    }
}

retryFailed().finally(() => process.exit(0));
