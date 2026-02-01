
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
  sidecarMedia?: { type: 'image' | 'video'; url: string }[];
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

  interface RawApifyPost {
    id: string;
    shortCode?: string;
    short_code?: string;
    url: string;
    caption: string;
    timestamp: string;
    likesCount?: number;
    likes_count?: number;
    commentsCount?: number;
    comments_count?: number;
    displayUrl?: string;
    display_url?: string;
    is_video?: boolean;
    videoUrl?: string;
    video_url?: string;
    ownerUsername?: string;
    owner_username?: string;
    ownerId?: string;
    owner_id?: string;
    productType?: string;

    // Sidecar / Carousel fields
    images?: string[]; // Array of image URLs
    videoVideos?: string[]; // Sometimes used
    carousel_media?: Array<{
      type?: string;
      image_versions2?: { candidates: { url: string }[] };
      video_versions?: { url: string }[];
      original_width?: number;
      original_height?: number;
    }>;
  }

  const mappedItems: ApifyInstagramPost[] = items.map((itemUnknown: unknown) => {
    const item = itemUnknown as RawApifyPost;

    // Extract logical media items
    const mediaItems: { type: 'image' | 'video'; url: string }[] = [];

    // 1. Check for Carousel data first (highest fidelity)
    if (item.carousel_media && Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
      item.carousel_media.forEach(cm => {
        if (cm.video_versions && cm.video_versions.length > 0) {
          mediaItems.push({ type: 'video', url: cm.video_versions[0].url });
        } else if (cm.image_versions2 && cm.image_versions2.candidates.length > 0) {
          mediaItems.push({ type: 'image', url: cm.image_versions2.candidates[0].url });
        }
      });
    }
    // 2. Check for simple images array (often provided by this specific actor)
    else if (item.images && Array.isArray(item.images) && item.images.length > 0) {
      // If it's a video post, the first image is usually the thumbnail
      // But if it's a sidecar of images, this array holds them.
      // We need to be careful not to duplicate the thumbnail if it's a single video.

      if ((item.is_video || item.videoUrl || item.video_url)) {
        // It's a single video, handled below
      } else {
        // It's likely an image sidecar
        item.images.forEach(imgUrl => mediaItems.push({ type: 'image', url: imgUrl }));
      }
    }

    // 3. Fallback/Primary Single Media
    // Ensure the main video/image is included if not already covered by carousel
    if (mediaItems.length === 0) {
      if (item.is_video || item.videoUrl || item.video_url) {
        const vUrl = item.videoUrl || item.video_url;
        if (vUrl) mediaItems.push({ type: 'video', url: vUrl });
      } else {
        const iUrl = item.displayUrl || item.display_url;
        if (iUrl) mediaItems.push({ type: 'image', url: iUrl });
      }
    }

    return {
      id: item.id as string,
      shortCode: (item.shortCode || item.short_code) as string,
      url: item.url as string,
      caption: item.caption as string,
      timestamp: item.timestamp as string,
      likesCount: (item.likesCount || item.likes_count || 0) as number,
      commentsCount: (item.commentsCount || item.comments_count || 0) as number,
      displayUrl: (item.displayUrl || item.display_url) as string,
      isVideo: (item.is_video ?? false) as boolean,
      videoUrl: (item.videoUrl || item.video_url) as string | undefined,
      ownerUsername: (item.ownerUsername || item.owner_username) as string,
      ownerId: (item.ownerId || item.owner_id) as string,
      productType: item.productType as string | undefined,
      sidecarMedia: mediaItems,
    };
  });

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

  if (items.length === 0) return null;

  // The actor returns the profile object as the first item
  const item = items[0] as unknown as RawApifyProfile;

  return {
    username: item.username,
    fullName: item.fullName || item.full_name,
    biography: item.biography,
    profilePicUrl: (item.profilePicUrl || item.profile_pic_url) as string, // Cast to string as fallback or ensure logic handles undefined if needed, but per type def it is string
    profilePicUrlHD: item.hdProfilePicUrl || item.hd_profile_pic_url_info?.url,
    followersCount: item.followersCount || item.followers_count,
    followsCount: item.followsCount || item.following_count,
    postsCount: item.postsCount || item.media_count,
    externalUrl: item.externalUrl || item.external_url,
    isBusinessAccount: item.isBusinessAccount || item.is_business_account,
    verified: item.verified || item.is_verified,
  };
};
