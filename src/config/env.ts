import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  APIFY_TOKEN: z.string().min(1),
  APIFY_INSTAGRAM_UNIVERSAL_ACTOR_ID: z.string().default('samuelaure/nau-ig-actor'),
  OPENAI_API_KEY: z.string().min(1),
  TRANSCRIPTION_URL: z.string().url().optional(),
  NAU_SERVICE_KEY: z.string().default('development_key'),
  JWT_SECRET: z.string().default('changeme'),
  ZAZU_URL: z.string().default('http://zazu:3000'),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (): Env => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
};

export const env = validateEnv();
