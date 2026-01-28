import { runInstagramScraper } from '../../services/apify.service';
import { prisma } from '../../db/prisma';
import { processingQueue } from '../../queues/processing.queue';

export const ingestProfile = async (username: string, maxPosts = 10) => {
    console.log(`[Ingester] Starting ingestion for ${username}`);

    const posts = await runInstagramScraper(username, maxPosts);
    console.log(`[Ingester] Found ${posts.length} posts. Saving to DB...`);

    let queuedCount = 0;

    for (const item of posts) {
        // 1. Upsert Post
        // Apify result mapping might vary, ensuring robustness
        if (!item.url) {
            console.warn(`[Ingester] Skipping item without URL: ${JSON.stringify(item)}`);
            continue;
        }

        const takenAt = item.timestamp ? new Date(item.timestamp) : new Date();

        // Skip if existing? Upsert handles it.
        const post = await prisma.post.upsert({
            where: { instagramUrl: item.url },
            update: {
                likes: item.likesCount,
                comments: item.commentsCount,
            },
            create: {
                instagramUrl: item.url,
                caption: item.caption,
                postedAt: takenAt,
                likes: item.likesCount,
                comments: item.commentsCount,
            }
        });

        // 2. Handle Media (Video only for now as per MVP)
        // Apify 'videoUrl' field
        if (item.type === 'Video' && item.videoUrl) {
            // Create Media Record
            // Check if media exists?
            // For MVP, just create if not exists
            const existingMedia = await prisma.media.findFirst({
                where: { postId: post.id, type: 'video' }
            });

            if (!existingMedia) {
                await prisma.media.create({
                    data: {
                        postId: post.id,
                        type: 'video',
                        storageUrl: item.videoUrl, // Remote URL initially
                    }
                });

                // 3. Queue for Processing
                await processingQueue.add('transcribe-video', {
                    postId: post.id,
                    videoUrl: item.videoUrl,
                    instagramUrl: item.url
                });
                queuedCount++;
            }
        }
    }

    console.log(`[Ingester] Finished. Queued ${queuedCount} videos for processing.`);
    return { found: posts.length, queued: queuedCount };
};
