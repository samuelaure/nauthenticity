import { runInstagramScraper, getProfileInfo } from '../../services/apify.service';
import { prisma } from '../../db/prisma';
import { processingQueue } from '../../queues/processing.queue';

export const ingestProfile = async (username: string, maxPosts = 10) => {
  console.log(`[Ingester] Starting ingestion for ${username}`);

  // 0. Ensure Account exists (Identity)
  // @ts-ignore - Prisma client potentially outdated due to dev environment locks
  let account = await prisma.account.findUnique({ where: { username } });
  if (!account) {
    console.log(`[Ingester] Account ${username} not found. Fetching profile info...`);
    try {
      const profile = await getProfileInfo(username);
      if (profile) {
        account = await prisma.account.create({
          data: {
            username: profile.username,
            profileImageUrl: profile.profilePicUrlHD || profile.profilePicUrl,
            lastScrapedAt: new Date(),
          },
        });
      } else {
        console.warn(
          `[Ingester] Could not fetch profile info for ${username}. Creating placeholder.`,
        );
        account = await prisma.account.create({
          data: { username, lastScrapedAt: new Date() },
        });
      }
    } catch (e) {
      console.error(`[Ingester] Error fetching profile info: ${e}`);
      account = await prisma.account.create({
        data: { username, lastScrapedAt: new Date() },
      });
    }
  }

  // Queue Profile Image download if not local
  if (account.profileImageUrl && !account.profileImageUrl.startsWith('/content/')) {
    await processingQueue.add('process-profile-image', {
      username: account.username,
      url: account.profileImageUrl,
      contextUsername: username // The account currently being scraped
    });
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

  if (cachedRun && cachedRun.rawData) {
    console.log(`[Ingester] Using cached scraping results from run ${cachedRun.id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items = cachedRun.rawData as any[];
    runId = cachedRun.id;
  } else {
    const scrapeResult = await runInstagramScraper(username, maxPosts);
    items = scrapeResult.items;

    // Create internal run record
    const run = await prisma.scrapingRun.create({
      data: {
        username,
        actorRunId: scrapeResult.actorRunId,
        datasetId: scrapeResult.datasetId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawData: items as any,
        status: 'completed',
      },
    });
    runId = run.id;
  }

  console.log(`[Ingester] Processing ${items.length} posts. Saving to DB...`);

  let queuedCount = 0;

  for (const item of items) {
    try {
      // 2. Data Mapping (Resiliency for different actors)
      const instagramUrl =
        item.url || (item.shortcode ? `https://www.instagram.com/p/${item.shortcode}/` : null);

      if (!instagramUrl) {
        console.warn(`[Ingester] Skipping item without URL/Shortcode: ${JSON.stringify(item)}`);
        continue;
      }

      const instagramId = item.id || item.shortcode;
      // Force the post to belong to the account we are scraping (User Request)
      const postUsername = username;

      // Detect Collaboration / Origin
      const actualOwner = item.ownerUsername || item.account_username;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collaborators: any[] = [];

      if (actualOwner && actualOwner !== username) {
        console.log(`[Ingester] Detected collaboration/origin: ${actualOwner}`);
        const collabProfileUrl = item.owner?.profile_pic_url || item.owner?.profilePicUrl;

        collaborators.push({
          username: actualOwner,
          profilePicUrl: collabProfileUrl,
          role: 'origin'
        });

        // Ensure collaborator has an Account record (but no posts, so it's hidden)
        let collabAccount = await prisma.account.findUnique({ where: { username: actualOwner } });
        if (!collabAccount) {
          collabAccount = await prisma.account.create({
            data: {
              username: actualOwner,
              profileImageUrl: collabProfileUrl,
              lastScrapedAt: new Date()
            }
          });
        }

        // Queue collab profile image
        if (collabProfileUrl && (!collabAccount.profileImageUrl || !collabAccount.profileImageUrl.startsWith('/content/'))) {
          await processingQueue.add('process-profile-image', {
            username: actualOwner,
            url: collabProfileUrl,
            contextUsername: username // Store inside the currently scraped account folder
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
        console.warn(`[Ingester] Post ${instagramId} has NO media items.`);
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
              data: { storageUrl: media.url }
            });
          }
        } else {
          // Create new with temporary CDN URL (to be replaced by worker)
          mediaInDb = await prisma.media.create({
            data: {
              postId: post.id,
              type: media.type,
              storageUrl: media.url,
              index: i,
            },
          });
        }

        // 6. Queue for Local Storage (Both Images and Videos)
        // If it's already local, we skip
        if (!mediaInDb.storageUrl.startsWith('/content/')) {
          await processingQueue.add(
            'process-media',
            {
              postId: post.id,
              mediaId: mediaInDb.id,
              url: media.url,
              type: media.type,
              username: postUsername // Ensure worker knows which folder to use
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
      console.error(
        `[Ingester] Failed to process individual post: ${item.url || item.shortcode}`,
        postError,
      );
    }
  }

  console.log(`[Ingester] Finished. Queued ${queuedCount} videos for processing.`);
  return { found: items.length, queued: queuedCount, runId };
};
