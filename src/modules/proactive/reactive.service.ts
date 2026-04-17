import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { scrapePostByUrl } from '../../services/apify.service';
import {
  generateCommentSuggestions,
  CommentSuggestionParams,
} from '../../services/intelligence.service';

export const generateReactiveComments = async (
  targetUrl: string,
  brandId: string,
): Promise<string[]> => {
  logger.info(
    `[ReactiveService] Starting reactive generation for ${targetUrl} (Brand: ${brandId})`,
  );

  // 1. Fetch Brand Context
  const brand = await prisma.brandConfig.findUnique({
    where: { id: brandId },
  });
  if (!brand) throw new Error('Brand not found');

  // 2. Resolve Post
  let post = await prisma.post.findUnique({
    where: { instagramUrl: targetUrl },
    include: { transcripts: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (!post) {
    logger.info(`[ReactiveService] Post not in DB. Scraping...`);
    const scraped = await scrapePostByUrl(targetUrl);
    if (!scraped) throw new Error('Failed to scrape post');

    // Minimal ingestion (no media download for speed)
    post = await prisma.post.upsert({
      where: { instagramUrl: targetUrl },
      update: {},
      create: {
        instagramId: scraped.id || scraped.shortcode,
        instagramUrl: targetUrl,
        username: scraped.author.username,
        caption: scraped.caption,
        postedAt: new Date(scraped.takenAt),
        likes: scraped.likesCount,
        comments: scraped.commentsCount,
      },
      include: { transcripts: { take: 1 } },
    });
  }

  // 3. Fetch Profile Strategy (Level 3)
  const target = await prisma.brandTarget.findUnique({
    where: { brandId_username: { brandId, username: post.username || '' } },
  });

  // 4. Fetch Last Selected Comments (Level 4)
  const lastFeedbacks = await prisma.commentFeedback.findMany({
    where: { brandId, isSelected: true },
    orderBy: { sentAt: 'desc' },
    take: 5,
  });

  // 5. Generate
  const params: CommentSuggestionParams = {
    post: {
      caption: post.caption || '',
      transcriptText: post.transcripts[0]?.text || '',
      instagramUrl: post.instagramUrl,
      targetUsername: post.username || 'unknown',
    },
    brand: {
      voicePrompt: brand.voicePrompt,
      commentStrategy: brand.commentStrategy,
      suggestionsCount: brand.suggestionsCount,
    },
    profileStrategy: target?.profileStrategy || null,
    lastSelectedComments: lastFeedbacks.map((f) => f.commentText),
  };

  const comments = await generateCommentSuggestions(params);

  // 6. Log optimistic (unconfirmed) suggestions for dedup context
  await prisma.commentFeedback.create({
    data: {
      brandId,
      postId: post.id,
      commentText: JSON.stringify(comments),
      isSelected: false,
    },
  });

  return comments;
};
