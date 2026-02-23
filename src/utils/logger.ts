import Fastify from 'fastify';

// Create a standalone fastify instance just for its logger properties
// This ensures we use the same logging format and configuration
const base = Fastify({ logger: true });

export const logger = base.log;
