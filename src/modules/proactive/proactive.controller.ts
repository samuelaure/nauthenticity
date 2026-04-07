import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { generateProactiveComments } from '../../services/intelligence.service';
import { logger } from '../../utils/logger';
import { runProactiveFanout } from './fanout.processor';
import { config } from '../../config';

// Add NAU_SERVICE_KEY validation to constitution compliant level
const authenticate = (request: any, reply: any, done: Function) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${config.nauServiceKey}`) {
    reply.status(401).send({ error: 'Unauthorized. Invalid or missing NAU_SERVICE_KEY.' });
    return;
  }
  done();
};

const FeedbackSchema = z.object({
  commentText: z.string(),
  brandId: z.string(),
  sourcePostId: z.string(),
});

export const proactiveController: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Reactive Trigger (For 9nau future use) - Mocked for now because specific post scraping takes time
  fastify.post('/v1/generate-comment', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { targetUrl, brandId } = request.body as any;
      if (!targetUrl || !brandId) throw new Error('Missing required fields');

      const brand = await prisma.brandConfig.findUnique({ where: { id: brandId } });
      if (!brand) return reply.status(404).send({ error: 'Brand config not found' });

      // Note: Ideally we run a sync single-post-scrape here, but for now we enforce the fanout
      return reply.send({
        success: true,
        message: 'Reactive endpoint active. Integration pending.',
      });
    } catch (e: any) {
      logger.error(`Error in generate-comment: ${e.message}`);
      return reply.status(400).send({ error: e.message });
    }
  });

  // 2. Feedback Telemetry from Zazŭ
  fastify.post('/v1/comment-feedback', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { commentText, brandId, sourcePostId } = FeedbackSchema.parse(request.body);

      await prisma.commentFeedback.create({
        data: {
          brandId,
          postId: sourcePostId,
          commentText,
          isEdited: false,
        },
      });
      logger.info(`[Proactive] Telemetry saved for brand ${brandId} on post ${sourcePostId}`);
      return reply.send({ success: true });
    } catch (e: any) {
      logger.error(`Telemetry error: ${e.message}`);
      return reply.status(400).send({ error: e.message });
    }
  });

  // 3. Manual Webhook to trigger the background scraping job (Since no cron module exists, we use a webhook trigger that cron-services like GitHub Actions or cron-job.org can hit)
  fastify.post('/v1/trigger-fanout', { preHandler: authenticate }, async (request, reply) => {
    logger.info(`[Proactive] Manual fanout trigger received.`);

    // Fire and forget so we don't block the request awaiting Apify
    runProactiveFanout().catch((e) =>
      logger.error(`[FanoutProcessor] Unhandled error: ${e.message}`),
    );

    return reply.send({ success: true, message: 'Fanout initiated in background' });
  });
};
