import { runInstagramScraper } from '../../services/apify.service';
import { prisma } from '../../db/prisma';
import { processingQueue } from '../../queues/processing.queue';

export const ingestProfile = async (username: string, maxPosts = 10) => {
    console.log(`[Ingester] Starting ingestion for ${username}`);

    const posts = await runInstagramScraper(username, maxPosts);
    console.log(`[Ingester] Found ${posts.length} posts. Saving to DB...`);

    let queuedCount = 0;

    for (const item of posts) {
        try {
            // 1. Data Mapping (Resiliency for different actors)
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

            // 2. Upsert Post
            const post = await prisma.post.upsert({
                where: { instagramUrl: instagramUrl },
                update: {
                    likes,
                    comments,
                    instagramId,
                    username: postUsername,
                },
                create: {
                    instagramId,
                    instagramUrl: instagramUrl,
                    username: postUsername,
                    caption: item.caption,
                    postedAt: takenAt,
                    likes,
                    comments,
                },
                include: {
                    transcripts: true,
                    media: true
                }
            });

            // 3. Skip if already fully processed (has transcript)
            if (post.transcripts.length > 0) {
                console.log(`[Ingester] Skipping already processed post: ${post.instagramUrl}`);
                continue;
            }

            // 4. Handle Media (Video only for now as per MVP)
            // Detect if it's a video (either type or presence of videoUrl)
            const isVideo = item.type === 'Video' || !!videoUrl;

            if (isVideo && videoUrl) {
                // Check if media record exists
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

                // Always queue if no transcript
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
            // Continue to next post
        }
    }

    console.log(`[Ingester] Finished. Queued ${queuedCount} videos for processing.`);
    return { found: posts.length, queued: queuedCount };
};
