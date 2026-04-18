import dotenv from 'dotenv';
dotenv.config();

import { env } from './env';

export const config = {
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },
  apify: {
    token: env.APIFY_TOKEN,
    instagramUniversalActorId: env.APIFY_INSTAGRAM_UNIVERSAL_ACTOR_ID,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
  },
  hosts: {
    zazu: env.ZAZU_URL,
  },
  nauServiceKey: env.NAU_SERVICE_KEY,
  jwtSecret: env.JWT_SECRET,
  paths: {
    temp: './temp',
    storage: './storage',
  },
  transcription: {
    url: env.TRANSCRIPTION_URL,
  },
};
