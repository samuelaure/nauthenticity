import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TranscriptionResult {
  text: string;
  json?: any;
}

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export const transcribeAudio = async (filePath: string): Promise<TranscriptionResult> => {
  // For now, we use OpenAI. In Phase 2.5, we will switch to local faster-whisper.
  try {
    logger.info(`[Transcription] Transcribing ${filePath}...`);
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
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
