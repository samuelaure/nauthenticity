import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export const authController = async (fastify: FastifyInstance) => {
  fastify.get('/auth/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.status(400).send({ error: 'Missing token parameter' });
    }

    // Decode token without verification to get the payload
    const payload = jwt.decode(token);
    if (!payload || typeof payload === 'string') {
      return reply.status(401).send({ error: 'Invalid token format' });
    }

    // Check if token is expired
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return reply.status(401).send({ error: 'Token expired' });
    }

    // Set token as httpOnly cookie via Set-Cookie header
    const cookieValue = `nau_token=${token}; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`;
    reply.header('Set-Cookie', cookieValue);

    // Redirect to frontend auth callback so it can extract and store token in localStorage
    return reply.redirect(`/auth/callback?token=${encodeURIComponent(token)}`);
  });
};
