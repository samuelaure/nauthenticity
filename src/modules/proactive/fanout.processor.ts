import { runUniversalBatchInstagramScraper } from '../../services/apify.service';
import { generateProactiveComments } from '../../services/intelligence.service';
import { dispatchToZazu } from './zazu.dispatcher';
import { logger } from '../../utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const runProactiveFanout = async () => {
  logger.info(`[FanoutProcessor] Starting proactive fanout cycle...`);

  // 1. Get all active BrandTargets
  const brandTargets = await prisma.brandTarget.findMany({
    include: {
      brand: true,
      account: true,
    }
  });

  if (brandTargets.length === 0) {
    logger.info(`[FanoutProcessor] No brand targets found. Exiting.`);
    return;
  }

  // 2. Deduplicate usernames to scrape
  const usernames = [...new Set(brandTargets.map((bt: any) => bt.username as string))];
  logger.info(`[FanoutProcessor] Batch scraping ${usernames.length} unique accounts...`);

  // 3. Scrape batch
  let scrapedItems;
  try {
    const result = await runUniversalBatchInstagramScraper(usernames as string[], 3); // Max 3 recent posts per user
    scrapedItems = result.items;
  } catch(error: any) {
    logger.error(`[FanoutProcessor] Batch scraping failed: ${error.message}`);
    return;
  }

  // 4. Map posts back to brands
  for (const item of scrapedItems) {
    const itemUsername = item.ownerUsername;
    const interestedBrands = brandTargets
      .filter((bt: any) => bt.username === itemUsername && bt.brand.isActive)
      .map((bt: any) => bt.brand);

    for (const brand of interestedBrands) {
      // Avoid parallel insert race conditions
      let localPost = await prisma.post.findUnique({ where: { instagramUrl: item.url } });
      if (!localPost) {
        localPost = await prisma.post.create({
          data: {
            instagramId: item.id,
            instagramUrl: item.url,
            username: itemUsername,
            caption: item.caption,
            postedAt: new Date(item.timestamp),
            likes: item.likesCount,
            comments: item.commentsCount,
          }
        });
      }

      // Check if we already processed this post for this brand
      const existingFeedback = await prisma.commentFeedback.findFirst({
        where: { brandId: brand.id, postId: localPost.id }
      });

      if (!existingFeedback) {
        logger.info(`[FanoutProcessor] Generating comments for brand ${brand.brandName} on post ${item.shortcode}...`);
        
        try {
          // Generate comments
          const comments = await generateProactiveComments(item.caption, brand.tonePrompt);
          
          // Dispatch to Zazu
          await dispatchToZazu({
            userId: brand.userId,
            brandId: brand.id,
            brandName: brand.brandName,
            targetUsername: itemUsername,
            postUrl: item.url,
            postThumbnailUrl: item.displayUrl,
            suggestions: comments,
            localPostId: localPost.id
          });

          // Optimistically log that we processed it
          await prisma.commentFeedback.create({
            data: {
              brandId: brand.id,
              postId: localPost.id,
              commentText: JSON.stringify(comments),
            }
          });
        } catch(err: any) {
             logger.error(`[FanoutProcessor] Error processing brand ${brand.brandName} for post ${item.shortcode}: ${err.message}`)
        }
      }
    }
  }

  logger.info(`[FanoutProcessor] Cycle completed.`);
};
