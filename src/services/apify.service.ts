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

    // Run the actor: https://apify.com/apify/instagram-post-scraper
    // Using the ID from the URL provided by the user: gcfjdE6gC9K5aGsgi
    const run = await client.actor("apify/instagram-post-scraper").call({
        username: [username],
        resultsLimit: maxPosts,
    });

    console.log(`[Apify] Run finished. Dataset ID: ${run.defaultDatasetId}`);

    // Fetch results
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items as any as ApifyInstagramPost[];
};
