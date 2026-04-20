import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const SynthesisOutputSchema = z.object({
  content: z
    .string()
    .describe(
      "A rich creative synthesis/digest text that captures the brand's current creative direction, trends, and inspiration.",
    ),
  attachedUrls: z
    .array(z.string())
    .describe('Instagram URLs of the posts that most heavily influenced this synthesis.'),
  reasoning: z.string().describe('Brief reasoning explaining the creative direction chosen.'),
});

type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

export interface BrandDigest {
  content: string;
  attachedUrls: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOpenAI(): OpenAI {
  if (!config.openai.apiKey) {
    throw new Error('[SynthesisService] OPENAI_API_KEY is not configured.');
  }
  return new OpenAI({ apiKey: config.openai.apiKey });
}

async function runSynthesisLLM(
  systemPrompt: string,
  userContent: string,
): Promise<SynthesisOutput> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('[SynthesisService] OpenAI returned an empty synthesis response.');
  }

  try {
    const parsed = JSON.parse(content);
    return SynthesisOutputSchema.parse(parsed);
  } catch (err: any) {
    logger.error(`[SynthesisService] Failed to parse LLM output: ${content}`, err);
    throw new Error('[SynthesisService] LLM response was not valid JSON.');
  }
}

// ---------------------------------------------------------------------------
// Global Synthesis
// ---------------------------------------------------------------------------

async function generateGlobalSynthesis(
  brandId: string,
  brandName: string,
  brandDNA: string,
  previousGlobal: string | null,
  recentSynthesisTexts: string[],
): Promise<BrandDigest> {
  logger.info(`[SynthesisService] Generating Global Synthesis for brand ${brandName}`);

  const systemPrompt = `You are a Strategic Brand Director for "${brandName}".
Your task is to produce a **Global Synthesis** — a long-term creative strategic direction for the brand.

This synthesis will guide all future content creation. It should be:
- Rooted in the brand's DNA (voice, values, personality)
- Informed by the evolution visible in recent creative directions
- Stable, enduring, and aspirational
- Written as a rich paragraph of creative direction (200–400 words)

Return the synthesis text, the Instagram URLs of posts that most influenced this direction (if available from the recent syntheses context), and a brief reasoning.`;

  let userContent = `## BRAND DNA\n${brandDNA}\n\n`;

  if (previousGlobal) {
    userContent += `## PREVIOUS GLOBAL SYNTHESIS\n${previousGlobal}\n\n`;
  }

  if (recentSynthesisTexts.length > 0) {
    userContent += `## LAST ${recentSynthesisTexts.length} RECENT SYNTHESES\n`;
    recentSynthesisTexts.forEach((text, i) => {
      userContent += `### Recent ${i + 1}\n${text}\n\n`;
    });
  }

  userContent += `Synthesize the above into a new, evolved Global creative direction for "${brandName}".`;

  const result = await runSynthesisLLM(systemPrompt, userContent);
  return { content: result.content, attachedUrls: result.attachedUrls };
}

// ---------------------------------------------------------------------------
// Recent Synthesis
// ---------------------------------------------------------------------------

interface NewPost {
  instagramUrl: string | null;
  caption: string | null;
}

async function generateRecentSynthesis(
  brandId: string,
  brandName: string,
  brandDNA: string,
  globalSynthesis: string | null,
  previousRecent: string | null,
  previousRecentTexts: string[],
  newPosts: NewPost[],
): Promise<BrandDigest> {
  logger.info(`[SynthesisService] Generating Recent Synthesis for brand ${brandName}`);

  const systemPrompt = `You are a Trend Analyst and Creative Strategist for "${brandName}".
Your task is to produce a **Recent Synthesis** — a fresh, current creative digest that reflects the latest creative energy and inspiration.

This synthesis should be:
- Grounded in the brand's DNA but tuned to recent trends and new inspiration posts
- Specific, fresh, and actionable — guiding the next batch of content ideas
- Written as a rich paragraph (150–300 words) with concrete creative direction
- If no new posts are provided, iterate and evolve from the previous Recent Syntheses

Identify which specific post URLs most influenced this direction and include them in attachedUrls.`;

  let userContent = `## BRAND DNA\n${brandDNA}\n\n`;

  if (globalSynthesis) {
    userContent += `## GLOBAL CREATIVE DIRECTION\n${globalSynthesis}\n\n`;
  }

  if (previousRecent) {
    userContent += `## PREVIOUS RECENT SYNTHESIS\n${previousRecent}\n\n`;
  }

  if (previousRecentTexts.length > 1) {
    userContent += `## EARLIER RECENT SYNTHESES (context)\n`;
    previousRecentTexts.slice(1).forEach((text, i) => {
      userContent += `### Earlier ${i + 2}\n${text}\n\n`;
    });
  }

  if (newPosts.length > 0) {
    userContent += `## NEW INSPIRATION POSTS (${newPosts.length} items)\n`;
    newPosts.forEach((post, i) => {
      userContent += `### Post ${i + 1}\n`;
      if (post.instagramUrl) userContent += `URL: ${post.instagramUrl}\n`;
      if (post.caption) userContent += `Caption: ${post.caption.slice(0, 300)}\n`;
      userContent += '\n';
    });
  } else {
    userContent += `## NOTE\nNo new inspiration posts since the last synthesis. Evolve the direction from previous syntheses.\n\n`;
  }

  userContent += `Generate a fresh Recent Synthesis for "${brandName}" that reflects current creative momentum.`;

  const result = await runSynthesisLLM(systemPrompt, userContent);
  return { content: result.content, attachedUrls: result.attachedUrls };
}

