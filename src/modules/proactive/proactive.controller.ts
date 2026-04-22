import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { runProactiveFanout } from './fanout.processor';
import { generateReactiveComments } from './reactive.service';
import { config } from '../../config';

// ---------------------------------------------------------------------------
// Auth middleware — NAU_SERVICE_KEY (inter-service)
// ---------------------------------------------------------------------------

const authenticateService = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
  const serviceKey = request.headers['x-nau-service-key'];
  if (!serviceKey || serviceKey !== config.nauServiceKey) {
    reply.status(401).send({ error: 'Unauthorized. Invalid or missing x-nau-service-key.' });
    return;
  }
  done();
};

// ---------------------------------------------------------------------------
// Zod Schemas — intelligence-only fields (structural fields removed)
// ---------------------------------------------------------------------------

const BrandIntelligenceUpsertSchema = z.object({
  workspaceId: z.string().min(1),
  mainIgUsername: z.string().optional().nullable(),
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
});

const TargetTypeEnum = z.enum(['monitored', 'benchmark', 'single_post']);

const TargetCreateSchema = z.object({
  brandId: z.string().min(1),
  usernames: z.array(z.string().min(1)),
  targetType: TargetTypeEnum.default('monitored'),
  profileStrategy: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  initialDownloadCount: z.number().int().min(1).max(500).optional().nullable(),
  autoUpdate: z.boolean().optional().nullable(),
});

