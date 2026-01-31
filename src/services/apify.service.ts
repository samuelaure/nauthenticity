
import { ApifyClient } from 'apify-client';
import { config } from '../config';

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
}

// Actor: perfectscrape/mass-instagram-profile-posts-scraper-results-based
// ID: gcfjdE6gC9K5aGsgi
export const runInstagramScraper = async (username: string, maxPosts = 10): Promise<{ items: ApifyInstagramPost[]; datasetId: string; actorRunId: string }> => {
  console.log(`[Apify] Starting post scrape for ${username} using actor ${config.apify.instagramPostActorId}...`);

  const run = await client.actor(config.apify.instagramPostActorId).call({
    username: [username],
    resultsLimit: maxPosts,
  });

  console.log(`[Apify] Post scrape finished. Dataset ID: ${run.defaultDatasetId}`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const mappedItems: ApifyInstagramPost[] = items.map((item: any) => ({
    id: item.id,
    shortCode: item.shortCode || item.short_code, // Handle possible snake_case
    url: item.url,
    caption: item.caption,
    timestamp: item.timestamp,
    likesCount: item.likesCount || item.likes_count || 0,
    commentsCount: item.commentsCount || item.comments_count || 0,
    displayUrl: item.displayUrl || item.display_url,
    isVideo: item.is_video ?? false,
    videoUrl: item.videoUrl || item.video_url, // Optional, might not be present in all results
    ownerUsername: item.ownerUsername || item.owner_username,
    ownerId: item.ownerId || item.owner_id,
    productType: item.productType,
  }));

  return {
    items: mappedItems,
    datasetId: run.defaultDatasetId,
    actorRunId: run.id,
  };
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
  console.log(`[Apify] Fetching profile info for ${username} with actor ${config.apify.instagramProfileActorId}...`);

  // This actor strictly requires 'usernames' as an array
  const run = await client.actor(config.apify.instagramProfileActorId).call({
    usernames: [username],
  });

  console.log(`[Apify] Profile scrape finished. Dataset: ${run.defaultDatasetId}`);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  if (items.length === 0) return null;

  // The actor returns the profile object as the first item
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = items[0] as any;

  return {
    username: item.username,
    fullName: item.fullName || item.full_name,
    biography: item.biography,
    profilePicUrl: item.profilePicUrl || item.profile_pic_url,
    profilePicUrlHD: item.hdProfilePicUrl || item.hd_profile_pic_url_info?.url,
    followersCount: item.followersCount || item.followers_count,
    followsCount: item.followsCount || item.following_count,
    postsCount: item.postsCount || item.media_count,
    externalUrl: item.externalUrl || item.external_url,
    isBusinessAccount: item.isBusinessAccount || item.is_business_account,
    verified: item.verified || item.is_verified,
  };
};
