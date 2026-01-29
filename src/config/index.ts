import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  databaseUrl: process.env.DATABASE_URL,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  apify: {
    token: process.env.APIFY_TOKEN,
    instagramActorId: 'apify/instagram-scraper',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  paths: {
    temp: './temp',
    storage: './storage',
  },
};
