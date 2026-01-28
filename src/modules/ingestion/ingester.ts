import { runInstagramScraper } from '../../services/apify.service';
import { prisma } from '../../db/prisma';
import { processingQueue } from '../../queues/processing.queue';

export const ingestProfile = async (username: string, maxPosts = 10) => {
    console.log(`[Ingester] Starting ingestion for ${username}`);

    // 1. Check for cached run (within last 24 hours) to avoid duplicated Apify costs
    const cacheThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cachedRun = await prisma.scrapingRun.findFirst({
        where: {
            username,
            status: 'completed',
            createdAt: { gte: cacheThreshold }
        },
        orderBy: { createdAt: 'desc' }
    });

    let items: any[] = [];
    let runId: string | undefined;
    let actorRunId: string | undefined;

    if (cachedRun && cachedRun.rawData) {
        console.log(`[Ingester] Using cached scraping results from run ${cachedRun.id}`);
        items = cachedRun.rawData as any[];
        runId = cachedRun.id;
    } else {
        const scrapeResult = await runInstagramScraper(username, maxPosts);
        items = scrapeResult.items;
        actorRunId = scrapeResult.actorRunId;

        // Create internal run record
        const run = await prisma.scrapingRun.create({
            data: {
                username,
                actorRunId: scrapeResult.actorRunId,
                datasetId: scrapeResult.datasetId,
                rawData: items as any,
                status: 'completed'
            }
        });
        runId = run.id;
    }

    console.log(`[Ingester] Processing ${items.length} posts. Saving to DB...`);

    let queuedCount = 0;

    for (const item of items) {
        try {
            // 2. Data Mapping (Resiliency for different actors)
            const instagramUrl = item.url || (item.shortcode ? `https://www.instagram.com/p/${item.shortcode}/` : null);

            if (!instagramUrl) {
                console.warn(`[Ingester] Skipping item without URL/Shortcode: ${JSON.stringify(item)}`);
                continue;
            }

            const instagramId = item.id || item.shortcode;
            const postUsername = item.account_username || item.ownerUsername || username;
            const takenAt = item.posted ? new Date(item.posted) : (item.timestamp ? new Date(item.timestamp) : new Date());
            const likes = item.likes ?? item.likesCount ?? 0;
            const comments = item.comments ?? item.commentsCount ?? 0;
            const videoUrl = (item.video_links && item.video_links.length > 0) ? item.video_links[0] : item.videoUrl;

            // 3. Upsert Post
            const post = await prisma.post.upsert({
                where: { instagramUrl: instagramUrl },
                update: {
                    likes,
                    comments,
                    instagramId,
                    username: postUsername,
                    runId: runId, // Link to the latest run
                },
                create: {
                    instagramId,
                    instagramUrl: instagramUrl,
                    username: postUsername,
                    caption: item.caption,
                    postedAt: takenAt,
                    likes,
                    comments,
                    runId: runId,
                },
                include: {
                    transcripts: true,
                    media: true
                }
            });

            // 4. Skip if already fully processed (has transcript)
            if (post.transcripts.length > 0) {
                console.log(`[Ingester] Skipping already processed post: ${post.instagramUrl}`);
                continue;
            }

            // 5. Handle Media (Video only for now as per MVP)
            const isVideo = item.type === 'Video' || !!videoUrl;

            if (isVideo && videoUrl) {
                const existingMedia = post.media.find(m => m.type === 'video');

                if (!existingMedia) {
                    await prisma.media.create({
                        data: {
                            postId: post.id,
                            type: 'video',
                            storageUrl: videoUrl,
                        }
                    });
                }

                await processingQueue.add('transcribe-video', {
                    postId: post.id,
                    videoUrl: videoUrl,
                    instagramUrl: instagramUrl
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    }
                });
                queuedCount++;
            }
        } catch (postError) {
            console.error(`[Ingester] Failed to process individual post: ${item.url || item.shortcode}`, postError);
        }
    }

    console.log(`[Ingester] Finished. Queued ${queuedCount} videos for processing.`);
    return { found: items.length, queued: queuedCount, runId };
};
