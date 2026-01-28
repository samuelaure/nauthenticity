import { ApifyClient } from 'apify-client';
import { config } from '../config';

const client = new ApifyClient({
    token: config.apify.token,
});

export interface ApifyInstagramPost {
    id: string;
    url: string;
    caption: string;
    timestamp: string; // ISO date
    likesCount: number;
    commentsCount: number;
    videoUrl?: string; // Important for Reels
    displayUrl: string; // Image/Thumbnail
    type: string; // 'Video', 'Image', 'Sidecar'
}

export const runInstagramScraper = async (username: string, maxPosts = 10) => {
    console.log(`[Apify] Starting scrape for ${username}...`);

    // Run the actor
    const run = await client.actor(config.apify.instagramActorId).call({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsLimit: maxPosts,
        resultsType: "posts",
    });

    console.log(`[Apify] Run finished. Dataset ID: ${run.defaultDatasetId}`);

    // Fetch results
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items as any as ApifyInstagramPost[];
};