// ---------------------------------------------------------------------------
// Main: getDigest
// ---------------------------------------------------------------------------

/**
 * Increments the brand's inspoRequestCount and returns a BrandDigest.
 *
 * Cadence:
 * - Requests 1 & 2 (of every 3): return latest cached Recent Synthesis
 * - Request 3 (every 3rd): generate new Recent Synthesis
 *   - Every 4th recent generation (request 12, 24, ...): Global Synthesis first
 */
export async function getDigest(brandId: string): Promise<BrandDigest> {
  // Atomically increment and read count
  const brand = await prisma.brandIntelligence.update({
    where: { brandId },
    data: { inspoRequestCount: { increment: 1 } },
    select: {
      brandId: true,
      voicePrompt: true,
      inspoRequestCount: true,
    },
  });

  const count = brand.inspoRequestCount;
  const shouldGenerate = count % 3 === 0;

  logger.info(
    `[SynthesisService] Digest request #${count} for brand "${brand.brandId}" — shouldGenerate: ${shouldGenerate}`,
  );

  if (!shouldGenerate) {
    // Return cached recent synthesis if available
    const cached = await (prisma as any).brandSynthesis.findFirst({
      where: { brandId, type: 'recent' },
      orderBy: { createdAt: 'desc' },
    });

    if (cached) {
      logger.info(
        `[SynthesisService] Returning cached Recent Synthesis for brand "${brand.brandId}"`,
      );
      return {
        content: cached.content,
        attachedUrls: cached.attachedUrls as string[],
      };
    }
    // No cache yet — fall through to generate on first request
    logger.info(`[SynthesisService] No cached synthesis found — generating on first request`);
  }

  // ── Fetch context for generation ──────────────────────────────────────────

  const [recentSyntheses, globalSynthesis, newInspoItems] = await Promise.all([
    (prisma as any).brandSynthesis.findMany({
      where: { brandId, type: 'recent' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
    (prisma as any).brandSynthesis.findFirst({
      where: { brandId, type: 'global' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.inspoItem.findMany({
      where: { brandId, status: 'pending' },
      include: {
        post: { select: { instagramUrl: true, caption: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const recentTexts = recentSyntheses.map((s: any) => s.content);
  let currentGlobalContent: string | null = globalSynthesis?.content ?? null;

  // ── Global Synthesis (every 4th recent update: request 12, 24, 36...) ────

  const recentUpdateIndex = count / 3; // only reached when shouldGenerate is true
  if (recentUpdateIndex % 4 === 0) {
    logger.info(
      `[SynthesisService] Request #${count} is the ${recentUpdateIndex}th recent update — triggering Global Synthesis`,
    );

    const globalResult = await generateGlobalSynthesis(
      brandId,
      brand.brandId,
      brand.voicePrompt,
      globalSynthesis?.content ?? null,
      recentTexts,
    );

    await (prisma as any).brandSynthesis.create({
      data: {
        brandId,
        type: 'global',
        content: globalResult.content,
        attachedUrls: globalResult.attachedUrls,
      },
    });

    currentGlobalContent = globalResult.content;
    logger.info(`[SynthesisService] Global Synthesis created for brand "${brand.brandId}"`);
  }

  // ── Recent Synthesis ──────────────────────────────────────────────────────

  const newPostsForContext: NewPost[] = newInspoItems.map((item: any) => ({
    instagramUrl: item.post?.instagramUrl ?? null,
    caption: item.post?.caption ?? null,
  }));

  const recentResult = await generateRecentSynthesis(
    brandId,
    brand.brandId,
    brand.voicePrompt,
    currentGlobalContent,
    recentSyntheses[0]?.content ?? null,
    recentTexts,
    newPostsForContext,
  );

  const synthesis = await (prisma as any).brandSynthesis.create({
    data: {
      brandId,
      type: 'recent',
      content: recentResult.content,
      attachedUrls: recentResult.attachedUrls,
    },
  });

  logger.info(`[SynthesisService] Recent Synthesis created for brand "${brand.brandId}"`);

  return {
    content: synthesis.content,
    attachedUrls: synthesis.attachedUrls as string[],
  };
}
