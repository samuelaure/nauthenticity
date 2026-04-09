import cron from 'node-cron';
import { runProactiveFanout } from './modules/proactive/fanout.processor';
import { logger } from './utils/logger';

/**
 * Smart Fanout Scheduler
 *
 * Runs every 15 minutes. The fanout processor internally evaluates each brand's
 * delivery window to decide whether to apply the 15-min (in-window) or 60-min
 * (out-of-window) scraping threshold per target account.
 *
 * Result: minimal Apify API usage whilst maximising freshness for active users.
 */
export const startScheduler = (): void => {
  const task = cron.schedule('*/15 * * * *', () => {
    logger.info('[Scheduler] Triggering smart fanout cycle...');
    runProactiveFanout().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Scheduler] Fanout cycle failed: ${msg}`);
    });
  });

  void task.start();
  logger.info('[Scheduler] Smart fanout cron started (every 15 minutes).');
};
