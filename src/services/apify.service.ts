import { ApifyClient } from 'apify-client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const client = new ApifyClient({
  token: config.apify.token,
});

export interface ApifyInstagramPost {
  id: string;
  shortCode: string;
  url: string;
  caption: string;
  timestamp: string;
  likesCount: number;
  commentsCount: number;
  displayUrl: string;
  isVideo: boolean;
  videoUrl?: string;
  ownerUsername: string;
  ownerId: string;
  productType?: string;
  sidecarMedia?: { type: 'image' | 'video'; url: string }[];
}

interface RawApifyPost {
  // Base fields
  id: string;
  shortcode?: string;
  shortCode?: string;
  short_code?: string;
  url?: string;
  caption?: string;
  timestamp?: string;
  posted?: string;
  likesCount?: number;
  likes_count?: number;
  likes?: number;
  commentsCount?: number;
  comments_count?: number;
  comments?: number;
  displayUrl?: string;
  display_url?: string;
  thumbnail?: string;
  is_video?: boolean;
  videoUrl?: string;
  video_url?: string;
  video_links?: string[];
  image_links?: string[];
  ownerUsername?: string;
  owner_username?: string;
  account_username?: string;
  ownerId?: string;
  owner_id?: string;
  productType?: string;
  type?: string; // 'Sidecar', 'Image', 'Video'

  // Sidecar / Carousel fields (from apify/instagram-scraper)
  images?: string[];
  childPosts?: Array<{
    type: string;
    videoUrl?: string;
    displayUrl?: string;
    image_versions2?: { candidates: { url: string }[] };
    video_versions?: { url: string }[];
  }>;
  carousel_media?: Array<{
    type?: string;
    image_versions2?: { candidates: { url: string }[] };
    video_versions?: { url: string }[];
  }>;
}

// Actor: apify/instagram-scraper
export const runSidecarScraper = async (urls: string[]): Promise<RawApifyPost[]> => {
  if (urls.length === 0) return [];
  logger.info(
    `[Apify] Starting sidecar scrape for ${urls.length} posts using actor ${config.apify.instagramSidecarActorId}...`,
  );
  try {
    const items = await withRetry(
      async () => {
        const run = await client.actor(config.apify.instagramSidecarActorId).call(
          {
            directUrls: urls,
            resultsType: 'details',
            searchLimit: 1,
          },
          { waitSecs: 3600 }, // 1 hour timeout per attempt (needed for 5k+ posts)
        );

        logger.info(`[Apify] Sidecar scrape finished. Dataset ID: ${run.defaultDatasetId}`);
        const { items: datasetItems } = await client.dataset(run.defaultDatasetId).listItems();
        return datasetItems as unknown as RawApifyPost[];
      },
      { attempts: 3, delay: 5000, factor: 2 },
    );
    return items;
  } catch (error: any) {
    logger.error(`[Apify] Error running sidecar scraper after retries: ${error.message}`);
    return [];
  }
};

