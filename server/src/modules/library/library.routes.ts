import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import {
  libraryGameParamsSchema,
  listLibraryQuerySchema,
  listMechanicsQuerySchema,
  updateLibraryItemSchema,
} from './library.schemas.js';
import {
  listMechanics,
  listUserLibrary,
  removeUserLibraryItem,
  updateUserLibraryItem,
} from './library.service.js';

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request) => {
    const query = listLibraryQuerySchema.parse(request.query);
    const items = await listUserLibrary(request.user.sub, query);
    return { items, total: items.length };
  });

  app.get('/mechanics', async (request) => {
    const { onlyMine } = listMechanicsQuerySchema.parse(request.query);
    const mechanics = await listMechanics(request.user.sub, Boolean(onlyMine));
    return { mechanics };
  });

  app.patch('/:gameId', async (request) => {
    const { gameId } = libraryGameParamsSchema.parse(request.params);
    const body = updateLibraryItemSchema.parse(request.body);
    const item = await updateUserLibraryItem(request.user.sub, gameId, body);
    return { item };
  });

  app.delete('/:gameId', async (request, reply) => {
    const { gameId } = libraryGameParamsSchema.parse(request.params);
    await removeUserLibraryItem(request.user.sub, gameId);
    return reply.status(204).send();
  });
}
