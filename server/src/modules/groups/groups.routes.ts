import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import {
  createGroupSchema,
  groupIdParamsSchema,
  groupMemberParamsSchema,
  joinGroupSchema,
  updateMemberRoleSchema,
} from './groups.schemas.js';
import {
  createGroup,
  getGroupById,
  joinGroupByInviteCode,
  listUserGroups,
  regenerateGroupInviteCode,
  removeGroupMember,
  updateGroupMemberRole,
} from './groups.service.js';

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request) => {
    const groups = await listUserGroups(request.user.sub);
    return { groups };
  });

  app.post('/', async (request, reply) => {
    const input = createGroupSchema.parse(request.body);
    const group = await createGroup(request.user.sub, input);
    return reply.status(201).send({ group });
  });

  app.post('/join', async (request) => {
    const { inviteCode } = joinGroupSchema.parse(request.body);
    return joinGroupByInviteCode(request.user.sub, inviteCode);
  });

  app.get('/:groupId', async (request) => {
    const { groupId } = groupIdParamsSchema.parse(request.params);
    const group = await getGroupById(request.user.sub, groupId);
    return { group };
  });

  app.post('/:groupId/regenerate-code', async (request) => {
    const { groupId } = groupIdParamsSchema.parse(request.params);
    return regenerateGroupInviteCode(request.user.sub, groupId);
  });

  app.patch('/:groupId/members/:userId', async (request) => {
    const { groupId, userId } = groupMemberParamsSchema.parse(request.params);
    const { role } = updateMemberRoleSchema.parse(request.body);
    const group = await updateGroupMemberRole(
      request.user.sub,
      groupId,
      userId,
      role,
    );
    return { group };
  });

  app.delete('/:groupId/members/:userId', async (request) => {
    const { groupId, userId } = groupMemberParamsSchema.parse(request.params);
    return removeGroupMember(request.user.sub, groupId, userId);
  });
}
