import { runInstagramScraper } from '../../services/apify.service';
import { prisma } from '../../db/prisma';
import { downloadQueue } from '../../queues/download.queue';
import { logger } from '../../utils/logger';

export const ingestProfile = async (
  username: string,
  maxPosts = 10,
  onProgress?: (progress: number, data?: any) => Promise<void>,
  options: { updateSync?: boolean } = {},
) => {
  logger.info(`[Ingester] Starting ingestion for ${username}`);

  // 0. Ensure Account exists (Identity) - Placeholder
  let account = await prisma.account.findUnique({ where: { username } });
  if (!account) {
    logger.info(`[Ingester] Account ${username} not found. Creating placeholder.`);
    account = await prisma.account.create({
      data: { username, lastScrapedAt: new Date() },
    });
  }

  let oldestPostDate: string | undefined;
  if (options.updateSync) {
    const latestPost = await prisma.post.findFirst({
      where: { username },
      orderBy: { postedAt: 'desc' },
    });
    if (latestPost) {
      oldestPostDate = latestPost.postedAt.toISOString().split('T')[0];
      logger.info(`[Ingester] Update Sync active. Oldest post date to fetch: ${oldestPostDate}`);
    }
  }

  // 1. Check for cached run (within last 24 hours) to avoid duplicated Apify costs
  const cacheThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cachedRun = await prisma.scrapingRun.findFirst({
    where: {
      username,
      status: 'completed',
      createdAt: { gte: cacheThreshold },
    },
    orderBy: { createdAt: 'desc' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = [];
  let runId: string | undefined;

  let useCache = false;
  if (cachedRun && cachedRun.rawData && !options.updateSync) {
    const cachedItems = cachedRun.rawData as any[];
    if (cachedItems.length >= maxPosts) {
      useCache = true;
    }
  }

  if (useCache && cachedRun) {
    logger.info(`[Ingester] Using cached scraping results from run ${cachedRun.id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items = cachedRun.rawData as any[];
    runId = cachedRun.id;
  } else {
    if (onProgress) await onProgress(5, { step: `Starting Apify actor for ${username}...` });
    const scrapeResult = await runInstagramScraper(
      username,
      maxPosts,
      async (status) => {
        // If we see the Run ID reported, we track it as 'pending' in the DB
        if (status.startsWith('Run ID: ')) {
          const id = status.replace('Run ID: ', '');
          try {
            await prisma.scrapingRun.upsert({
              where: { actorRunId: id },
              update: { username },
              create: {
                username,
                actorRunId: id,
                status: 'pending',
                phase: 'scraping',
              },
            });
          } catch (dbErr) {
            logger.warn(`[Ingester] Could not track pending Run ID ${id}: ${dbErr}`);
          }
        }
        if (onProgress) await onProgress(5, { step: status });
      },
      oldestPostDate,
    );

    items = scrapeResult.items;

    // Immediately update the main account with the high-res profile found during the feed scrape
    if (scrapeResult.profile && scrapeResult.profile.username) {
      const hdUrl = scrapeResult.profile.profilePicUrlHD || scrapeResult.profile.profilePicUrl;
      if (hdUrl) {
        await prisma.account.updateMany({
          where: { username: scrapeResult.profile.username },
          data: { profileImageUrl: hdUrl },
        });
        // Queue Profile Image download
        await downloadQueue.add('process-profile-image', {
          username: scrapeResult.profile.username,
          url: hdUrl,
          contextUsername: username,
        });
      }
    }

    // Finalize the run after finished
    const run = await prisma.scrapingRun.upsert({
      where: { actorRunId: scrapeResult.actorRunId },
      update: {
        datasetId: scrapeResult.datasetId,
        rawData: items as any,
        status: 'completed',
        phase: 'downloading', // Transition to downloading
      },
      create: {
        username,
        actorRunId: scrapeResult.actorRunId,
        datasetId: scrapeResult.datasetId,
        rawData: items as any,
        status: 'completed',
        phase: 'downloading',
      },
    });
    runId = run.id;
  }

  if (onProgress) await onProgress(10, { step: 'Scrape finished, processing posts...' });

  logger.info(`[Ingester] Processing ${items.length} posts. Saving to DB...`);

  let queuedCount = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    try {
      // Progress from 10 to 90
      if (onProgress && idx % 10 === 0) {
        const p = 10 + Math.floor((idx / items.length) * 80);
        await onProgress(p, {
          step: `Processing post ${idx + 1}/${items.length}`,
          currentPost: item.id || item.shortcode,
        });
      }
      // 2. Data Mapping (Resiliency for different actors)
      const instagramUrl =
        item.url || (item.shortcode ? `https://www.instagram.com/p/${item.shortcode}/` : null);

      if (!instagramUrl) {
        logger.warn(`[Ingester] Skipping item without URL/Shortcode: ${JSON.stringify(item)}`);
        continue;
      }

      const instagramId = item.id || item.shortcode;
      // Force the post to belong to the account we are scraping (User Request)
      const postUsername = username;

      // 1. Identify all collaborators (Owner + Co-authors + Tagged)
      const collaborators: any[] = [];
      const primaryOwner = item.ownerUsername || item.accountUsername || item.account_username;

      // Joint Authors (Official collab)
      const coauthors = item.coauthorProducers || item.coauthor_producers || [];
      if (Array.isArray(coauthors)) {
        coauthors.forEach((c: any) => {
          const u = c.username || c.user?.username;
          const p = c.profilePicUrl || c.profile_pic_url || c.user?.profilePicUrl;
          if (u && u !== username) {
            collaborators.push({ username: u, profilePicUrl: p, role: 'co-author' });
          }
        });
      }

      // Originating Owner (if different from scraped account)
      if (
        primaryOwner &&
        primaryOwner !== username &&
        !collaborators.find((c) => c.username === primaryOwner)
      ) {
        const p =
          item.owner?.profilePicUrl ||
          item.owner?.profile_pic_url ||
          item.owner?.profile_pic_url_hd;
        collaborators.push({ username: primaryOwner, profilePicUrl: p, role: 'origin' });
      }

      // 2. Ensure all discovered collaborators have Accounts and local avatars
      for (const collab of collaborators) {
        let collabAccount = await prisma.account.findUnique({
          where: { username: collab.username },
        });
        if (!collabAccount && collab.username) {
          collabAccount = await prisma.account.create({
            data: {
              username: collab.username,
              profileImageUrl: collab.profilePicUrl,
              lastScrapedAt: new Date(),
            },
          });
        }

        // Queue collab profile image download if we have a URL and it's not local
        if (
          collab.profilePicUrl &&
          (!collabAccount?.profileImageUrl ||
            !collabAccount.profileImageUrl.startsWith('/content/'))
        ) {
          await downloadQueue.add('process-profile-image', {
            username: collab.username,
            url: collab.profilePicUrl,
            contextUsername: username, // Store in context of mainly scraped account
          });
        }
      }

      // Also check tagged users that might be collaborators?
      // For now, focusing on the Owner vs Context distinction.

      const takenAt = item.posted
        ? new Date(item.posted)
        : item.timestamp
          ? new Date(item.timestamp)
          : new Date();
      const likes = item.likes ?? item.likesCount ?? 0;
      const comments = item.comments ?? item.commentsCount ?? 0;
      const videoUrl =
        item.video_links && item.video_links.length > 0 ? item.video_links[0] : item.videoUrl;

      // 3. Upsert Post
      const post = await prisma.post.upsert({
        where: { instagramUrl: instagramUrl },
        update: {
          likes,
          comments,
          instagramId,
          username: postUsername, // Link to processed account
          collaborators: collaborators.length > 0 ? collaborators : undefined,
          runId: runId, // Link to the latest run
        },
        create: {
          instagramId,
          instagramUrl: instagramUrl,
          username: postUsername,
          collaborators: collaborators.length > 0 ? collaborators : undefined,
          caption: item.caption,
          postedAt: takenAt,
          likes,
          comments,
          runId: runId,
        },
        include: {
          transcripts: true,
          media: true,
        },
      });

      // 4. Handle Media
      // Unified media handling: Prefer sidecarMedia, fallback to legacy fields
      let mediaItems: { type: 'image' | 'video'; url: string }[] = item.sidecarMedia || [];

      // Fallback for cached runs or legacy data without sidecarMedia
      if (mediaItems.length === 0) {
        const isVideo = item.type === 'Video' || !!videoUrl;
        const legacyImageUrl =
          item.displayUrl ||
          item.thumbnail ||
          (item.images && item.images.length > 0 ? item.images[0] : null);

        if (isVideo && videoUrl) {
          mediaItems.push({ type: 'video', url: videoUrl });
        } else if (legacyImageUrl) {
          mediaItems.push({ type: 'image', url: legacyImageUrl });
        }
      }

      if (mediaItems.length === 0) {
        logger.warn(`[Ingester] Post ${instagramId} has NO media items.`);
      }

      for (let i = 0; i < mediaItems.length; i++) {
        const media = mediaItems[i];
        if (!media.url) continue;

        // 5. Upsert Media
        let mediaInDb = post.media.find((m) => m.index === i);

        if (mediaInDb) {
          // IMPORTANT: If we already have a local path, DO NOT overwrite with CDN link
          if (!mediaInDb.storageUrl.startsWith('/content/')) {
            mediaInDb = await prisma.media.update({
              where: { id: mediaInDb.id },
              data: { storageUrl: media.url, url: media.url },
            });
          }
        } else {
          // Create new with temporary CDN URL (to be replaced by worker)
          mediaInDb = await prisma.media.create({
            data: {
              postId: post.id,
              type: media.type,
              url: media.url,
              storageUrl: media.url,
              index: i,
            },
          });
        }

        // 6. Queue for Local Storage (Both Images and Videos)
        // If it's already local, we skip
        if (!mediaInDb.storageUrl.startsWith('/content/')) {
          await downloadQueue.add(
            'process-media',
            {
              postId: post.id,
              mediaId: mediaInDb.id,
              runId: runId, // Track which run this belongs to
              url: media.url,
              type: media.type,
              username: postUsername, // Ensure worker knows which folder to use
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          );
          queuedCount++;
        }
      }
    } catch (postError) {
      logger.error(
        `[Ingester] Failed to process individual post: ${item.url || item.shortcode} - ${postError}`,
      );
    }
  }

  logger.info(`[Ingester] Finished. Queued ${queuedCount} videos for processing.`);
  return { found: items.length, queued: queuedCount, runId };
};
