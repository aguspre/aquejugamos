import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireRegisteredUser } from '../../middleware/auth.js';
import {
  castVoteSchema,
  createProposalSchema,
  createSessionSchema,
  joinSessionSchema,
  listSessionsQuerySchema,
  proposalParamsSchema,
  sessionIdParamsSchema,
  sessionPoolQuerySchema,
  updateProposalStatusSchema,
  updateRsvpSchema,
  updateSessionStatusSchema,
} from './sessions.schemas.js';
import {
  castVote,
  createSession,
  deleteSessionProposal,
  getSessionCombinedPool,
  getSessionDetail,
  joinSessionByInviteToken,
  listUserSessions,
  proposeGameForSession,
  removeVote,
  updateParticipantRsvp,
  updateProposalStatus,
  updateSessionStatus,
  type SessionAccessScope,
} from './sessions.service.js';

function getSessionScope(request: FastifyRequest): SessionAccessScope | undefined {
  if (!request.user?.isGuest) return undefined;
  return {
    isGuest: true,
    guestGroupId: request.user.guestGroupId,
    guestSessionId: request.user.guestSessionId,
  };
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request) => {
    const query = listSessionsQuerySchema.parse(request.query);
    const sessions = await listUserSessions(
      request.user.sub,
      query,
      getSessionScope(request),
    );
    return { sessions };
  });

  app.post('/', { preHandler: [requireRegisteredUser] }, async (request, reply) => {
    const input = createSessionSchema.parse(request.body);
    const session = await createSession(request.user.sub, input);
    return reply.status(201).send({ session });
  });

  app.post('/join', async (request) => {
    const { inviteToken, rsvp } = joinSessionSchema.parse(request.body);
    const session = await joinSessionByInviteToken(request.user.sub, inviteToken, rsvp);
    return { session };
  });

  app.get('/:sessionId', async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const session = await getSessionDetail(
      request.user.sub,
      sessionId,
      getSessionScope(request),
    );
    return { session };
  });

  app.patch('/:sessionId/rsvp', async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const { rsvp } = updateRsvpSchema.parse(request.body);
    const session = await updateParticipantRsvp(
      request.user.sub,
      sessionId,
      rsvp,
      getSessionScope(request),
    );
    return { session };
  });

  app.patch(
    '/:sessionId/status',
    { preHandler: [requireRegisteredUser] },
    async (request) => {
      const { sessionId } = sessionIdParamsSchema.parse(request.params);
      const { status } = updateSessionStatusSchema.parse(request.body);
      const session = await updateSessionStatus(request.user.sub, sessionId, status);
      return { session };
    },
  );

  app.get('/:sessionId/pool', async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const query = sessionPoolQuerySchema.parse(request.query);
    return getSessionCombinedPool(
      request.user.sub,
      sessionId,
      query,
      getSessionScope(request),
    );
  });

  app.post('/:sessionId/proposals', async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const input = createProposalSchema.parse(request.body);
    const session = await proposeGameForSession(
      request.user.sub,
      sessionId,
      input,
      getSessionScope(request),
    );
    return reply.status(201).send({ session });
  });

  app.patch(
    '/:sessionId/proposals/:proposalId/status',
    { preHandler: [requireRegisteredUser] },
    async (request) => {
      const { sessionId, proposalId } = proposalParamsSchema.parse(request.params);
      const { status } = updateProposalStatusSchema.parse(request.body);
      const session = await updateProposalStatus(
        request.user.sub,
        sessionId,
        proposalId,
        status,
      );
      return { session };
    },
  );

  app.delete('/:sessionId/proposals/:proposalId', async (request) => {
    const { sessionId, proposalId } = proposalParamsSchema.parse(request.params);
    const { session, refundedVotesCount } = await deleteSessionProposal(
      request.user.sub,
      sessionId,
      proposalId,
      getSessionScope(request),
    );
    return { session, refundedVotesCount };
  });

  app.post('/:sessionId/proposals/:proposalId/vote', async (request) => {
    const { sessionId, proposalId } = proposalParamsSchema.parse(request.params);
    const { rank } = castVoteSchema.parse(request.body ?? {});
    const votes = await castVote(
      request.user.sub,
      sessionId,
      proposalId,
      rank,
      getSessionScope(request),
    );
    return { votes };
  });

  app.delete('/:sessionId/proposals/:proposalId/vote', async (request) => {
    const { sessionId, proposalId } = proposalParamsSchema.parse(request.params);
    const votes = await removeVote(
      request.user.sub,
      sessionId,
      proposalId,
      getSessionScope(request),
    );
    return { votes };
  });
}
