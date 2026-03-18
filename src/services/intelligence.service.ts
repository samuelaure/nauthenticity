import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Model specifically for content intelligence extraction.
 */
const IntelligenceSchema = z.object({
  hook: z.string().describe('The primary attention-grabbing opening of the content.'),
  pillars: z.array(z.string()).describe('The core themes or content pillars this post belongs to.'),
  cta: z.string().describe('The call to action provided in the content.'),
  sentiment: z.enum(['educational', 'promotional', 'entertaining', 'personal']).describe('The primary tone of the post.'),
  summary: z.string().describe('A concise 1nd or 2nd person summary of the strategy used.'),
});

export type PostIntelligence = z.infer<typeof IntelligenceSchema>;

export const extractPostIntelligence = async (
  caption: string,
  transcript: string = ''
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
