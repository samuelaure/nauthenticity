import pino from 'pino';
import { logContextStorage } from './context';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Mixin allows us to inject context into every log line automatically
  mixin() {
    return logContextStorage.getStore() || {};
  },
});
