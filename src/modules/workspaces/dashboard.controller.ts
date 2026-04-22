import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma';

export const dashboardController = async (fastify: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // TARGETS UI ENDPOINTS
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
};
