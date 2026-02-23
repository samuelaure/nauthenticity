import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma';

export const contentController = async (fastify: FastifyInstance) => {
  fastify.get('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const accounts = await prisma.account.findMany({
        where: {
          posts: { some: {} },
        },
        orderBy: { lastScrapedAt: 'desc' },
        include: { _count: { select: { posts: true } } },
      });
      return accounts;
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to fetch accounts' });
    }
  });

  fastify.get('/accounts/:username', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username } = request.params as { username: string };
    try {
      const account = await prisma.account.findUnique({
        where: { username },
        include: {
          posts: {
            orderBy: { postedAt: 'desc' },
            include: {
              media: true,
              transcripts: true,
            },
          },
        },
      });
      if (!account) return reply.status(404).send({ error: 'Account not found' });
      return account;
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to fetch account' });
    }
  });

  fastify.get('/posts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          media: true,
          transcripts: true,
          account: true,
        },
      });
      if (!post) return reply.status(404).send({ error: 'Post not found' });

      const newerPost = await prisma.post.findFirst({
        where: {
          username: post.username,
          postedAt: { gt: post.postedAt },
        },
        orderBy: { postedAt: 'asc' },
        select: { id: true },
      });

      const olderPost = await prisma.post.findFirst({
        where: {
          username: post.username,
          postedAt: { lt: post.postedAt },
        },
        orderBy: { postedAt: 'desc' },
        select: { id: true },
      });

      return {
        ...post,
        newerPostId: newerPost?.id,
        olderPostId: olderPost?.id,
      };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to fetch post' });
    }
  });

  fastify.put('/posts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { caption, transcriptText } = request.body as {
      caption?: string;
      transcriptText?: string;
    };

    try {
      const post = await prisma.post.findUnique({
        where: { id },
        include: { transcripts: true },
      });

      if (!post) return reply.status(404).send({ error: 'Post not found' });

      if (caption !== undefined && caption !== post.caption) {
        await prisma.post.update({
          where: { id },
          data: {
            caption,
            originalCaption: post.originalCaption ?? post.caption,
          },
        });
      }

      if (transcriptText !== undefined && post.transcripts.length > 0) {
        const transcript = post.transcripts[0];
        if (transcript.text !== transcriptText) {
          await prisma.transcript.update({
            where: { id: transcript.id },
            data: {
              text: transcriptText,
              originalText: transcript.originalText ?? transcript.text,
            },
          });
        }
      } else if (transcriptText !== undefined && post.transcripts.length === 0) {
        await prisma.transcript.create({
          data: {
            postId: id,
            text: transcriptText,
            originalText: '',
          },
        });
      }

      return { success: true };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Failed to update post' });
    }
  });
};
