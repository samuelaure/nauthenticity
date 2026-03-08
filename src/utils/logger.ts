import Fastify from 'fastify';
import { logContextStorage } from './context';

// Create a standalone fastify instance just for its logger properties
const base = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // Mixin allows us to inject context into every log line automatically
    mixin() {
      return logContextStorage.getStore() || {};
    },
  },
});

export const logger = base.log;
