import { prisma } from '../db/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const backfill = async () => {
  logger.info('[Scripts] Starting embeddings backfill...');

  const transcripts = await prisma.transcript.findMany({
    where: { embedding: null },
    include: { post: true },
  });

  logger.info(`[Scripts] Found ${transcripts.length} transcripts needing embeddings.`);

  for (let i = 0; i < transcripts.length; i++) {
    const t = transcripts[i];
    const progress = `[${i + 1}/${transcripts.length}]`;

    try {
      logger.info(`${progress} Embedding transcript ${t.id} (@${t.post?.username || 'unknown'})`);

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: t.text.replace(/\n/g, ' '),
        encoding_format: 'float',
      });

      const embedding = response.data[0].embedding;

      await prisma.$executeRaw`
        INSERT INTO "Embedding" ("id", "transcriptId", "vector", "model", "createdAt")
        VALUES (
          gen_random_uuid(), 
          ${t.id}, 
          ${embedding}::vector, 
          'text-embedding-3-small', 
          NOW()
        )
      `;
    } catch (e) {
      logger.error(`${progress} Failed to embed transcript ${t.id}: ${e}`);
    }
  }

  logger.info('[Scripts] Backfill complete.');
};

backfill()
  .catch((e) => {
    logger.error(`[Scripts] Backfill fatal error: ${e}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
