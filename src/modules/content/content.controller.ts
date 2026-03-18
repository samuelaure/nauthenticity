import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { downloadQueue } from '../../queues/download.queue';
import { computeQueue } from '../../queues/compute.queue';
import { ingestionQueue } from '../../queues/ingestion.queue';

export const contentController = async (fastify: FastifyInstance) => {
  fastify.get('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };
      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [accounts, total] = await Promise.all([
        prisma.account.findMany({
          where: {
            posts: { some: {} },
          },
          orderBy: { lastScrapedAt: 'desc' },
          include: { _count: { select: { posts: true } } },
          skip,
          take,
        }),
        prisma.account.count({ where: { posts: { some: {} } } }),
      ]);

      return {
        accounts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / take),
        },
      };
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

  fastify.get(
    '/accounts/:username/export/txt',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username } = request.params as { username: string };
      try {
        const account = await prisma.account.findUnique({
          where: { username },
          include: {
            posts: {
              orderBy: { postedAt: 'desc' },
              include: {
                transcripts: true,
              },
            },
          },
        });

        if (!account) return reply.status(404).send({ error: 'Account not found' });

        let output = `DATA EXPORT FOR: ${account.username}\n`;
        output += `Generated on: ${new Date().toISOString()}\n`;
        output += `Total Posts: ${account.posts.length}\n`;
        output += `==================================================\n\n`;

        for (const post of account.posts) {
          output += `Post ID: ${post.id}\n`;
          output += `URL: ${post.instagramUrl}\n`;
          output += `Posted At: ${post.postedAt.toISOString()}\n`;
          output += `Caption:\n${post.caption || '(No caption)'}\n\n`;

          const transcript = post.transcripts[0];
          if (transcript) {
            output += `Transcription:\n${transcript.text}\n`;
          } else {
            output += `Transcription: N/A\n`;
          }

          output += `\n--------------------------------------------------\n\n`;
        }

        reply
          .header('Content-Type', 'text/plain; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${username}_export.txt"`)
          .send(output);
      } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: 'Failed to generate export' });
      }
    },
  );

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

  // --- Progress Reporting ---
  fastify.get(
    '/accounts/:username/progress',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username } = request.params as { username: string };
      try {
        // Aggregate totals in one query set
        const [totalPosts, totalMedia, localMedia, totalTranscripts, activeRun] = await Promise.all(
          [
            prisma.post.count({ where: { username } }),
            prisma.media.count({ where: { post: { username } } }),
            prisma.media.count({
              where: { post: { username }, storageUrl: { startsWith: '/content/' } },
            }),
            prisma.transcript.count({ where: { post: { username } } }),
            prisma.scrapingRun.findFirst({
              where: { username, status: 'pending' },
              orderBy: { createdAt: 'desc' },
            }),
          ],
        );

        const ongoingRun =
          activeRun ||
          (await prisma.scrapingRun.findFirst({
            where: { username },
            orderBy: { createdAt: 'desc' },
          }));

        // Per-post breakdown (latest 200 posts, ordered newest first)
        const posts = await prisma.post.findMany({
          where: { username },
          orderBy: { postedAt: 'desc' },
          take: 200,
          select: {
            id: true,
            instagramId: true,
            postedAt: true,
            caption: true,
            media: {
              select: {
                id: true,
                type: true,
                storageUrl: true,
              },
            },
            transcripts: {
              select: { id: true, text: true },
              take: 1,
            },
          },
        });

        const videoPosts = posts.filter((p: any) => p.media.some((m: any) => m.type === 'video'));
        const videoPostsWithTranscript = videoPosts.filter((p: any) => p.transcripts.length > 0);

        // Fetch active jobs from queues to see what's currently happening
        const [activeIngestion, activeDownloads, activeCompute] = await Promise.all([
          ingestionQueue.getJobs(['active']),
          downloadQueue.getJobs(['active']),
          computeQueue.getJobs(['active']),
        ]);

        const activeJobs = [
          ...activeIngestion.filter((j: any) => j.data.username === username),
          ...activeDownloads.filter((j: any) => j.data.username === username),
          ...activeCompute.filter((j: any) => j.data.username === username),
        ].map((j: any) => ({
          id: j.id,
          name: j.name,
          progress: j.progress,
          data: j.data,
          timestamp: j.timestamp,
        }));

        return {
          summary: {
            totalPosts,
            totalMedia,
            localMedia,
            pendingDownloads: totalMedia - localMedia,
            downloadPct: totalMedia > 0 ? Math.round((localMedia / totalMedia) * 100) : 0,
            videoPostsTotal: videoPosts.length,
            transcribedPosts: videoPostsWithTranscript.length,
            transcriptPct:
              videoPosts.length > 0
                ? Math.round((videoPostsWithTranscript.length / videoPosts.length) * 100)
                : 0,
            totalTranscripts,
            phase:
              ongoingRun?.status === 'completed' && ongoingRun?.phase === 'finished'
                ? 'idle'
                : ongoingRun?.phase || 'idle',
            status: ongoingRun?.status || 'idle',
          },
          activeJobs,
          posts: posts.map((p: any) => ({
            id: p.id,
            instagramId: p.instagramId,
            postedAt: p.postedAt,
            caption: p.caption?.slice(0, 80),
            mediaCount: p.media.length,
            downloaded: p.media.every((m: any) => m.storageUrl.startsWith('/content/')),
            hasVideo: p.media.some((m: any) => m.type === 'video'),
            transcribed: p.transcripts.length > 0,
            transcriptPreview: p.transcripts[0]?.text?.slice(0, 80) ?? null,
          })),
        };
      } catch (e) {
        request.log.error(e);
        return reply.status(500).send({ error: 'Failed to fetch progress' });
      }
    },
  );

  fastify.post('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, username, limit = 10 } = request.body as {
      query: string;
      username?: string;
      limit?: number;
    };

    if (!query) {
      return reply.status(400).send({ error: 'Query is required' });
    }

    try {
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: config.openai.apiKey });

      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query.replace(/\n/g, ' '),
        encoding_format: 'float',
      });
      const queryVector = embeddingResponse.data[0].embedding;

      // Use raw SQL with PGVector
      let rawResults: any[];
      if (username) {
        rawResults = await prisma.$queryRaw`
          SELECT 
            p.id, 
            p.username, 
            p.caption, 
            p."postedAt",
            t.text as "transcriptText",
            1 - (e.vector <=> ${queryVector}::vector) as similarity
          FROM "Embedding" e
          JOIN "Transcript" t ON e."transcriptId" = t.id
          JOIN "Post" p ON t."postId" = p.id
          WHERE p.username = ${username}
          ORDER BY similarity DESC
          LIMIT ${Number(limit)};
        `;
      } else {
        rawResults = await prisma.$queryRaw`
          SELECT 
            p.id, 
            p.username, 
            p.caption, 
            p."postedAt",
            t.text as "transcriptText",
            1 - (e.vector <=> ${queryVector}::vector) as similarity
          FROM "Embedding" e
          JOIN "Transcript" t ON e."transcriptId" = t.id
          JOIN "Post" p ON t."postId" = p.id
          ORDER BY similarity DESC
          LIMIT ${Number(limit)};
        `;
      }

      return { results: rawResults };
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Search failed' });
    }
  });
};
