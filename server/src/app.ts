import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { Prisma } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { getEnv } from './config/env.js';
import { prisma } from './config/prisma.js';
import { authenticate } from './middleware/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { bggRoutes } from './modules/bgg/bgg.routes.js';
import { libraryRoutes } from './modules/library/library.routes.js';
import { AppError } from './utils/errors.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.NODE_ENV === 'development' ? 'info' : 'warn',
          },
  });

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins.length <= 1 ? allowedOrigins[0] ?? true : allowedOrigins,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  app.decorate('authenticate', authenticate);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos de entrada inválidos',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: {
            code: 'UNIQUE_CONSTRAINT_VIOLATION',
            message: 'Ya existe un registro con esos datos únicos',
          },
        });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Recurso no encontrado',
          },
        });
      }
    }

    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error interno del servidor',
      },
    });
  });

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(bggRoutes, { prefix: '/api/bgg' });
  await app.register(libraryRoutes, { prefix: '/api/library' });

  return app;
}
