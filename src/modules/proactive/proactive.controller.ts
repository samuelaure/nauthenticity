import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { runProactiveFanout } from './fanout.processor';
import { generateReactiveComments } from './reactive.service';
import { config } from '../../config';
import { verifyJwt } from '../../utils/jwt';

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
// Auth middleware — JWT (user-facing)
// ---------------------------------------------------------------------------

const authenticateJwt = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing JWT token' });
  }
  const token = authHeader.slice(7);
  const payload = verifyJwt(token);
  if (!payload) {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
  (request as FastifyRequest & { jwtPayload: unknown }).jwtPayload = payload;
};

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const BrandCreateSchema = z.object({
  brandName: z.string().min(1),
  voicePrompt: z.string().min(1),
  workspaceId: z.string().min(1),
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
});

const BrandUpdateSchema = BrandCreateSchema.partial().omit({ workspaceId: true });

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
  // 1. Reactive trigger
  // -------------------------------------------------------------------------
  fastify.post('/v1/generate-comment', { preHandler: authenticateService }, async (request, reply) => {
    try {
      const { targetUrl, brandId } = request.body as { targetUrl?: string; brandId?: string };
      if (!targetUrl || !brandId) throw new Error('Missing required fields: targetUrl and brandId');

      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return reply.status(404).send({ error: 'Brand not found' });

      const suggestions = await generateReactiveComments(targetUrl, brandId);

      return reply.send({ success: true, suggestions });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[Proactive] Error in generate-comment: ${msg}`);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 2. Comment feedback
  // -------------------------------------------------------------------------
  fastify.post('/v1/comment-feedback', { preHandler: authenticateService }, async (request, reply) => {
    try {
      const { commentText, brandId, sourcePostId, isSelected } = FeedbackSchema.parse(request.body);

      await prisma.commentFeedback.create({
        data: { brandId, postId: sourcePostId, commentText, isSelected },
      });

      return reply.send({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Manual fanout trigger
  // -------------------------------------------------------------------------
  fastify.post('/v1/trigger-fanout', { preHandler: authenticateService }, async (_request, reply) => {
    logger.info(`[Proactive] Manual fanout trigger received.`);
    runProactiveFanout().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[FanoutProcessor] Unhandled error: ${msg}`);
    });
    return reply.send({ success: true, message: 'Fanout initiated in background.' });
  });

  // -------------------------------------------------------------------------
  // 4. Brand — List & Create (JWT auth — user-facing)
  // -------------------------------------------------------------------------
  fastify.get('/v1/brands', { preHandler: authenticateJwt }, async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: 'Missing required query param: workspaceId' });

    const brands = await prisma.brand.findMany({
      where: { workspaceId, isDeleted: false },
      include: { targets: { select: { username: true, profileStrategy: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return reply.send(brands);
  });

  // Service-to-service: list all brands for a workspace (used by 9naŭ triage for AI routing)
  fastify.get('/v1/service/brands', { preHandler: authenticateService }, async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: 'Missing required query param: workspaceId' });

    const brands = await prisma.brand.findMany({
      where: { workspaceId, isDeleted: false },
      select: { id: true, brandName: true, voicePrompt: true },
      orderBy: { createdAt: 'asc' },
    });
    // Return ultra-light payload — trim voicePrompt to keep token cost low
    return reply.send(brands.map(b => ({
      id: b.id,
      brandName: b.brandName,
      voicePrompt: b.voicePrompt.slice(0, 500),
    })));
  });

  fastify.post('/v1/brands', { preHandler: authenticateJwt }, async (request, reply) => {
    try {
      const data = BrandCreateSchema.parse(request.body);
      const brand = await prisma.brand.create({ data });
      return reply.status(201).send(brand);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 5. Brand — Get single, Update, Soft-delete, Restore
  // -------------------------------------------------------------------------
  fastify.get('/v1/brands/:id', { preHandler: authenticateJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: { targets: { select: { username: true, profileStrategy: true } } },
    });
    if (!brand || brand.isDeleted) return reply.status(404).send({ error: 'Brand not found' });
    return reply.send(brand);
  });

  fastify.put('/v1/brands/:id', { preHandler: authenticateJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const data = BrandUpdateSchema.parse(request.body);
      const brand = await prisma.brand.update({ where: { id }, data });
      return reply.send(brand);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(400).send({ error: msg });
    }
  });

  // Soft delete
  fastify.delete('/v1/brands/:id', { preHandler: authenticateJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.brand.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
    return reply.send({ success: true });
  });

  // Restore soft-deleted brand
  fastify.post('/v1/brands/:id/restore', { preHandler: authenticateJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.brand.update({
      where: { id },
      data: { isDeleted: false, deletedAt: null, isActive: true },
    });
    return reply.send({ success: true });
  });

  // Hard delete (permanent, cascading)
  fastify.delete('/v1/brands/:id/permanent', { preHandler: authenticateService }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.brand.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // -------------------------------------------------------------------------
  // 6. Brand DNA endpoints
  // -------------------------------------------------------------------------

  // Full DNA — for ideation / composition (high-token)
  fastify.get('/v1/brands/:id/dna', { preHandler: authenticateService }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        targets: { select: { username: true, profileStrategy: true } },
        syntheses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!brand || brand.isDeleted) return reply.status(404).send({ error: 'Brand not found' });

    return reply.send({
      id: brand.id,
      brandName: brand.brandName,
      voicePrompt: brand.voicePrompt,
      commentStrategy: brand.commentStrategy,
      suggestionsCount: brand.suggestionsCount,
      targets: brand.targets,
      latestSynthesis: brand.syntheses[0] ?? null,
    });
  });

  // Ultra-light DNA — for triage routing / comment suggestion (low-token)
  fastify.get('/v1/brands/:id/dna-light', { preHandler: authenticateService }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, brandName: true, voicePrompt: true, workspaceId: true, isDeleted: true },
    });
    if (!brand || brand.isDeleted) return reply.status(404).send({ error: 'Brand not found' });

    return reply.send({
      id: brand.id,
      brandName: brand.brandName,
      voicePrompt: brand.voicePrompt.slice(0, 500),
      workspaceId: brand.workspaceId,
    });
  });

  // -------------------------------------------------------------------------
  // 7. Brand Persona (service-to-service)
  // -------------------------------------------------------------------------
  fastify.get('/v1/brands/:id/persona', { preHandler: authenticateService }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, brandName: true, voicePrompt: true, workspaceId: true },
    });
    if (!brand) return reply.status(404).send({ error: 'Brand not found' });
    return reply.send(brand);
  });

  // -------------------------------------------------------------------------
  // 8. Targets — Create / Update / Delete
  // -------------------------------------------------------------------------
  fastify.post('/v1/targets', { preHandler: authenticateService }, async (request, reply) => {
    try {
      const { brandId, usernames, profileStrategy } = TargetCreateSchema.parse(request.body);

      for (const username of usernames) {
        await prisma.igProfile.upsert({
          where: { username },
          create: { username },
          update: {},
        });

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
