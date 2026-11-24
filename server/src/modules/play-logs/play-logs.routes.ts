import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import {
  createPlayLogSchema,
  groupStatsParamsSchema,
  listPlayLogsQuerySchema,
  playLogIdParamsSchema,
} from './play-logs.schemas.js';
import {
  createPlayLog,
  deletePlayLog,
  getGroupStats,
  listPlayLogs,
} from './play-logs.service.js';

export async function playLogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request) => {
    const query = listPlayLogsQuerySchema.parse(request.query);
    const playLogs = await listPlayLogs(request.user.sub, query);
    return { playLogs };
  });

  app.post('/', async (request, reply) => {
    const input = createPlayLogSchema.parse(request.body);
    const playLog = await createPlayLog(request.user.sub, input);
    return reply.status(201).send({ playLog });
  });

  app.get('/stats/:groupId', async (request) => {
    const { groupId } = groupStatsParamsSchema.parse(request.params);
    const stats = await getGroupStats(request.user.sub, groupId);
    return { stats };
  });

  app.delete('/:playLogId', async (request, reply) => {
    const { playLogId } = playLogIdParamsSchema.parse(request.params);
    await deletePlayLog(request.user.sub, playLogId);
    return reply.status(204).send();
  });
}
