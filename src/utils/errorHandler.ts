import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger';

export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error({
    msg: 'Unhandled Error',
    error: error.message,
    stack: error.stack,
    path: request.url,
    method: request.method,
  });

  if (statusCode >= 500) {
    reply.status(statusCode).send({
      error: 'Internal Server Error',
      message: isProduction ? 'An unexpected error occurred' : error.message,
      statusCode,
    });
  } else {
    reply.status(statusCode).send({
      error: error.name,
      message: error.message,
      statusCode,
    });
  }
};
