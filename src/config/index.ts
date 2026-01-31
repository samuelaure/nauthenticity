import dotenv from 'dotenv';
dotenv.config();

import { env } from './env';

export const config = {
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
  apify: {
    token: env.APIFY_TOKEN,
    instagramPostActorId: 'gcfjdE6gC9K5aGsgi', // perfectscrape/mass-instagram-profile-posts-scraper
    instagramProfileActorId: 'PP60E1JIfagMaQxIP', // coderx/instagram-profile-scraper-bio-posts
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
  },
  paths: {
    temp: './temp',
    storage: './storage',
  },
};
