import { OpenAI } from 'openai';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ---------------------------------------------------------------------------
// Platform-level fallbacks — used when a brand has no configured voice/strategy
// ---------------------------------------------------------------------------

export const PLATFORM_DEFAULT_VOICE = `You are an authentic, engaging brand on Instagram. Write comments that are genuine, add value to the conversation, and reflect a professional yet approachable personality. Be concise, positive, and relevant to the post's content. Show real interest in the creator's work.`;

export const PLATFORM_DEFAULT_STRATEGY = `General growth strategy: engage meaningfully with content in your niche. Leave thoughtful comments that showcase expertise, spark curiosity, and build community — without being promotional.`;

// ---------------------------------------------------------------------------
// Post Intelligence Extraction (unchanged)
// ---------------------------------------------------------------------------

const IntelligenceSchema = z.object({
  hook: z.string().describe('The primary attention-grabbing opening of the content.'),
  pillars: z.array(z.string()).describe('The core themes or content pillars this post belongs to.'),
  cta: z.string().describe('The call to action provided in the content.'),
  sentiment: z
    .enum(['educational', 'promotional', 'entertaining', 'personal'])
    .describe('The primary tone of the post.'),
  summary: z.string().describe('A concise 1nd or 2nd person summary of the strategy used.'),
});

export type PostIntelligence = z.infer<typeof IntelligenceSchema>;

export const extractPostIntelligence = async (
  caption: string,
  transcript: string = '',
): Promise<PostIntelligence> => {
  logger.info('[IntelligenceService] Extracting intelligence...');

  const combinedContent = `
    CAPTION:
    ${caption}

    TRANSCRIPT:
    ${transcript}
  `.trim();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content: `You are a world-class social media strategist. Analyze the provided Instagram content (caption and/or transcript) to extract its strategic components. You MUST return your answer as a JSON object matching this schema: 
        { "hook": string, "pillars": string[], "cta": string, "sentiment": "educational"|"promotional"|"entertaining"|"personal", "summary": string }.`,
      },
      { role: 'user', content: combinedContent },
    ],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from OpenAI.');
  }

  const rawJson = JSON.parse(content);
  return IntelligenceSchema.parse(rawJson);
};

// ---------------------------------------------------------------------------
// Comment Suggestion Generation — 5-Level Prompt Architecture
// ---------------------------------------------------------------------------

export interface CommentSuggestionParams {
  post: {
    caption: string;
    transcriptText?: string;
    instagramUrl: string;
    targetUsername: string;
  };
  brand: {
    voicePrompt: string;
    commentStrategy: string | null;
    suggestionsCount: number;
  };
  profileStrategy: string | null;
  /** Last N selected comments for this brand (for context / avoiding repetition) */
  lastSelectedComments: string[];
}

/**
 * Builds the multi-level system prompt for comment generation.
 * Level 0: Base structure + language instruction
 * Level 1: Brand voice / DNA
 * Level 2: Brand comment strategy (optional)
 * Level 3: Profile-specific strategy (optional)
 * Level 4: Last selected comments for context (optional)
 */
function buildCommentSystemPrompt(params: CommentSuggestionParams): string {
  const { brand, profileStrategy, lastSelectedComments, post } = params;

  const sections: string[] = [];

  // Level 0 — Base structure
  sections.push(
    `Generate exactly ${brand.suggestionsCount} comment suggestion(s) for the Instagram post below.` +
      ` The comments MUST be written in the same language as the post — detect it from the caption and/or transcript.` +
      ` Follow all brand parameters defined below strictly.` +
      ` Return your answer as a JSON object: { "comments": ["string1", "string2", ...] }.`,
  );

  // Level 1 — Brand Voice / DNA (fall back to platform default when empty)
  const effectiveVoice = brand.voicePrompt?.trim() || PLATFORM_DEFAULT_VOICE;
  sections.push(`\n## BRAND VOICE & PERSONALITY\n${effectiveVoice}`);

  // Level 2 — Brand Comment Strategy (fall back to platform default when absent)
  const effectiveStrategy = brand.commentStrategy?.trim() || PLATFORM_DEFAULT_STRATEGY;
  if (effectiveStrategy) {
    sections.push(`\n## BRAND COMMENT STRATEGY (current period)\n${effectiveStrategy}`);
  }

  // Level 3 — Profile-Specific Strategy (conditional)
  if (profileStrategy?.trim()) {
    sections.push(`\n## SPECIFIC STRATEGY FOR @${post.targetUsername}\n${profileStrategy.trim()}`);
  }

  // Level 4 — Last selected comments for context (conditional)
  if (lastSelectedComments.length > 0) {
    const numbered = lastSelectedComments.map((c, i) => `${i + 1}. ${c}`).join('\n');
    sections.push(
      `\n## RECENT COMMENTS SENT BY THIS BRAND\n` +
        `(Use these for consistency and to avoid exact repetition — especially important when the strategy includes recurring messages like collaboration proposals.)\n` +
        numbered,
    );
  }

  return sections.join('\n');
}

function buildPostUserMessage(post: CommentSuggestionParams['post']): string {
  const lines: string[] = [`POST TO COMMENT ON:`, `URL: ${post.instagramUrl}`];

  if (post.caption?.trim()) {
    lines.push(`\nCaption:\n${post.caption.trim()}`);
  }

  if (post.transcriptText?.trim()) {
    lines.push(`\nVideo Transcript:\n${post.transcriptText.trim()}`);
  }

  return lines.join('\n');
}

export const generateCommentSuggestions = async (
  params: CommentSuggestionParams,
): Promise<string[]> => {
  logger.info(
    `[IntelligenceService] Generating ${params.brand.suggestionsCount} comment suggestion(s) for @${params.post.targetUsername}...`,
  );

  const systemPrompt = buildCommentSystemPrompt(params);
  const userMessage = buildPostUserMessage(params.post);

  const CommentSuggestionSchema = z.object({
    comments: z.array(z.string().min(1)).length(params.brand.suggestionsCount),
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0].message.content;
  if (!content) {
    throw new Error('[IntelligenceService] Empty response from OpenAI.');
  }

  const rawJson = JSON.parse(content) as unknown;
  return CommentSuggestionSchema.parse(rawJson).comments;
};
