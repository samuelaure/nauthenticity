import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger';

/**
 * Optimizes a video file for storage.
 * Standardizes to H.264, 720p max height, and reasonable bitrate.
 */
export async function optimizeVideo(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info(`[MediaUtils] Optimizing video: ${inputPath}`);
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .size('?x720') // Max 720p height
      .aspect('9:16') // Assume IG format primarily
      .videoBitrate('2000k')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
      .on('end', () => {
        logger.info(`[MediaUtils] Video optimized successfully: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        logger.error(`[MediaUtils] Video optimization failed: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Optimizes an image file for storage.
 * Standards to high-quality JPEG.
 */
export async function optimizeImage(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info(`[MediaUtils] Optimizing image: ${inputPath}`);
    ffmpeg(inputPath)
      .outputOptions(['-q:v 2']) // High quality JPEG
      .on('end', () => {
        logger.info(`[MediaUtils] Image optimized successfully: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        logger.error(`[MediaUtils] Image optimization failed: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
}
