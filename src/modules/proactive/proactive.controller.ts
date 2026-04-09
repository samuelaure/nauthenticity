import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { runProactiveFanout } from './fanout.processor';
import { config } from '../../config';

// ---------------------------------------------------------------------------
// Auth middleware — NAU_SERVICE_KEY
// ---------------------------------------------------------------------------

const authenticate = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${config.nauServiceKey}`) {
    reply.status(401).send({ error: 'Unauthorized. Invalid or missing NAU_SERVICE_KEY.' });
    return;
  }
  done();
};

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const BrandCreateSchema = z.object({
  brandName: z.string().min(1),
  voicePrompt: z.string().min(1),
  commentStrategy: z.string().optional().nullable(),
  suggestionsCount: z.number().int().min(1).max(10).default(3),
  windowStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  windowEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  timezone: z.string().default('UTC'),
  isActive: z.boolean().default(true),
  userId: z.string().min(1),
});

const BrandUpdateSchema = BrandCreateSchema.partial().omit({ userId: true });

const TargetCreateSchema = z.object({
  brandId: z.string().min(1),
  usernames: z.array(z.string().min(1)),
  profileStrategy: z.string().optional().nullable(),
});

const TargetUpdateSchema = z.object({
  profileStrategy: z.string().optional().nullable(),
});

const FeedbackSchema = z.object({
  commentText: z.string().min(1),
  brandId: z.string().min(1),
  sourcePostId: z.string().min(1),
  isSelected: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const proactiveController: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // 1. Reactive trigger (mocked — sync scraping pending)
  // -------------------------------------------------------------------------
  fastify.post('/v1/generate-comment', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { targetUrl, brandId } = request.body as { targetUrl?: string; brandId?: string };
      if (!targetUrl || !brandId) throw new Error('Missing required fields: targetUrl and brandId');

      const brand = await prisma.brandConfig.findUnique({ where: { id: brandId } });
      if (!brand) return reply.status(404).send({ error: 'Brand config not found' });

      return reply.send({
        success: true,
        message: 'Reactive endpoint active. Sync scraping integration pending.',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[Proactive] Error in generate-comment: ${msg}`);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 2. Comment feedback — log selected or optimistic suggestions
  // -------------------------------------------------------------------------
  fastify.post('/v1/comment-feedback', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { commentText, brandId, sourcePostId, isSelected } = FeedbackSchema.parse(request.body);

      await prisma.commentFeedback.create({
        data: {
          brandId,
          postId: sourcePostId,
          commentText,
          isSelected,
        },
      });

      logger.info(
        `[Proactive] Feedback saved for brand ${brandId} on post ${sourcePostId} (isSelected=${isSelected})`,
      );
      return reply.send({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[Proactive] Telemetry error: ${msg}`);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Manual fanout trigger — debug/emergency only (cron is the real driver)
  // -------------------------------------------------------------------------
  fastify.post('/v1/trigger-fanout', { preHandler: authenticate }, async (_request, reply) => {
    logger.info(`[Proactive] Manual fanout trigger received.`);
    runProactiveFanout().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[FanoutProcessor] Unhandled error: ${msg}`);
    });
    return reply.send({
      success: true,
      message: 'Fanout initiated in background. (Manual trigger — cron is the regular driver)',
    });
  });

  // -------------------------------------------------------------------------
  // 4. Brand — List & Create
  // -------------------------------------------------------------------------
  fastify.get('/v1/brands', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) return reply.status(400).send({ error: 'Missing required query param: userId' });

    const brands = await prisma.brandConfig.findMany({
      where: { userId },
      include: { targets: { select: { username: true, profileStrategy: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send(brands);
  });

  fastify.post('/v1/brands', { preHandler: authenticate }, async (request, reply) => {
    try {
      const data = BrandCreateSchema.parse(request.body);
      const brand = await prisma.brandConfig.create({ data });
      return reply.status(201).send(brand);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 5. Brand — Get single & Update
  // -------------------------------------------------------------------------
  fastify.get('/v1/brands/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await prisma.brandConfig.findUnique({
      where: { id },
      include: { targets: { select: { username: true, profileStrategy: true } } },
    });
    if (!brand) return reply.status(404).send({ error: 'Brand not found' });
    return reply.send(brand);
  });

  fastify.put('/v1/brands/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const data = BrandUpdateSchema.parse(request.body);
      const brand = await prisma.brandConfig.update({ where: { id }, data });
      return reply.send(brand);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  fastify.delete('/v1/brands/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.brandTarget.deleteMany({ where: { brandId: id } });
    await prisma.brandConfig.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // -------------------------------------------------------------------------
  // 6. Brand Persona endpoint — for future flownau consumption
  // -------------------------------------------------------------------------
  fastify.get('/v1/brands/:id/persona', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await prisma.brandConfig.findUnique({
      where: { id },
      select: { id: true, brandName: true, voicePrompt: true, userId: true },
    });
    if (!brand) return reply.status(404).send({ error: 'Brand not found' });
    return reply.send(brand);
  });

  // -------------------------------------------------------------------------
  // 7. Targets — Create / Update / Delete
  // -------------------------------------------------------------------------
  fastify.post('/v1/targets', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { brandId, usernames, profileStrategy } = TargetCreateSchema.parse(request.body);

      for (const username of usernames) {
        // Upsert Account first to satisfy FK
        await prisma.account.upsert({
          where: { username },
          create: { username },
          update: {},
        });

        // Upsert BrandTarget — preserve existing profileStrategy unless provided
        await prisma.brandTarget.upsert({
          where: { brandId_username: { brandId, username } },
          create: { brandId, username, profileStrategy: profileStrategy ?? null },
          update: profileStrategy !== undefined ? { profileStrategy } : {},
        });
      }

      return reply.send({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  fastify.put(
    '/v1/targets/:brandId/:username',
    { preHandler: authenticate },
    async (request, reply) => {
      const { brandId, username } = request.params as { brandId: string; username: string };
      try {
        const data = TargetUpdateSchema.parse(request.body);
        const target = await prisma.brandTarget.update({
          where: { brandId_username: { brandId, username } },
          data,
        });
        return reply.send(target);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  fastify.delete('/v1/targets', { preHandler: authenticate }, async (request, reply) => {
    const { brandId, username } = request.query as { brandId: string; username: string };
    if (!brandId || !username) {
      return reply.status(400).send({ error: 'Missing required query params: brandId, username' });
    }
    await prisma.brandTarget.delete({
      where: { brandId_username: { brandId, username } },
    });
    return reply.send({ success: true });
  });
};
