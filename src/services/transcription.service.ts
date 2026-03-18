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

export const transcribeAudio = async (filePath: string): Promise<TranscriptionResult> => {
  if (!config.transcription.url) {
    throw new Error(
      '[Transcription] TRANSCRIPTION_URL is not configured. ' +
        'Start the local Whisper container (infrastructure/whisper) and set TRANSCRIPTION_URL in .env.',
    );
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: 'local-no-key', // Whisper OSS does not require an API key
      baseURL: `${config.transcription.url}/v1`,
    });
  }
  try {
    logger.info(
      `[Transcription] Transcribing ${filePath} using local whisper @ ${config.transcription.url} ...`,
    );
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'Systran/faster-whisper-base', // Exact model ID served by the whisper container
    });

    return {
      text: result.text,
      json: result,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error(`[Transcription] Error: ${error.message}`);
    throw error;
  }
};
