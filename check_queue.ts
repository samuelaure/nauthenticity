import { processingQueue } from './src/queues/processing.queue';
import { prisma } from './src/db/prisma';

async function checkQueue() {
    const counts = await processingQueue.getJobCounts();
    console.log('Queue Counts:', counts);

    const failed = await processingQueue.getFailed();
    if (failed.length > 0) {
        console.log('Last Failed Job Reason:', failed[0].failedReason);
        console.log('Last Failed Job Stack:', failed[0].stacktrace);
    }

    // Check locally stored videos count
    const localVideos = await prisma.media.count({
        where: { storageUrl: { contains: 'localhost' } }
    });
    console.log('Local Videos in DB:', localVideos);
}

checkQueue().finally(() => process.exit(0));
