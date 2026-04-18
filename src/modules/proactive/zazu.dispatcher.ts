import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface ProactiveSuggestionPayload {
  workspaceId: string;
  brandId: string;
  brandName: string;
  targetUsername: string;
  postUrl: string;
  postThumbnailUrl: string;
  suggestions: string[];
  localPostId: string;
}

export const dispatchToZazu = async (payload: ProactiveSuggestionPayload) => {
  logger.info(
    `[ZazuDispatcher] Dispatching suggestion for brand ${payload.brandName} (Workspace: ${payload.workspaceId})...`,
  );

  try {
    const zazuUrl = config.hosts?.zazu || 'http://zazu:3000';
    const response = await fetch(`${zazuUrl}/api/internal/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.nauServiceKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[ZazuDispatcher] Failed: HTTP ${response.status} - ${errorText}`);
      throw new Error(`Zazu dispatch failed: ${response.statusText}`);
    }
  } catch (error: any) {
    logger.error(`[ZazuDispatcher] Error connecting to Zazu: ${error.message}`);
  }
};