const TargetUpdateSchema = z.object({
  profileStrategy: z.string().optional().nullable(),
  targetType: TargetTypeEnum.optional(),
  isActive: z.boolean().optional(),
  initialDownloadCount: z.number().int().min(1).max(500).optional().nullable(),
  autoUpdate: z.boolean().optional().nullable(),
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
  // 1. Reactive trigger
  // -------------------------------------------------------------------------
  fastify.post(
    '/v1/generate-comment',
    { preHandler: authenticateService },
    async (request, reply) => {
      try {
        const { targetUrl, brandId } = request.body as { targetUrl?: string; brandId?: string };
        if (!targetUrl || !brandId)
          throw new Error('Missing required fields: targetUrl and brandId');

        const intelligence = await prisma.brandIntelligence.findUnique({ where: { brandId } });
        if (!intelligence) return reply.status(404).send({ error: 'Brand intelligence not found' });

        const suggestions = await generateReactiveComments(targetUrl, brandId);

        return reply.send({ success: true, suggestions });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`[Proactive] Error in generate-comment: ${msg}`);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // -------------------------------------------------------------------------
  // 2. Comment feedback
  // -------------------------------------------------------------------------
  fastify.post(
    '/v1/comment-feedback',
    { preHandler: authenticateService },
    async (request, reply) => {
      try {
        const { commentText, brandId, sourcePostId, isSelected } = FeedbackSchema.parse(
          request.body,
        );

        await prisma.commentFeedback.create({
          data: { brandId, postId: sourcePostId, commentText, isSelected },
        });

        return reply.send({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // -------------------------------------------------------------------------
  // 3. Manual fanout trigger
  // -------------------------------------------------------------------------
  fastify.post(
    '/v1/trigger-fanout',
    { preHandler: authenticateService },
    async (_request, reply) => {
      logger.info(`[Proactive] Manual fanout trigger received.`);
      runProactiveFanout().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`[FanoutProcessor] Unhandled error: ${msg}`);
      });
      return reply.send({ success: true, message: 'Fanout initiated in background.' });
    },
  );

  // -------------------------------------------------------------------------
  // 4. BrandIntelligence — upsert and fetch (structural Brand CRUD removed)
  // Brand identity (name, timezone, workspaceId, isActive) is managed by 9naŭ.
  // -------------------------------------------------------------------------

  fastify.get(
    '/v1/brands/:brandId/intelligence',
    { preHandler: authenticateService },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };
      const intelligence = await prisma.brandIntelligence.findUnique({
        where: { brandId },
        include: {
          targets: {
            select: {
              id: true,
              username: true,
              targetType: true,
              isActive: true,
              profileStrategy: true,
              initialDownloadCount: true,
              autoUpdate: true,
              createdAt: true,
            },
          },
        },
      });
      if (!intelligence) return reply.status(404).send({ error: 'Brand intelligence not found' });
      return reply.send(intelligence);
    },
  );

  fastify.put(
    '/v1/brands/:brandId/intelligence',
    { preHandler: authenticateService },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };
      try {
        const data = BrandIntelligenceUpsertSchema.parse(request.body);
        const intelligence = await prisma.brandIntelligence.upsert({
          where: { brandId },
          create: { brandId, ...data },
          update: data,
        });
        return reply.send(intelligence);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // -------------------------------------------------------------------------
  // 5. Brand DNA endpoints — intelligence-only
  // -------------------------------------------------------------------------

  // Full DNA — for ideation / composition (high-token)
  fastify.get(
    '/v1/brands/:brandId/dna',
    { preHandler: authenticateService },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };
      const intelligence = await prisma.brandIntelligence.findUnique({
        where: { brandId },
        include: {
          targets: { select: { username: true, profileStrategy: true } },
          syntheses: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!intelligence) return reply.status(404).send({ error: 'Brand intelligence not found' });

      return reply.send({
        brandId: intelligence.brandId,
        voicePrompt: intelligence.voicePrompt,
        commentStrategy: intelligence.commentStrategy,
        suggestionsCount: intelligence.suggestionsCount,
        targets: intelligence.targets,
        latestSynthesis: intelligence.syntheses[0] ?? null,
      });
    },
  );

  // Ultra-light DNA — for triage routing / comment suggestion (low-token)
  fastify.get(
    '/v1/brands/:brandId/dna-light',
    { preHandler: authenticateService },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };
      const intelligence = await prisma.brandIntelligence.findUnique({
        where: { brandId },
        select: { brandId: true, voicePrompt: true },
      });
      if (!intelligence) return reply.status(404).send({ error: 'Brand intelligence not found' });

      return reply.send({
        brandId: intelligence.brandId,
        voicePrompt: intelligence.voicePrompt.slice(0, 500),
      });
    },
  );

  // -------------------------------------------------------------------------
  // 5b. Service-to-Service structural sync and discovery
  // -------------------------------------------------------------------------

  /**
   * List all brands in a workspace with their minimal intelligence DNA.
   * Used by 9naŭ Triage for routing.
   */
  fastify.get('/v1/service/brands', { preHandler: authenticateService }, async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: 'Missing workspaceId' });

    const brands = await prisma.brandIntelligence.findMany({
      where: { workspaceId },
      select: {
        brandId: true,
        voicePrompt: true,
      },
    });

    // Map to the format 9naŭ expects: { id, brandName, voicePrompt }
    // Note: nauthenticity doesn't store brandName locally, it's owned by 9naŭ.
    // 9naŭ will map the name on its side if needed, or we just return the ID.
    return reply.send(
      brands.map((b) => ({
        id: b.brandId,
        brandName: 'Unknown', // Placeholder, 9naŭ owns the actual name
        voicePrompt: b.voicePrompt,
      })),
    );
  });

  /**
   * Sync structural changes (like workspaceId) from 9naŭ master.
   */
  fastify.patch(
    '/v1/service/brands/:brandId',
    { preHandler: authenticateService },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };
      const schema = z.object({
        workspaceId: z.string().optional(),
        mainIgUsername: z.string().optional(),
      });

      try {
        const data = schema.parse(request.body);
        const updated = await prisma.brandIntelligence.update({
          where: { brandId },
          data,
        });
        return reply.send(updated);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // -------------------------------------------------------------------------
  // 6. Targets — Create / Update / Delete
  // -------------------------------------------------------------------------
  fastify.post('/v1/targets', { preHandler: authenticateService }, async (request, reply) => {
    try {
      const {
        brandId,
        usernames,
        targetType,
        profileStrategy,
        isActive,
        initialDownloadCount,
        autoUpdate,
      } = TargetCreateSchema.parse(request.body);

      for (const username of usernames) {
        await prisma.igProfile.upsert({
          where: { username },
          create: { username },
          update: {},
        });

        await prisma.brandTarget.upsert({
          where: { brandId_username: { brandId, username } },
          create: {
            brandId,
            username,
            targetType,
            profileStrategy: profileStrategy ?? null,
            isActive,
            initialDownloadCount: initialDownloadCount ?? null,
            autoUpdate: autoUpdate ?? null,
          },
          update: {
            targetType,
            profileStrategy: profileStrategy !== undefined ? profileStrategy : undefined,
            isActive,
            initialDownloadCount:
              initialDownloadCount !== undefined ? initialDownloadCount : undefined,
            autoUpdate: autoUpdate !== undefined ? autoUpdate : undefined,
          },
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
    { preHandler: authenticateService },
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

  fastify.delete('/v1/targets', { preHandler: authenticateService }, async (request, reply) => {
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
