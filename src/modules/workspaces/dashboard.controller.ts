import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma';

export const dashboardController = async (fastify: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // TARGETS UI ENDPOINTS (Phase 4)
  // -------------------------------------------------------------------------
  fastify.get('/targets', async (request: FastifyRequest, reply: FastifyReply) => {
    const { brandId, targetType } = request.query as { brandId?: string; targetType?: string };
    if (!brandId) return reply.status(400).send({ error: 'Missing brandId' });

    const targets = await prisma.brandTarget.findMany({
      where: { brandId, targetType: targetType || undefined },
      include: {
        igProfile: { include: { _count: { select: { posts: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(targets);
  });

  fastify.post('/targets', async (request: FastifyRequest, reply: FastifyReply) => {
    const { brandId, username, targetType, isActive, initialDownloadCount, autoUpdate } =
      request.body as any;
    if (!brandId || !username) return reply.status(400).send({ error: 'Missing required fields' });

    await prisma.igProfile.upsert({
      where: { username },
      create: { username },
      update: {},
    });

    const target = await prisma.brandTarget.upsert({
      where: { brandId_username: { brandId, username } },
      create: {
        brandId,
        username,
        targetType,
        isActive: isActive ?? true,
        initialDownloadCount,
        autoUpdate,
      },
      update: { targetType, isActive: isActive ?? true, initialDownloadCount, autoUpdate },
    });
    return reply.send(target);
  });

  fastify.patch('/targets/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { isActive, autoUpdate, initialDownloadCount } = request.body as any;

    const dataToUpdate: any = {};
    if (isActive !== undefined) dataToUpdate.isActive = isActive;
    if (autoUpdate !== undefined) dataToUpdate.autoUpdate = autoUpdate;
    if (initialDownloadCount !== undefined)
      dataToUpdate.initialDownloadCount = initialDownloadCount;

    const updated = await prisma.brandTarget.update({
      where: { id },
      data: dataToUpdate,
    });
    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // REACTIVE COMMENTS UI ENDPOINTS
  // -------------------------------------------------------------------------
  fastify.post('/generate-comment', async (request: FastifyRequest, reply: FastifyReply) => {
    const { targetUrl, brandId } = request.body as { targetUrl?: string; brandId?: string };
    if (!targetUrl || !brandId)
      return reply.status(400).send({ error: 'Missing targetUrl, brandId' });

    try {
      // Lazy import to avoid circular dependencies if any
      const { generateReactiveComments } = await import('../proactive/reactive.service');
      const suggestions = await generateReactiveComments(targetUrl, brandId);
      return reply.send({ success: true, suggestions });
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });
};
