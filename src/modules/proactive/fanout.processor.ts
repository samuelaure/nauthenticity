import { runUniversalBatchInstagramScraper } from '../../services/apify.service';
import {
  generateCommentSuggestions,
  type CommentSuggestionParams,
} from '../../services/intelligence.service';
import { dispatchToZazu } from './zazu.dispatcher';
import { logger } from '../../utils/logger';
import { prisma } from '../../db/prisma';
import { toZonedTime } from 'date-fns-tz';
import type { BrandConfig, BrandTarget, Account } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BrandWithTargets = BrandConfig & {
  targets: (BrandTarget & { account: Account })[];
};

// ---------------------------------------------------------------------------
// Window logic
// ---------------------------------------------------------------------------

/**
 * Returns true if `now` falls within the brand's configured delivery window
 * (in the brand's timezone). Supports windows that cross midnight.
 */
export function isInWindow(brand: BrandConfig, now: Date): boolean {
  if (!brand.windowStart || !brand.windowEnd) return false;

  const zoned = toZonedTime(now, brand.timezone);
  const currentMin = zoned.getHours() * 60 + zoned.getMinutes();

  const [sh, sm] = brand.windowStart.split(':').map(Number);
  const [eh, em] = brand.windowEnd.split(':').map(Number);
  const startMin = sh * 60 + (sm ?? 0);
  const endMin = eh * 60 + (em ?? 0);

  if (startMin <= endMin) {
    // Normal window (e.g. 09:00 → 22:00)
    return currentMin >= startMin && currentMin < endMin;
  } else {
    // Crosses midnight (e.g. 22:00 → 02:00)
    return currentMin >= startMin || currentMin < endMin;
  }
}

// ---------------------------------------------------------------------------
// Smart Fanout — called by the scheduler every 15 minutes
// ---------------------------------------------------------------------------

/**
 * Evaluates all active brands, selects eligible targets based on the
 * 15-minute (in-window) / 60-minute (out-of-window) scraping threshold,
 * deduplicates usernames, executes ONE Apify batch request, and fans out
 * comment generation per brand.
 */
