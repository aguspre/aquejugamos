import { GroupRole, Prisma, ProposalStatus, RsvpStatus, SessionStatus, VotingMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRawMock = vi.fn();
const executeRawMock = vi.fn();
const participantFindUniqueMock = vi.fn();
const participantUpsertMock = vi.fn();
const groupMemberFindUniqueMock = vi.fn();
const gameFindUniqueMock = vi.fn();
const sessionVoteDeleteManyMock = vi.fn();
const sessionVoteCreateMock = vi.fn();
const sessionProposalDeleteMock = vi.fn();
const sessionProposalFindManyMock = vi.fn();
const sessionProposalFindUniqueMock = vi.fn();
const sessionProposalCountMock = vi.fn();
const sessionProposalCreateMock = vi.fn();
const sessionFindUniqueMock = vi.fn();
const userGameFindManyMock = vi.fn();

const txMock = {
  $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  $executeRaw: (...args: unknown[]) => executeRawMock(...args),
  sessionParticipant: {
    findUnique: (...args: unknown[]) => participantFindUniqueMock(...args),
    upsert: (...args: unknown[]) => participantUpsertMock(...args),
  },
  groupMember: {
    findUnique: (...args: unknown[]) => groupMemberFindUniqueMock(...args),
  },
  game: {
    findUnique: (...args: unknown[]) => gameFindUniqueMock(...args),
  },
  sessionVote: {
    deleteMany: (...args: unknown[]) => sessionVoteDeleteManyMock(...args),
  },
  sessionProposal: {
    delete: (...args: unknown[]) => sessionProposalDeleteMock(...args),
    findUnique: (...args: unknown[]) => sessionProposalFindUniqueMock(...args),
    count: (...args: unknown[]) => sessionProposalCountMock(...args),
    create: (...args: unknown[]) => sessionProposalCreateMock(...args),
  },
};

vi.mock('../../../config/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof txMock) => Promise<unknown>)(txMock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    session: {
      findUnique: (...args: unknown[]) => sessionFindUniqueMock(...args),
    },
    sessionProposal: {
      findMany: (...args: unknown[]) => sessionProposalFindManyMock(...args),
    },
    sessionVote: {
      create: (...args: unknown[]) => sessionVoteCreateMock(...args),
      deleteMany: (...args: unknown[]) => sessionVoteDeleteManyMock(...args),
    },
    userGame: {
      findMany: (...args: unknown[]) => userGameFindManyMock(...args),
    },
  },
}));

import {
  castVote,
  deleteSessionProposal,
  getSessionDetail,
  proposeGameForSession,
} from '../sessions.service.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const HOST_ID = '44444444-4444-4444-8444-444444444444';
const AUTHOR_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_USER_ID = '77777777-7777-4777-8777-777777777777';
const GUEST_ID = '88888888-8888-4888-8888-888888888888';

function mockSessionDetailResponse(viewerId: string, role: GroupRole | null = GroupRole.member) {
  sessionFindUniqueMock.mockResolvedValue({
    id: SESSION_ID,
    groupId: GROUP_ID,
    hostId: HOST_ID,
    title: 'Viernes de mesa',
    scheduledAt: new Date('2026-11-27T21:00:00Z'),
    location: 'Casa',
    status: SessionStatus.voting,
    votingMode: VotingMode.multi_vote,
    maxVotesPerUser: 3,
    maxProposalsPerUser: null,
    inviteToken: 'tok-1234',
    group: {
      id: GROUP_ID,
      name: 'Los Meeples',
      members: role ? [{ role }] : [],
    },
    host: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
    participants: [
      {
        userId: viewerId,
        rsvp: RsvpStatus.going,
        respondedAt: new Date('2026-11-24T12:00:00Z'),
        user: { id: viewerId, displayName: 'Viewer', avatarUrl: null, bggUsername: null },
      },
    ],
    proposals: [],
  });
  userGameFindManyMock.mockResolvedValue([]);
}

