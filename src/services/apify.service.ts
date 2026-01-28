import { ApifyClient } from 'apify-client';
import { config } from '../config';

const client = new ApifyClient({
    token: config.apify.token,
});

export interface ApifyInstagramPost {
    id: string;
    shortcode?: string;
    url?: string;
    caption: string;
    timestamp?: string; // ISO date (old actor)
    posted?: string;    // Human date (new actor)
    likesCount?: number; // Old actor
    commentsCount?: number; // Old actor
    likes?: number;      // New actor
    comments?: number;   // New actor
    videoUrl?: string;   // Old actor
    video_links?: string[]; // New actor
    displayUrl?: string; // Old actor
    thumbnail?: string;  // New actor
    type?: string;
    ownerUsername?: string; // Old actor
    account_username?: string; // New actor
}

export const runInstagramScraper = async (username: string, maxPosts = 10) => {
    console.log(`[Apify] Starting scrape for ${username} with optimized actor...`);

    const run = await client.actor("apify/instagram-post-scraper").call({
        username: [username],
        resultsLimit: maxPosts,
    });

    console.log(`[Apify] Run finished. Dataset ID: ${run.defaultDatasetId}`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return {
        items: items as any as ApifyInstagramPost[],
        datasetId: run.defaultDatasetId,
        actorRunId: run.id
    };
};

export interface ApifyProfileInfo {
    username: string;
    profilePicUrl: string;
    profilePicUrlHD?: string;
    biography?: string;
    fullName?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
}

export const getProfileInfo = async (username: string): Promise<ApifyProfileInfo | null> => {
    console.log(`[Apify] Fetching profile info for ${username} with actor lezdhAFfa4H5zAb2A...`);
    const run = await client.actor("lezdhAFfa4H5zAb2A").call({
        usernames: [username],
    });

    console.log(`[Apify] Profile scrape finished. Dataset: ${run.defaultDatasetId}`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (items.length === 0) return null;

    const item = items[0] as any;
    return {
        username: item.username,
        profilePicUrl: item.profilePicUrl || item.profile_pic_url,
        profilePicUrlHD: item.profilePicUrlHD || item.hd_profile_pic_url_info?.url,
        biography: item.biography,
        fullName: item.fullName || item.full_name,
        followersCount: item.followersCount || item.followers_count,
        followsCount: item.followsCount || item.following_count,
        postsCount: item.postsCount || item.media_count,
    };
};
