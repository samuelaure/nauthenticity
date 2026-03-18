import { ApifyClient } from 'apify-client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const client = new ApifyClient({
  token: config.apify.token,
});

export class NoRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoRetryError';
  }
}

export interface ApifyInstagramPost {
  id: string;
  shortcode: string;
  shortCode: string;
  url: string;
  caption: string;
  timestamp: string;
  posted: string;
  likesCount: number;
  likes: number;
  commentsCount: number;
  comments: number;
  displayUrl: string;
  isVideo: boolean;
  videoUrl?: string;
  video_links: string[];
  ownerUsername: string;
  ownerId: string;
  productType?: string;
  sidecarMedia?: { type: 'image' | 'video'; url: string }[];
}

export interface NauIGProfile {
  id: string;
  username: string;
  fullName?: string;
  biography?: string;
  profilePicUrl: string;
  profilePicUrlHD?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  externalUrl?: string;
  isBusinessAccount?: boolean;
  isVerified?: boolean;
}

export interface NauIGPostMedia {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  viewCount?: number;
}

export interface NauIGPost {
  id: string;
  shortcode: string;
  url: string;
  caption: string;
  takenAt: string;
  likesCount: number;
  commentsCount: number;
  videoViewCount?: number;
  author: {
    id: string;
    username: string;
    fullName?: string;
    profilePicUrl?: string;
    isVerified?: boolean;
    isOwner?: boolean;
  };
  hashtags?: string[];
  mentions?: string[];
  media: NauIGPostMedia[];
  isPinned: boolean;
  isReel: boolean;
  productType: string;
  music?: {
    id: string;
    title: string;
    artist: string;
  };
}

// --- Mapping Helpers ---

const mapNauPostToApifyPost = (post: NauIGPost): ApifyInstagramPost => {
  const firstMedia = post.media[0];
  return {
    id: post.id,
    shortcode: post.shortcode, // Ingester expects lowercase
    shortCode: post.shortcode,
    url: post.url,
    caption: post.caption,
    timestamp: post.takenAt,
    posted: post.takenAt, // Ingester fallback
    likesCount: post.likesCount,
    likes: post.likesCount, // Ingester fallback
    commentsCount: post.commentsCount,
    comments: post.commentsCount, // Ingester fallback
    displayUrl: firstMedia?.thumbnail || firstMedia?.url || '',
    isVideo: firstMedia?.type === 'video',
    videoUrl: firstMedia?.type === 'video' ? firstMedia.url : undefined,
    video_links: firstMedia?.type === 'video' ? [firstMedia.url] : [], // Ingester fallback
    ownerUsername: post.author.username,
    ownerId: post.author.id,
    productType: post.productType,
    sidecarMedia: post.media.map((m) => ({
      type: m.type,
      url: m.url,
    })),
  };
};

const mapNauProfileToApifyProfile = (profile: NauIGProfile): ApifyProfileInfo => {
  return {
    username: profile.username,
    fullName: profile.fullName,
    biography: profile.biography,
    profilePicUrl: profile.profilePicUrl,
    profilePicUrlHD: profile.profilePicUrlHD,
    followersCount: profile.followersCount,
    followsCount: profile.followsCount,
    postsCount: profile.postsCount,
    externalUrl: profile.externalUrl,
    isBusinessAccount: profile.isBusinessAccount,
    verified: profile.isVerified,
  };
};

// --- Universal Scraper ---

export const runUniversalInstagramScraper = async (
  username: string,
  maxPosts = 10,
  onStatus?: (message: string) => Promise<void>,
  mode: 'FEED' | 'PROFILE' = 'FEED',
  oldestPostDate?: string,
): Promise<{ profile: NauIGProfile; items: NauIGPost[]; runId: string; datasetId: string }> => {
  logger.info(
    `[Apify] Starting universal scrape (${mode}) for ${username} (limit: ${maxPosts})...`,
  );

  const { items, run } = await withRetry(
    async () => {
      if (onStatus) await onStatus(`Waiting for Apify actor to start (${mode})...`);

      const actorRun = await client.actor(config.apify.instagramUniversalActorId).call(
        {
          mode,
          usernames: [username],
          limit: mode === 'PROFILE' ? 1 : maxPosts,
          sortDirection: 'desc',
          proxyConfiguration: { useApifyProxy: true },
          ...(oldestPostDate ? { oldestPostDate } : {}),
        },
        { waitSecs: 3600, memory: 1024 },
      );

      // Report runId so it can be aborted if needed
      if (onStatus) await onStatus(`Run ID: ${actorRun.id}`);

      if (actorRun.status !== 'SUCCEEDED') {
        logger.warn(`[Apify] Actor run ${actorRun.id} status: ${actorRun.status}`);
        if (actorRun.status === 'ABORTED' || actorRun.status === 'TIMED-OUT') {
          throw new NoRetryError(`Apify actor run status: ${actorRun.status}`);
        }
        throw new Error(`Apify actor run status: ${actorRun.status}`);
      }

      if (onStatus) await onStatus(`Scraping finished. Fetching results...`);

      const { items: datasetItems } = await client.dataset(actorRun.defaultDatasetId).listItems({
        limit: maxPosts + 10, // Ensure we get the profile + all requested posts
      });
      return { items: datasetItems as unknown as any[], run: actorRun };
    },
    { attempts: 3, delay: 5000, factor: 2 },
  );

  if (items.length === 0) {
    throw new Error(`[Apify] No items returned for ${username}`);
  }

  const profile = items[0] as NauIGProfile;
  const posts = items.slice(1) as NauIGPost[];

  return {
    profile,
    items: posts,
    runId: run.id,
    datasetId: run.defaultDatasetId,
  };
};

