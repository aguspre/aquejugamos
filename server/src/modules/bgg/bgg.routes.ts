import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import {
  bggImportBodySchema,
  bggImportParamsSchema,
  bggSearchQuerySchema,
  bggSyncSchema,
} from './bgg.schemas.js';
import {
  importGameToLibrary,
  searchBggCatalog,
  syncUserBggCollection,
} from './bgg.service.js';

export async function bggRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.post('/sync', async (request) => {
    const input = bggSyncSchema.parse(request.body ?? {});
    const summary = await syncUserBggCollection(
      request.user.sub,
      input.bggUsername,
      input.forceRefresh,
    );

    return { sync: summary };
  });

  app.get('/search', async (request) => {
    const { query, exact } = bggSearchQuerySchema.parse(request.query);
    const results = await searchBggCatalog(request.user.sub, query, exact);

    return { results };
  });

  app.post('/import/:bggId', async (request, reply) => {
    const { bggId } = bggImportParamsSchema.parse(request.params);
    const body = bggImportBodySchema.parse(request.body ?? {});
    const item = await importGameToLibrary(request.user.sub, bggId, body);

    return reply.status(201).send({ item });
  });
}