// Actor: perfectscrape/mass-instagram-profile-posts-scraper (Main)
// ID: gcfjdE6gC9K5aGsgi
export const runInstagramScraper = async (
  username: string,
  maxPosts = 10,
): Promise<{ items: ApifyInstagramPost[]; datasetId: string; actorRunId: string }> => {
  try {
    const { items, run } = await withRetry(
      async () => {
        const actorRun = await client.actor(config.apify.instagramPostActorId).call(
          {
            profiles: [username],
            maxResults: maxPosts,
          },
          { waitSecs: 3600 },
        );

        if (actorRun.status !== 'SUCCEEDED') {
          throw new Error(`Apify actor run status: ${actorRun.status}`);
        }

        const { items: rawItems } = await client.dataset(actorRun.defaultDatasetId).listItems();
        return { items: rawItems as unknown as RawApifyPost[], run: actorRun };
      },
      { attempts: 3, delay: 5000, factor: 2 },
    );

    logger.info(`[Apify] Post scrape finished. Dataset ID: ${run.defaultDatasetId}`);

    // Identify Sidecars
    const sidecarUrls: string[] = [];
    const sidecarMap = new Map<string, RawApifyPost>();

    items.forEach((item) => {
      const vidLen = item.video_links?.length || 0;
      const imgLen = item.image_links?.length || 0;

      // User logic: "if there are more than one item between both arrays"
      if (vidLen + imgLen > 1) {
        const shortCode = item.shortcode || item.shortCode || item.short_code;
        if (shortCode) {
          const url = `https://www.instagram.com/p/${shortCode}/`;
          sidecarUrls.push(url);
        }
      }
    });

    if (sidecarUrls.length > 0) {
      logger.info(`[Apify] Found ${sidecarUrls.length} sidecars. Fetching details...`);
      const sidecarItems = await runSidecarScraper(sidecarUrls);

      sidecarItems.forEach((sItem) => {
        // Map by shortcode or URL to match original items
        const sc = sItem.shortcode || sItem.shortCode || sItem.short_code;
        if (sc) sidecarMap.set(sc, sItem);
        // Also map by full URL just in case
        if (sItem.url) sidecarMap.set(sItem.url, sItem);
      });
    }

    const mappedItems: ApifyInstagramPost[] = items.map((item) => {
      let sidecarMedia: { type: 'image' | 'video'; url: string }[] = [];
      const shortCode = item.shortcode || item.shortCode || item.short_code || item.id;

      // Check if we have better data from sidecar scrape
      if (sidecarMap.has(shortCode as string)) {
        const enriched = sidecarMap.get(shortCode as string)!;

        // Extract from enriched data (apify/instagram-scraper format)
        // usually 'childPosts' or 'carousel_media'
        if (enriched.carousel_media) {
          enriched.carousel_media.forEach((m) => {
            if (m.video_versions && m.video_versions.length > 0) {
              sidecarMedia.push({ type: 'video', url: m.video_versions[0].url });
            } else if (m.image_versions2 && m.image_versions2.candidates.length > 0) {
              sidecarMedia.push({ type: 'image', url: m.image_versions2.candidates[0].url });
            }
          });
        } else if (enriched.childPosts) {
          enriched.childPosts.forEach((cp) => {
            if (cp.type === 'Video' && cp.videoUrl) {
              sidecarMedia.push({ type: 'video', url: cp.videoUrl });
            } else if (cp.displayUrl) {
              sidecarMedia.push({ type: 'image', url: cp.displayUrl });
            }
          });
        }
      } else {
        // Fallback to Main Actor data (video_links / image_links)
        // NOTE: Main actor provides flat lists, we don't know the order/pairing exactly,
        // but user said to use sidecar actor for sidecars.
        // The instruction implies we ONLY use main actor data if it's NOT a sidecar or if sidecar fetch failed.
        // But if it IS a sidecar (implied by >1 item), we hopefully got data.
        // If not, we fall back to what we have.

        if (item.video_links) {
          item.video_links.forEach((v) => sidecarMedia.push({ type: 'video', url: v }));
        }
        if (item.image_links) {
          item.image_links.forEach((i) => sidecarMedia.push({ type: 'image', url: i }));
        }
        // Deduplicate if needed?
      }

      // Single Media Fallback (if sidecarMedia is empty)
      if (sidecarMedia.length === 0) {
        const vUrl = item.videoUrl || item.video_url || (item.video_links && item.video_links[0]);
        if (vUrl) {
          sidecarMedia.push({ type: 'video', url: vUrl });
        } else {
          const iUrl =
            item.displayUrl ||
            item.display_url ||
            item.thumbnail ||
            (item.image_links && item.image_links[0]);
          if (iUrl) sidecarMedia.push({ type: 'image', url: iUrl });
        }
      }

      const itemUrl = item.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : '');

      return {
        id: item.id as string,
        shortCode: shortCode as string,
        url: itemUrl as string,
        caption: item.caption || '',
        timestamp: item.posted || item.timestamp || new Date().toISOString(),
        likesCount: item.likesCount || item.likes_count || item.likes || 0,
        commentsCount: item.commentsCount || item.comments_count || item.comments || 0,
        displayUrl: item.displayUrl || item.display_url || item.thumbnail || '',
        isVideo: (item.is_video ??
          (!!item.videoUrl ||
            !!item.video_url ||
            (item.video_links && item.video_links.length > 0))) as boolean,
        videoUrl: item.videoUrl || item.video_url || (item.video_links && item.video_links[0]),
        ownerUsername: item.ownerUsername || item.owner_username || item.account_username || '',
        ownerId: item.ownerId || item.owner_id || '',
        productType: item.productType,
        sidecarMedia: sidecarMedia,
      };
    });

    return {
      items: mappedItems,
      datasetId: run.defaultDatasetId,
      actorRunId: run.id,
    };
  } catch (error: any) {
    logger.error(`[Apify] Error running instagram scraper after retries: ${error.message}`);
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

// Actor: coderx/instagram-profile-scraper-bio-posts
// ID: PP60E1JIfagMaQxIP
export const getProfileInfo = async (username: string): Promise<ApifyProfileInfo | null> => {
  interface RawApifyProfile {
    username: string;
    fullName?: string;
    full_name?: string;
    biography?: string;
    profilePicUrl?: string;
    profile_pic_url?: string;
    hdProfilePicUrl?: string;
    hd_profile_pic_url_info?: { url: string };
    followersCount?: number;
    followers_count?: number;
    followsCount?: number;
    following_count?: number;
    postsCount?: number;
    media_count?: number;
    externalUrl?: string;
    external_url?: string;
    isBusinessAccount?: boolean;
    is_business_account?: boolean;
    verified?: boolean;
    is_verified?: boolean;
  }

  try {
    const profile = await withRetry(
      async () => {
        const run = await client.actor(config.apify.instagramProfileActorId).call(
          {
            usernames: [username],
          },
          { waitSecs: 180 }, // Profiles are faster
        );

        if (run.status !== 'SUCCEEDED') {
          throw new Error(`Apify profile actor status: ${run.status}`);
        }

        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        if (items.length === 0) return null;
        return items[0] as unknown as RawApifyProfile;
      },
      { attempts: 3, delay: 5000, factor: 2 },
    );

    if (!profile) {
      logger.warn(`[Apify] No profile found for ${username}`);
      return null;
    }

    const item = profile;

    return {
      username: item.username,
      fullName: item.fullName || item.full_name,
      biography: item.biography,
      profilePicUrl: (item.profilePicUrl || item.profile_pic_url) as string,
      profilePicUrlHD: item.hdProfilePicUrl || item.hd_profile_pic_url_info?.url,
      followersCount: item.followersCount || item.followers_count,
      followsCount: item.followsCount || item.following_count,
      postsCount: item.postsCount || item.media_count,
      externalUrl: item.externalUrl || item.external_url,
      isBusinessAccount: item.isBusinessAccount || item.is_business_account,
      verified: item.verified || item.is_verified,
    };
  } catch (error: any) {
    logger.error(
      `[Apify] Error fetching profile info for ${username} after retries: ${error.message}`,
    );
    return null;
  }
};