export const runUniversalProfilesScraper = async (
  usernames: string[],
  onStatus?: (message: string) => Promise<void>,
): Promise<{ profiles: NauIGProfile[]; runId: string; datasetId: string }> => {
  logger.info(`[Apify] Starting universal profile scrape for ${usernames.length} usernames...`);

  const { items, run } = await withRetry(
    async () => {
      if (onStatus) await onStatus(`Waiting for Apify actor to start (PROFILE batch)...`);

      const actorRun = await client.actor(config.apify.instagramUniversalActorId).call(
        {
          mode: 'PROFILE',
          usernames,
          limit: 1, // 1 per profile
          proxyConfiguration: { useApifyProxy: true },
        },
        { waitSecs: 3600, memory: 1024 },
      );

      // Report runId so it can be aborted if needed
      if (onStatus) await onStatus(`Run ID: ${actorRun.id}`);

      if (actorRun.status !== 'SUCCEEDED') {
        logger.warn(`[Apify] Actor run ${actorRun.id} status: ${actorRun.status}`);
        if (actorRun.status === 'ABORTED' || actorRun.status === 'TIMED-OUT') {
          throw new NoRetryError(`Apify actor run status: ${actorRun.status}`);
        }
        throw new Error(`Apify actor run status: ${actorRun.status}`);
      }

      const { items: datasetItems } = await client.dataset(actorRun.defaultDatasetId).listItems({
        limit: usernames.length + 10,
      });
      return { items: datasetItems as unknown as any[], run: actorRun };
    },
    { attempts: 3, delay: 5000, factor: 2 },
  );

  return {
    profiles: items as NauIGProfile[],
    runId: run.id,
    datasetId: run.defaultDatasetId,
  };
};

export const runInstagramScraper = async (
  username: string,
  maxPosts = 10,
  onStatus?: (message: string) => Promise<void>,
  oldestPostDate?: string,
): Promise<{
  profile: ApifyProfileInfo;
  items: ApifyInstagramPost[];
  datasetId: string;
  actorRunId: string;
}> => {
  try {
    const {
      profile: rawProfile,
      items,
      runId,
      datasetId,
    } = await runUniversalInstagramScraper(username, maxPosts, onStatus, 'FEED', oldestPostDate);

    const mappedItems = items.map(mapNauPostToApifyPost);
    const mappedProfile = mapNauProfileToApifyProfile(rawProfile);

    return {
      profile: mappedProfile,
      items: mappedItems,
      datasetId,
      actorRunId: runId,
    };
  } catch (error: any) {
    logger.error(`[Apify] Error running universal instagram scraper: ${error.message}`);
    throw error;
  }
};

export interface ApifyProfileInfo {
  username: string;
  fullName?: string;
  biography?: string;
  profilePicUrl: string;
  profilePicUrlHD?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  externalUrl?: string;
  isBusinessAccount?: boolean;
  verified?: boolean;
}

export const getProfileInfo = async (
  username: string,
  onStatus?: (message: string) => Promise<void>,
): Promise<ApifyProfileInfo | null> => {
  try {
    const { profile } = await runUniversalInstagramScraper(username, 1, onStatus);
    return mapNauProfileToApifyProfile(profile);
  } catch (error: any) {
    logger.error(`[Apify] Error fetching profile via universal: ${error.message}`);
    return null;
  }
};

export const getProfilesInfo = async (
  usernames: string[],
  onStatus?: (message: string) => Promise<void>,
): Promise<ApifyProfileInfo[]> => {
  if (usernames.length === 0) return [];
  try {
    const { profiles } = await runUniversalProfilesScraper(usernames, onStatus);
    return profiles.map(mapNauProfileToApifyProfile);
  } catch (error: any) {
    logger.error(`[Apify] Error fetching batch profiles via universal: ${error.message}`);
    return [];
  }
};

export const abortActorRun = async (runId: string) => {
  logger.info(`[Apify] Aborting actor run: ${runId}`);
  try {
    await client.run(runId).abort();
    return true;
  } catch (error: any) {
    logger.error(`[Apify] Error aborting run ${runId}: ${error.message}`);
    return false;
  }
};
