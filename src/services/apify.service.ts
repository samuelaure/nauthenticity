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