export const runProactiveFanout = async (now: Date = new Date()): Promise<void> => {
  logger.info(`[FanoutProcessor] Starting smart fanout cycle at ${now.toISOString()}...`);

  // 1. Load all active brands with their targets and account metadata
  const allBrands = (await prisma.brandConfig.findMany({
    where: { isActive: true },
    include: {
      targets: { include: { account: true } },
    },
  })) as BrandWithTargets[];

  if (allBrands.length === 0) {
    logger.info(`[FanoutProcessor] No active brands. Exiting.`);
    return;
  }

  // 2. Determine which targets are eligible based on scraping thresholds
  // Map: username → Set of brandIds interested in that username
  const eligibleTargets = new Map<string, Set<string>>();

  for (const brand of allBrands) {
    const inWindow = isInWindow(brand, now);
    const thresholdMs = inWindow ? 15 * 60 * 1000 : 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - thresholdMs);

    for (const target of brand.targets) {
      const lastScrape = target.account.lastScrapedAt;
      if (!lastScrape || lastScrape < cutoff) {
        if (!eligibleTargets.has(target.username)) {
          eligibleTargets.set(target.username, new Set());
        }
        eligibleTargets.get(target.username)!.add(brand.id);
      }
    }
  }

  if (eligibleTargets.size === 0) {
    logger.info(`[FanoutProcessor] No eligible targets this cycle. All within threshold.`);
    return;
  }

  const usernames = [...eligibleTargets.keys()];
  logger.info(
    `[FanoutProcessor] Scraping ${usernames.length} unique account(s): ${usernames.join(', ')}`,
  );

  // 3. Execute ONE Apify batch request (max 4 posts per account)
  let scrapedItems: Awaited<ReturnType<typeof runUniversalBatchInstagramScraper>>['items'];
  try {
    const result = await runUniversalBatchInstagramScraper(usernames, 4);
    scrapedItems = result.items;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[FanoutProcessor] Apify batch scraping failed: ${msg}`);
    return;
  }

  // 4. Update lastScrapedAt for all scraped accounts
  await prisma.account.updateMany({
    where: { username: { in: usernames } },
    data: { lastScrapedAt: now },
  });

  // 5. Fan out: generate comments per brand × per new post
  const brandMap = new Map(allBrands.map((b) => [b.id, b]));

  for (const item of scrapedItems) {
    const interestedBrandIds = eligibleTargets.get(item.ownerUsername);
    if (!interestedBrandIds) continue;

    for (const brandId of interestedBrandIds) {
      const brand = brandMap.get(brandId);
      if (!brand) continue;

      // 5a. Upsert the post — skip processing if instagramId already exists
      let localPost = await prisma.post.findFirst({
        where: {
          OR: [{ instagramId: item.id }, { instagramUrl: item.url }],
        },
      });

      if (!localPost) {
        localPost = await prisma.post.create({
          data: {
            instagramId: item.id,
            instagramUrl: item.url,
            username: item.ownerUsername,
            caption: item.caption ?? '',
            postedAt: new Date(item.timestamp),
            likes: item.likesCount ?? 0,
            comments: item.commentsCount ?? 0,
          },
        });
      }

      // 5b. Skip if this brand already has a feedback record for this post
      const alreadyProcessed = await prisma.commentFeedback.findFirst({
        where: { brandId, postId: localPost.id },
      });
      if (alreadyProcessed) {
        logger.info(
          `[FanoutProcessor] Skipping already-processed post ${localPost.id} for brand ${brand.brandName}`,
        );
        continue;
      }

      // 5c. Fetch the last 9 selected comments for this brand (Level 4 context)
      const lastSelectedFeedbacks = await prisma.commentFeedback.findMany({
        where: { brandId, isSelected: true },
        orderBy: { sentAt: 'desc' },
        take: 9,
        select: { commentText: true },
      });
      const lastSelectedComments = lastSelectedFeedbacks.map((f) => f.commentText);

      // 5d. Find the BrandTarget for profile-specific strategy
      const brandTarget = brand.targets.find((t) => t.username === item.ownerUsername);

      logger.info(
        `[FanoutProcessor] Generating ${brand.suggestionsCount} comment(s) for brand "${brand.brandName}" on @${item.ownerUsername} post ${item.shortCode ?? localPost.id}...`,
      );

      try {
        // 5e. Build params and generate suggestions (5-level prompt)
        const suggestionParams: CommentSuggestionParams = {
          post: {
            caption: item.caption ?? '',
            transcriptText: undefined, // Transcripts are not available at fanout stage
            instagramUrl: item.url,
            targetUsername: item.ownerUsername,
          },
          brand: {
            voicePrompt: brand.voicePrompt,
            commentStrategy: brand.commentStrategy,
            suggestionsCount: brand.suggestionsCount,
          },
          profileStrategy: brandTarget?.profileStrategy ?? null,
          lastSelectedComments,
        };

        const suggestions = await generateCommentSuggestions(suggestionParams);

        // 5f. Dispatch to Zazŭ
        await dispatchToZazu({
          userId: brand.userId,
          brandId: brand.id,
          brandName: brand.brandName,
          targetUsername: item.ownerUsername,
          postUrl: item.url,
          postThumbnailUrl: item.displayUrl ?? '',
          suggestions,
          localPostId: localPost.id,
        });

        // 5g. Save optimistic dedup record (isSelected=false)
        await prisma.commentFeedback.create({
          data: {
            brandId,
            postId: localPost.id,
            commentText: JSON.stringify(suggestions),
            isSelected: false,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(
          `[FanoutProcessor] Error processing brand "${brand.brandName}" for post ${item.shortCode ?? localPost.id}: ${msg}`,
        );
      }
    }
  }

  logger.info(`[FanoutProcessor] Cycle completed.`);
};