describe('deleteSessionProposal (transaccional, permisos y devolución de votos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite al autor quitar su propuesta abierta y devuelve el conteo exacto de votos borrados', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: AUTHOR_ID, status: ProposalStatus.open },
      ]);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    sessionVoteDeleteManyMock.mockResolvedValue({ count: 3 });
    sessionProposalDeleteMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(AUTHOR_ID);

    const result = await deleteSessionProposal(AUTHOR_ID, SESSION_ID, PROPOSAL_ID);

    expect(result.refundedVotesCount).toBe(3);
    expect(result.session.votesRemaining).toBe(3);
    expect(sessionVoteDeleteManyMock).toHaveBeenCalledWith({
      where: { proposalId: PROPOSAL_ID },
    });
    expect(sessionProposalDeleteMock).toHaveBeenCalledWith({
      where: { id: PROPOSAL_ID },
    });
  });

  it('devuelve refundedVotesCount = 0 cuando la propuesta no tenía votos', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: AUTHOR_ID, status: ProposalStatus.open },
      ]);
    participantFindUniqueMock.mockResolvedValue({ userId: HOST_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    sessionVoteDeleteManyMock.mockResolvedValue({ count: 0 });
    sessionProposalDeleteMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(HOST_ID);

    const result = await deleteSessionProposal(HOST_ID, SESSION_ID, PROPOSAL_ID);
    expect(result.refundedVotesCount).toBe(0);
  });

  it('permite a un admin del grupo quitar la propuesta de otro miembro', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.planning },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: AUTHOR_ID, status: ProposalStatus.open },
      ]);
    participantFindUniqueMock.mockResolvedValue(null);
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });
    sessionVoteDeleteManyMock.mockResolvedValue({ count: 2 });
    sessionProposalDeleteMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(ADMIN_ID, GroupRole.admin);

    const result = await deleteSessionProposal(ADMIN_ID, SESSION_ID, PROPOSAL_ID);
    expect(result.refundedVotesCount).toBe(2);
  });

  it('rechaza con 403 PROPOSAL_DELETE_FORBIDDEN si otro miembro común intenta quitarla', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: AUTHOR_ID, status: ProposalStatus.open },
      ]);
    participantFindUniqueMock.mockResolvedValue({ userId: OTHER_USER_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });

    await expect(
      deleteSessionProposal(OTHER_USER_ID, SESSION_ID, PROPOSAL_ID),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PROPOSAL_DELETE_FORBIDDEN',
    });
    expect(sessionVoteDeleteManyMock).not.toHaveBeenCalled();
    expect(sessionProposalDeleteMock).not.toHaveBeenCalled();
  });

  it('permite a un invitado quitar su propia propuesta pero bloquea quitar la de otro (403)', async () => {
    const guestScope = { isGuest: true, guestSessionId: SESSION_ID };

    // Propia -> OK
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: GUEST_ID, status: ProposalStatus.open },
      ]);
    participantFindUniqueMock.mockResolvedValue({ userId: GUEST_ID });
    groupMemberFindUniqueMock.mockResolvedValue(null);
    sessionVoteDeleteManyMock.mockResolvedValue({ count: 1 });
    sessionProposalDeleteMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(GUEST_ID, null);

    const ownResult = await deleteSessionProposal(GUEST_ID, SESSION_ID, PROPOSAL_ID, guestScope);
    expect(ownResult.refundedVotesCount).toBe(1);

    // Ajena -> 403
    vi.clearAllMocks();
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: AUTHOR_ID, status: ProposalStatus.open },
      ]);
    participantFindUniqueMock.mockResolvedValue({ userId: GUEST_ID });
    groupMemberFindUniqueMock.mockResolvedValue(null);

    await expect(
      deleteSessionProposal(GUEST_ID, SESSION_ID, PROPOSAL_ID, guestScope),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PROPOSAL_DELETE_FORBIDDEN',
    });
  });

  it('rechaza con 400 SESSION_VOTING_CLOSED cuando la juntada ya está bloqueada', async () => {
    queryRawMock.mockResolvedValueOnce([
      { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.locked },
    ]);
    participantFindUniqueMock.mockResolvedValue({ userId: HOST_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });

    await expect(deleteSessionProposal(HOST_ID, SESSION_ID, PROPOSAL_ID)).rejects.toMatchObject({
      statusCode: 400,
      code: 'SESSION_VOTING_CLOSED',
    });
  });

  it('rechaza con 400 PROPOSAL_ALREADY_ACCEPTED cuando el juego ya fue confirmado', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([
        { id: PROPOSAL_ID, proposed_by: AUTHOR_ID, status: ProposalStatus.accepted },
      ]);
    participantFindUniqueMock.mockResolvedValue({ userId: HOST_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });

    await expect(deleteSessionProposal(HOST_ID, SESSION_ID, PROPOSAL_ID)).rejects.toMatchObject({
      statusCode: 400,
      code: 'PROPOSAL_ALREADY_ACCEPTED',
    });
  });

  it('devuelve 404 PROPOSAL_NOT_FOUND si la propuesta no existe o fue eliminada concurrentemente', async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { id: SESSION_ID, group_id: GROUP_ID, host_id: HOST_ID, status: SessionStatus.voting },
      ])
      .mockResolvedValueOnce([]);
    participantFindUniqueMock.mockResolvedValue({ userId: HOST_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.admin });

    await expect(deleteSessionProposal(HOST_ID, SESSION_ID, PROPOSAL_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PROPOSAL_NOT_FOUND',
    });
  });

  it('mapea P2003 en castVote a 404 PROPOSAL_NOT_FOUND si la propuesta se eliminó concurrentemente', async () => {
    sessionFindUniqueMock.mockResolvedValue({
      id: SESSION_ID,
      groupId: GROUP_ID,
      hostId: HOST_ID,
      status: SessionStatus.voting,
      votingMode: VotingMode.multi_vote,
      maxVotesPerUser: 3,
      participants: [{ userId: AUTHOR_ID, rsvp: RsvpStatus.going }],
      group: { id: GROUP_ID, members: [{ role: GroupRole.member }] },
    });
    sessionProposalFindManyMock.mockResolvedValue([
      {
        id: PROPOSAL_ID,
        status: ProposalStatus.open,
        acceptedAt: null,
        createdAt: new Date('2026-11-24T12:00:00Z'),
        votes: [],
      },
    ]);
    sessionVoteCreateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
        code: 'P2003',
        clientVersion: '6.6.0',
      }),
    );

    await expect(castVote(AUTHOR_ID, SESSION_ID, PROPOSAL_ID, 1)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PROPOSAL_NOT_FOUND',
    });
  });
});

