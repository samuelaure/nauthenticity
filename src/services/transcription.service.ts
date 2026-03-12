import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TranscriptionResult {
  text: string;
  json?: any;
}

const openai = new OpenAI({
  apiKey: config.transcription.url ? 'local-no-key' : config.openai.apiKey,
  baseURL: config.transcription.url ? `${config.transcription.url}/v1` : undefined,
});

export const transcribeAudio = async (filePath: string): Promise<TranscriptionResult> => {
  try {
    logger.info(
      `[Transcription] Transcribing ${filePath} using ${
        config.transcription.url ? 'local whisper' : 'OpenAI'
      }...`,
    );
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: config.transcription.url ? 'base' : 'whisper-1',
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
