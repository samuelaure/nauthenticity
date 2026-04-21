import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TranscriptionResult {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;
}

let openai: OpenAI | null = null;
let isLocalWhisper = false;

export const transcribeAudio = async (filePath: string): Promise<TranscriptionResult> => {
  if (!openai) {
    // Determine if we should use local whisper or OpenAI API
    // If URL is set and doesn't contain 'api.openai.com', we assume local
    isLocalWhisper = !!(
      config.transcription.url && !config.transcription.url.includes('openai.com')
    );

    if (isLocalWhisper) {
      logger.info(
        `[Transcription] Initializing local Whisper client @ ${config.transcription.url}`,
      );
      openai = new OpenAI({
        apiKey: 'local-no-key',
        baseURL: `${config.transcription.url}/v1`,
      });
    } else {
      logger.info('[Transcription] Initializing OpenAI Whisper client');
      if (!config.openai.apiKey) {
        throw new Error(
          '[Transcription] OPENAI_API_KEY is not configured for OpenAI transcription.',
        );
      }
      openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });
    }
  }

  try {
    const model = isLocalWhisper ? 'Systran/faster-whisper-base' : 'whisper-1';
    logger.info(
      `[Transcription] Transcribing ${filePath} using ${isLocalWhisper ? 'local whisper' : 'OpenAI'} (${model}) ...`,
    );

    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model,
    });

    return {
      text: result.text,
      json: result,
    };
  } catch (error: any) {
    logger.error(`[Transcription] Error: ${error.message}`);
    throw error;
  }
};
