import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getDigest } from './synthesis.service';

// ---------------------------------------------------------------------------
// Auth middleware — NAU_SERVICE_KEY
// ---------------------------------------------------------------------------
const authenticate = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
  const serviceKey = request.headers['x-nau-service-key'];
  if (!serviceKey || serviceKey !== config.nauServiceKey) {
    reply.status(401).send({ error: 'Unauthorized. Invalid or missing x-nau-service-key.' });
    return;
  }
  done();
};

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------
const InspoCreateSchema = z.object({
  brandId: z.string().min(1),
  postUrl: z.string().url().optional(),
  postId: z.string().optional(),
  note: z.string().optional(),
  type: z.enum(['inspo', 'replicate']),
});

const InspoProcessSchema = z.object({
  extractedHook: z.string().optional(),
  extractedTheme: z.string().optional(),
  adaptedScript: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const inspoController: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // 1. Create InspoItem
  // -------------------------------------------------------------------------
  fastify.post('/v1/inspo', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { brandId, postUrl, postId, note, type } = InspoCreateSchema.parse(request.body);

      // Verify brand exists
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) return reply.status(404).send({ error: 'Brand not found' });

      // Resolve post reference
      let resolvedPostId: string | null = postId ?? null;

      if (!resolvedPostId && postUrl) {
        // Try to find existing post by URL
        const existingPost = await prisma.post.findUnique({ where: { instagramUrl: postUrl } });
        if (existingPost) {
          resolvedPostId = existingPost.id;
        }
        // If post doesn't exist yet, we save without link — it can be scraped later
      }

      const inspoItem = await prisma.inspoItem.create({
        data: {
          brandId,
          postId: resolvedPostId,
          type,
          note: note ?? null,
          status: 'pending',
        },
      });

      logger.info(
        `[InspoBase] Created ${type} item for brand ${brand.brandName} (ID: ${inspoItem.id})`,
      );
      return reply.status(201).send(inspoItem);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[InspoBase] Error creating inspo item: ${msg}`);
      return reply.status(400).send({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // 2. List InspoItems (filterable)
  // -------------------------------------------------------------------------
  fastify.get('/v1/inspo', { preHandler: authenticate }, async (request, reply) => {
    const { brandId, type, status } = request.query as {
      brandId?: string;
      type?: string;
      status?: string;
    };

    const where: Record<string, unknown> = {};
    if (brandId) where.brandId = brandId;
    if (type) where.type = type;
    if (status) where.status = status;

    const items = await prisma.inspoItem.findMany({
      where,
      include: {
        brand: { select: { brandName: true } },
        post: { select: { instagramUrl: true, caption: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send(items);
  });

  // -------------------------------------------------------------------------
  // 3. Get single InspoItem
  // -------------------------------------------------------------------------
  fastify.get('/v1/inspo/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.inspoItem.findUnique({
      where: { id },
      include: {
        brand: { select: { brandName: true, voicePrompt: true } },
        post: {
          include: {
            media: true,
            transcripts: { select: { text: true } },
          },
        },
      },
    });

    if (!item) return reply.status(404).send({ error: 'InspoItem not found' });
    return reply.send(item);
  });

  // -------------------------------------------------------------------------
  // 4. Process InspoItem (AI extraction)
  // -------------------------------------------------------------------------
  fastify.post('/v1/inspo/:id/process', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await prisma.inspoItem.findUnique({
      where: { id },
      include: {
        brand: { select: { brandName: true, voicePrompt: true } },
        post: {
          include: {
            transcripts: { select: { text: true } },
          },
        },
      },
    });

    if (!item) return reply.status(404).send({ error: 'InspoItem not found' });

    // If manual data is provided, use it directly
    const manualData = request.body as Record<string, unknown> | undefined;
    if (manualData) {
      try {
        const parsed = InspoProcessSchema.parse(manualData);
        const updated = await prisma.inspoItem.update({
          where: { id },
          data: {
            ...parsed,
            status: 'processed',
          },
        });
        return reply.send(updated);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: msg });
      }
    }

    // Otherwise mark as processed (AI processing deferred to ideation engine in flownau)
    const updated = await prisma.inspoItem.update({
      where: { id },
      data: { status: 'processed' },
    });

    logger.info(`[InspoBase] Processed item ${id}`);
    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // 5. Digest — Mechanical InspoBase Synthesis (Phase 11)
  // -------------------------------------------------------------------------
  fastify.get('/v1/inspo/digest', { preHandler: authenticate }, async (request, reply) => {
    const { brandId } = request.query as { brandId?: string };

    if (!brandId) {
      return reply.status(400).send({ error: 'Missing required query parameter: brandId' });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return reply.status(404).send({ error: 'Brand not found' });

    try {
      const digest = await getDigest(brandId);
      return reply.send(digest);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[InspoDigest] Error generating digest for brand ${brandId}: ${msg}`);
      return reply.status(500).send({ error: `Digest generation failed: ${msg}` });
    }
  });

  // -------------------------------------------------------------------------
  // 6. Repost — Forward to flownaŭ
  // -------------------------------------------------------------------------
  fastify.post('/v1/repost', { preHandler: authenticate }, async (request, reply) => {
    const { brandId, postUrl } = request.body as { brandId?: string; postUrl?: string };
    if (!brandId || !postUrl) {
      return reply.status(400).send({ error: 'Missing required fields: brandId, postUrl' });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return reply.status(404).send({ error: 'Brand not found' });

    // Find the post
    const post = await prisma.post.findUnique({
      where: { instagramUrl: postUrl },
      include: { media: true },
    });

    if (!post) {
      return reply.status(404).send({ error: 'Post not found in database. Scrape it first.' });
    }

    // Forward to flownaŭ content ingest (placeholder — flownau endpoint TBD)
    const flownauUrl = process.env.FLOWNAU_URL || 'http://flownau:3000';

    try {
      const response = await fetch(`${flownauUrl}/api/v1/content/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nau-service-key': config.nauServiceKey,
        },
        body: JSON.stringify({
          brandId,
          brandName: brand.brandName,
          postUrl,
          media: post.media,
          caption: post.caption,
          type: 'repost',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[InspoBase] Repost forward to flownau failed: ${errText}`);
        return reply.status(502).send({ error: 'Failed to forward to flownaŭ', details: errText });
      }

      logger.info(`[InspoBase] Repost forwarded to flownaŭ for brand ${brand.brandName}`);
      return reply.send({ success: true, message: 'Repost forwarded to flownaŭ' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[InspoBase] Repost error: ${msg}`);
      return reply.status(502).send({ error: `flownaŭ unavailable: ${msg}` });
    }
  });
};
