import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { verifyJwt } from './jwt';
import { logger } from './logger';

export const authenticate = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
) => {
  // 1. Check for Service Key (inter-service)
  const serviceKey = request.headers['x-nau-service-key'];
  if (serviceKey && serviceKey === config.nauServiceKey) {
    return done();
  }

  // 2. Check for JWT Token (user-facing)
  const authHeader = request.headers['authorization'];
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    // Fallback to cookie
    const cookieHeader = request.headers.cookie || '';
    token =
      cookieHeader
        .split(';')
        .find((c) => c.trim().startsWith('nau_token='))
        ?.split('=')[1] || '';
  }

  if (token) {
    const payload = verifyJwt(token);
    if (payload) {
      // Attach user info if needed
      (request as any).user = payload;
      return done();
    }
  }

  logger.warn(`[Auth] Unauthorized access attempt to ${request.url}`);
  reply.status(401).send({ error: 'Unauthorized. Invalid or missing authentication.' });
};