const GAME_ID = '99999999-9999-4999-8999-999999999999';

describe('proposeGameForSession (límite opcional de propuestas por integrante)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite proponer cuando no hay límite configurado (maxProposalsPerUser = null)', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: null,
      },
    ]);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    sessionProposalCreateMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(AUTHOR_ID);

    const detail = await proposeGameForSession(AUTHOR_ID, SESSION_ID, {
      gameId: GAME_ID,
      note: 'Lo llevo yo',
    });

    expect(sessionProposalCountMock).not.toHaveBeenCalled();
    expect(sessionProposalCreateMock).toHaveBeenCalledWith({
      data: {
        sessionId: SESSION_ID,
        gameId: GAME_ID,
        proposedBy: AUTHOR_ID,
        note: 'Lo llevo yo',
      },
    });
    expect(detail.maxProposalsPerUser).toBeNull();
    expect(detail.proposalsRemaining).toBeNull();
  });

  it('permite proponer si el usuario todavía está por debajo de maxProposalsPerUser usando $executeRaw para advisory lock', async () => {
    const callOrder: string[] = [];
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 2,
      },
    ]);
    executeRawMock.mockImplementationOnce(async () => {
      callOrder.push('advisory_lock');
      return 1;
    });
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    sessionProposalCountMock.mockImplementationOnce(async () => {
      callOrder.push('proposal_count');
      return 1;
    });
    sessionProposalCreateMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(AUTHOR_ID);

    await proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID });

    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['advisory_lock', 'proposal_count']);
    expect(sessionProposalCountMock).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, proposedBy: AUTHOR_ID },
    });
    expect(sessionProposalCreateMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza con 400 MAX_PROPOSALS_REACHED (con details) cuando el usuario alcanzó el límite configurado', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 2,
      },
    ]);
    executeRawMock.mockResolvedValueOnce(1);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    sessionProposalCountMock.mockResolvedValue(2);

    await expect(
      proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'MAX_PROPOSALS_REACHED',
      details: {
        maxProposalsPerUser: 2,
        userProposalsCount: 2,
      },
    });
    expect(sessionProposalCreateMock).not.toHaveBeenCalled();
  });

  it('rechaza con 409 DUPLICATE_PROPOSAL si el juego ya fue propuesto antes de chequear límite', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 1,
      },
    ]);
    executeRawMock.mockResolvedValueOnce(1);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue({ id: PROPOSAL_ID });
    sessionProposalCountMock.mockResolvedValue(1);

    await expect(
      proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE_PROPOSAL',
    });
    expect(sessionProposalCreateMock).not.toHaveBeenCalled();
  });

  it('rechaza con 404 SESSION_NOT_FOUND, 400 SESSION_VOTING_CLOSED y 404 GAME_NOT_FOUND', async () => {
    // 404 SESSION_NOT_FOUND
    queryRawMock.mockResolvedValueOnce([]);
    await expect(
      proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'SESSION_NOT_FOUND',
    });

    // 400 SESSION_VOTING_CLOSED
    vi.clearAllMocks();
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.locked,
        max_proposals_per_user: 2,
      },
    ]);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    await expect(
      proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'SESSION_VOTING_CLOSED',
    });
    expect(executeRawMock).not.toHaveBeenCalled();

    // 404 GAME_NOT_FOUND
    vi.clearAllMocks();
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: null,
      },
    ]);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    gameFindUniqueMock.mockResolvedValue(null);
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    await expect(
      proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'GAME_NOT_FOUND',
    });
  });

  it('maneja invitados respetando límite y evita upsert redundante si ya participa', async () => {
    const guestScope = { isGuest: true, guestSessionId: SESSION_ID };

    // Invitado sin fila de participante -> hace upsert y crea propuesta
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 1,
      },
    ]);
    executeRawMock.mockResolvedValueOnce(1);
    participantFindUniqueMock.mockResolvedValue(null);
    groupMemberFindUniqueMock.mockResolvedValue(null);
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    sessionProposalCountMock.mockResolvedValue(0);
    participantUpsertMock.mockResolvedValue({ sessionId: SESSION_ID, userId: GUEST_ID });
    sessionProposalCreateMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(GUEST_ID, null);

    await proposeGameForSession(GUEST_ID, SESSION_ID, { gameId: GAME_ID }, guestScope);
    expect(participantUpsertMock).toHaveBeenCalledTimes(1);

    // Invitado que ya participa -> NO ejecuta upsert redundante
    vi.clearAllMocks();
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 2,
      },
    ]);
    executeRawMock.mockResolvedValueOnce(1);
    participantFindUniqueMock.mockResolvedValue({ userId: GUEST_ID });
    groupMemberFindUniqueMock.mockResolvedValue(null);
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    sessionProposalCountMock.mockResolvedValue(1);
    sessionProposalCreateMock.mockResolvedValue({ id: PROPOSAL_ID });
    mockSessionDetailResponse(GUEST_ID, null);

    await proposeGameForSession(GUEST_ID, SESSION_ID, { gameId: GAME_ID }, guestScope);
    expect(participantUpsertMock).not.toHaveBeenCalled();

    // Invitado fuera de alcance -> 403
    vi.clearAllMocks();
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 2,
      },
    ]);
    participantFindUniqueMock.mockResolvedValue(null);
    groupMemberFindUniqueMock.mockResolvedValue(null);
    await expect(
      proposeGameForSession(
        GUEST_ID,
        SESSION_ID,
        { gameId: GAME_ID },
        { isGuest: true, guestSessionId: '00000000-0000-4000-8000-000000000000' },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_ACCESS_DENIED',
    });
  });

  it('getSessionDetail calcula userProposalsCount y proposalsRemaining sobre propuestas mixtas', async () => {
    const baseGame = {
      id: GAME_ID,
      bggId: 13,
      name: 'Catan',
      yearPublished: 1995,
      imageUrl: null,
      thumbnailUrl: null,
      minPlayers: 3,
      maxPlayers: 4,
      bestPlayers: [4],
      playingTimeMinutes: 90,
      weight: null,
      bggRating: null,
      isExpansion: false,
      baseGameBggId: null,
      mechanics: [],
    };
    sessionFindUniqueMock.mockResolvedValue({
      id: SESSION_ID,
      groupId: GROUP_ID,
      hostId: HOST_ID,
      title: 'Juntada con límite',
      scheduledAt: new Date('2026-11-27T21:00:00Z'),
      location: 'Casa',
      status: SessionStatus.voting,
      votingMode: VotingMode.multi_vote,
      maxVotesPerUser: 3,
      maxProposalsPerUser: 2,
      inviteToken: 'tok-9999',
      group: { id: GROUP_ID, name: 'Los Meeples', members: [{ role: GroupRole.member }] },
      host: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
      participants: [
        {
          userId: AUTHOR_ID,
          rsvp: RsvpStatus.going,
          respondedAt: new Date('2026-11-24T12:00:00Z'),
          user: { id: AUTHOR_ID, displayName: 'Autor', avatarUrl: null, bggUsername: null },
        },
      ],
      proposals: [
        {
          id: 'p-1',
          gameId: GAME_ID,
          proposedBy: AUTHOR_ID,
          note: null,
          status: ProposalStatus.accepted,
          acceptedAt: new Date('2026-11-24T12:30:00Z'),
          createdAt: new Date('2026-11-24T12:10:00Z'),
          game: baseGame,
          proposer: { id: AUTHOR_ID, displayName: 'Autor', avatarUrl: null, bggUsername: null },
          accepter: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
          votes: [],
        },
        {
          id: 'p-2',
          gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          proposedBy: HOST_ID,
          note: null,
          status: ProposalStatus.open,
          acceptedAt: null,
          createdAt: new Date('2026-11-24T12:15:00Z'),
          game: { ...baseGame, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bggId: 266192, name: 'Wingspan' },
          proposer: { id: HOST_ID, displayName: 'Host', avatarUrl: null, bggUsername: null },
          accepter: null,
          votes: [],
        },
      ],
    });
    userGameFindManyMock.mockResolvedValue([]);

    const detail = await getSessionDetail(AUTHOR_ID, SESSION_ID);
    expect(detail.maxProposalsPerUser).toBe(2);
    expect(detail.userProposalsCount).toBe(1);
    expect(detail.proposalsRemaining).toBe(1);
  });

  it('rechaza con 403 SESSION_ACCESS_DENIED si el usuario no pertenece a la juntada', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: 2,
      },
    ]);
    participantFindUniqueMock.mockResolvedValue(null);
    groupMemberFindUniqueMock.mockResolvedValue(null);

    await expect(
      proposeGameForSession(OTHER_USER_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'SESSION_ACCESS_DENIED',
    });
  });

  it('mapea P2002 concurrente en create a 409 DUPLICATE_PROPOSAL', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        group_id: GROUP_ID,
        host_id: HOST_ID,
        status: SessionStatus.voting,
        max_proposals_per_user: null,
      },
    ]);
    participantFindUniqueMock.mockResolvedValue({ userId: AUTHOR_ID });
    groupMemberFindUniqueMock.mockResolvedValue({ role: GroupRole.member });
    gameFindUniqueMock.mockResolvedValue({ id: GAME_ID });
    sessionProposalFindUniqueMock.mockResolvedValue(null);
    sessionProposalCreateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.6.0',
      }),
    );

    await expect(
      proposeGameForSession(AUTHOR_ID, SESSION_ID, { gameId: GAME_ID }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE_PROPOSAL',
    });
  });
});
