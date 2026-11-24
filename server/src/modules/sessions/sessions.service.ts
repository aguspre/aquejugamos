import {
  GroupRole,
  Prisma,
  ProposalStatus,
  RsvpStatus,
  SessionStatus,
  UserGameStatus,
  VotingMode,
} from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { generateSessionInviteToken } from '../../utils/tokens.js';
import { assertGroupMember } from '../groups/groups.service.js';
import type {
  CreateProposalInput,
  CreateSessionInput,
  ListSessionsQuery,
  SessionPoolQuery,
} from './sessions.schemas.js';
import {
  aggregateCombinedPool,
  computeUserVoteQuota,
  scoreProposalVotes,
  sortAcceptedProposals,
  sortScoredProposals,
  type OwnerSummary,
  type PoolGameInput,
} from './sessions.scoring.js';

const USER_SUMMARY_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
  bggUsername: true,
} as const;

const GAME_WITH_MECHANICS_INCLUDE = {
  mechanics: {
    include: {
      mechanic: true,
    },
  },
} as const;

type GameWithMechanics = Prisma.GameGetPayload<{
  include: typeof GAME_WITH_MECHANICS_INCLUDE;
}>;

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value !== null && value !== undefined ? Number(value) : null;
}

function formatGame(game: GameWithMechanics): PoolGameInput {
  return {
    id: game.id,
    bggId: game.bggId,
    name: game.name,
    yearPublished: game.yearPublished,
    imageUrl: game.imageUrl,
    thumbnailUrl: game.thumbnailUrl,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    bestPlayers: game.bestPlayers,
    playingTimeMinutes: game.playingTimeMinutes,
    weight: decimalToNumber(game.weight),
    bggRating: decimalToNumber(game.bggRating),
    isExpansion: game.isExpansion,
    baseGameBggId: game.baseGameBggId,
    mechanics: game.mechanics
      .map((gm) => ({
        id: gm.mechanic.id,
        bggId: gm.mechanic.bggId,
        name: gm.mechanic.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}

export interface SessionAccessScope {
  isGuest?: boolean;
  guestGroupId?: string;
  guestSessionId?: string;
}

export interface ProposalVoteSummary {
  id: string;
  status: ProposalStatus;
  voteCount: number;
  score: number;
  userVoted: boolean;
  userRank: number | null;
}

export interface SessionVotesSnapshot {
  sessionId: string;
  userVotesUsed: number;
  votesRemaining: number;
  lockedVotesCount: number;
  lockedRanks: number[];
  proposals: ProposalVoteSummary[];
}

interface ProposalVotesRow {
  id: string;
  status: ProposalStatus;
  acceptedAt: Date | null;
  createdAt: Date;
  votes: { userId: string; rank: number }[];
}

function buildVotesSnapshot(
  sessionId: string,
  votingMode: VotingMode,
  maxVotesPerUser: number,
  userId: string,
  proposals: ProposalVotesRow[],
): SessionVotesSnapshot {
  const scored = proposals.map((p) => ({
    id: p.id,
    status: p.status,
    acceptedAt: p.acceptedAt,
    createdAt: p.createdAt,
    ...scoreProposalVotes(p.votes, votingMode, userId),
  }));

  const accepted = sortAcceptedProposals(
    scored.filter((p) => p.status === ProposalStatus.accepted),
  );
  const open = sortScoredProposals(
    scored.filter((p) => p.status === ProposalStatus.open),
  );
  const ordered = [...accepted, ...open];
  const quota = computeUserVoteQuota(ordered, votingMode, maxVotesPerUser);

  return {
    sessionId,
    userVotesUsed: quota.userVotesUsed,
    votesRemaining: quota.votesRemaining,
    lockedVotesCount: quota.lockedVotesCount,
    lockedRanks: quota.lockedRanks,
    proposals: ordered.map((p) => ({
      id: p.id,
      status: p.status,
      voteCount: p.voteCount,
      score: p.score,
      userVoted: p.userVoted,
      userRank: p.userRank,
    })),
  };
}

export async function assertSessionAccess(
  userId: string,
  sessionId: string,
  scope?: SessionAccessScope,
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      participants: {
        where: { userId },
        select: { userId: true, rsvp: true },
      },
      group: {
        select: {
          id: true,
          members: {
            where: { userId },
            select: { role: true },
          },
        },
      },
    },
  });

  if (!session) {
    throw notFound('Juntada no encontrada', 'SESSION_NOT_FOUND');
  }

  const isHost = session.hostId === userId;
  const isParticipant = session.participants.length > 0;
  const isGroupMember = (session.group?.members.length ?? 0) > 0;
  const isInvitedGuest = Boolean(
    scope?.isGuest &&
      ((scope.guestGroupId && session.groupId === scope.guestGroupId) ||
        (scope.guestSessionId && session.id === scope.guestSessionId)),
  );

  if (!isHost && !isParticipant && !isGroupMember && !isInvitedGuest) {
    throw forbidden('No tenés acceso a esta juntada', 'SESSION_ACCESS_DENIED');
  }

  return {
    session,
    isHost,
    isParticipant,
    isGroupAdmin: !scope?.isGuest && session.group?.members[0]?.role === GroupRole.admin,
  };
}

export async function listUserSessions(
  userId: string,
  query: ListSessionsQuery,
  scope?: SessionAccessScope,
) {
  let accessOr: Prisma.SessionWhereInput[];

  if (scope?.isGuest) {
    accessOr = [
      { participants: { some: { userId } } },
      ...(scope.guestGroupId ? [{ groupId: scope.guestGroupId }] : []),
      ...(scope.guestSessionId ? [{ id: scope.guestSessionId }] : []),
    ];
  } else {
    if (query.groupId) {
      await assertGroupMember(userId, query.groupId);
    }

    accessOr = [
      { hostId: userId },
      { participants: { some: { userId } } },
      { group: { members: { some: { userId } } } },
    ];
  }

  const sessions = await prisma.session.findMany({
    where: {
      ...(query.groupId && !scope?.isGuest ? { groupId: query.groupId } : {}),
      ...(query.status ? { status: query.status } : {}),
      OR: accessOr,
    },
    include: {
      group: { select: { id: true, name: true } },
      host: { select: USER_SUMMARY_SELECT },
      participants: {
        include: { user: { select: USER_SUMMARY_SELECT } },
        orderBy: { respondedAt: 'asc' },
      },
      proposals: {
        include: {
          game: {
            select: {
              id: true,
              name: true,
              thumbnailUrl: true,
              playingTimeMinutes: true,
            },
          },
          votes: { select: { userId: true, rank: true } },
        },
      },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  return sessions.map((session) => {
    const scoredAll = session.proposals.map((p) => ({
      id: p.id,
      status: p.status,
      acceptedAt: p.acceptedAt,
      createdAt: p.createdAt,
      game: p.game,
      ...scoreProposalVotes(p.votes, session.votingMode, userId),
    }));

    const acceptedProposals = sortAcceptedProposals(
      scoredAll.filter((p) => p.status === ProposalStatus.accepted),
    );
    const openProposals = sortScoredProposals(
      scoredAll.filter((p) => p.status === ProposalStatus.open),
    );

    const top = openProposals[0] ?? acceptedProposals[0] ?? null;

    return {
      id: session.id,
      groupId: session.groupId,
      groupName: session.group?.name ?? 'Invitación directa',
      title: session.title,
      scheduledAt: session.scheduledAt,
      location: session.location,
      status: session.status,
      votingMode: session.votingMode,
      maxVotesPerUser: session.maxVotesPerUser,
      inviteToken: session.inviteToken,
      host: session.host,
      confirmedCount: session.participants.filter((p) => p.rsvp === RsvpStatus.going)
        .length,
      proposalsCount: session.proposals.length,
      acceptedProposals: acceptedProposals.map((p) => ({
        id: p.id,
        acceptedAt: p.acceptedAt,
        game: p.game,
        voteCount: p.voteCount,
        score: p.score,
      })),
      topProposal: top
        ? {
            id: top.id,
            status: top.status,
            game: top.game,
            voteCount: top.voteCount,
            score: top.score,
          }
        : null,
      participants: session.participants.map((p) => ({
        rsvp: p.rsvp,
        respondedAt: p.respondedAt,
        user: p.user,
      })),
    };
  });
}

export async function createSession(userId: string, input: CreateSessionInput) {
  let participantCreates: { userId: string; rsvp: RsvpStatus }[] = [
    { userId, rsvp: RsvpStatus.going },
  ];

  if (input.groupId) {
    await assertGroupMember(userId, input.groupId);
    const members = await prisma.groupMember.findMany({
      where: { groupId: input.groupId },
      select: { userId: true },
    });
    participantCreates = members.map((m) => ({
      userId: m.userId,
      rsvp: m.userId === userId ? RsvpStatus.going : RsvpStatus.maybe,
    }));
  }

  const normalizedMaxVotes =
    input.votingMode === VotingMode.single_choice
      ? 1
      : input.votingMode === VotingMode.ranked_top3
        ? 3
        : input.maxVotesPerUser;

  const created = await prisma.session.create({
    data: {
      groupId: input.groupId ?? null,
      hostId: userId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      location: input.location ?? null,
      status: input.status,
      votingMode: input.votingMode,
      maxVotesPerUser: normalizedMaxVotes,
      inviteToken: generateSessionInviteToken(),
      participants: {
        createMany: {
          data: participantCreates,
          skipDuplicates: true,
        },
      },
    },
    select: { id: true },
  });

  return getSessionDetail(userId, created.id);
}

export async function joinSessionByInviteToken(
  userId: string,
  inviteToken: string,
  rsvp: RsvpStatus,
) {
  const session = await prisma.session.findUnique({
    where: { inviteToken },
    select: { id: true, status: true },
  });

  if (!session) {
    throw notFound(
      'Link de invitación de juntada inválido o inexistente',
      'SESSION_INVITE_NOT_FOUND',
    );
  }

  if (session.status === SessionStatus.cancelled) {
    throw badRequest('Esta juntada fue cancelada', undefined, 'SESSION_CANCELLED');
  }

  await prisma.sessionParticipant.upsert({
    where: {
      sessionId_userId: { sessionId: session.id, userId },
    },
    update: {
      rsvp,
      respondedAt: new Date(),
    },
    create: {
      sessionId: session.id,
      userId,
      rsvp,
    },
  });

  return getSessionDetail(userId, session.id);
}

export async function getSessionDetail(
  userId: string,
  sessionId: string,
  scope?: SessionAccessScope,
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          members: {
            where: { userId },
            select: { role: true },
          },
        },
      },
      host: { select: USER_SUMMARY_SELECT },
      participants: {
        include: { user: { select: USER_SUMMARY_SELECT } },
        orderBy: { respondedAt: 'asc' },
      },
      proposals: {
        include: {
          game: { include: GAME_WITH_MECHANICS_INCLUDE },
          proposer: { select: USER_SUMMARY_SELECT },
          accepter: { select: USER_SUMMARY_SELECT },
          votes: { select: { userId: true, rank: true } },
        },
      },
    },
  });

  if (!session) {
    throw notFound('Juntada no encontrada', 'SESSION_NOT_FOUND');
  }

  const isHost = session.hostId === userId;
  const isParticipant = session.participants.some((p) => p.userId === userId);
  const isGroupMember = (session.group?.members.length ?? 0) > 0;
  const isInvitedGuest = Boolean(
    scope?.isGuest &&
      ((scope.guestGroupId && session.groupId === scope.guestGroupId) ||
        (scope.guestSessionId && session.id === scope.guestSessionId)),
  );

  if (!isHost && !isParticipant && !isGroupMember && !isInvitedGuest) {
    throw forbidden('No tenés acceso a esta juntada', 'SESSION_ACCESS_DENIED');
  }

  const isGroupAdmin =
    !scope?.isGuest && session.group?.members[0]?.role === GroupRole.admin;

  const goingIds = session.participants
    .filter((p) => p.rsvp === RsvpStatus.going)
    .map((p) => p.userId);
  const allParticipantIds = session.participants.map((p) => p.userId);
  const proposalGameIds = session.proposals.map((p) => p.gameId);

  const ownedRows =
    proposalGameIds.length > 0 && allParticipantIds.length > 0
      ? await prisma.userGame.findMany({
          where: {
            gameId: { in: proposalGameIds },
            userId: { in: allParticipantIds },
            status: UserGameStatus.owned,
          },
          include: { user: { select: USER_SUMMARY_SELECT } },
        })
      : [];

  const goingIdSet = new Set(goingIds);
  const ownersByGame = new Map<string, OwnerSummary[]>();
  const fallbackOwnersByGame = new Map<string, OwnerSummary[]>();

  for (const row of ownedRows) {
    const fallbackList = fallbackOwnersByGame.get(row.gameId) ?? [];
    fallbackList.push(row.user);
    fallbackOwnersByGame.set(row.gameId, fallbackList);

    if (goingIdSet.has(row.userId)) {
      const goingList = ownersByGame.get(row.gameId) ?? [];
      goingList.push(row.user);
      ownersByGame.set(row.gameId, goingList);
    }
  }

  const mappedProposals = session.proposals.map((p) => {
    const voteMetrics = scoreProposalVotes(p.votes, session.votingMode, userId);
    const owners =
      ownersByGame.get(p.gameId) ?? fallbackOwnersByGame.get(p.gameId) ?? [];

    return {
      id: p.id,
      note: p.note,
      status: p.status,
      acceptedAt: p.acceptedAt,
      acceptedBy: p.accepter,
      createdAt: p.createdAt,
      game: formatGame(p.game),
      proposedBy: p.proposer,
      owners,
      ...voteMetrics,
    };
  });

  const acceptedProposals = sortAcceptedProposals(
    mappedProposals.filter((p) => p.status === ProposalStatus.accepted),
  );
  const openProposals = sortScoredProposals(
    mappedProposals.filter((p) => p.status === ProposalStatus.open),
  );
  const orderedProposals = [...acceptedProposals, ...openProposals];

  const quota = computeUserVoteQuota(
    orderedProposals,
    session.votingMode,
    session.maxVotesPerUser,
  );

  return {
    id: session.id,
    groupId: session.groupId,
    groupName: session.group?.name ?? 'Invitación directa',
    title: session.title,
    scheduledAt: session.scheduledAt,
    location: session.location,
    status: session.status,
    votingMode: session.votingMode,
    maxVotesPerUser: session.maxVotesPerUser,
    inviteToken: session.inviteToken,
    host: session.host,
    canManageSession: !scope?.isGuest && (isHost || isGroupAdmin),
    confirmedCount: goingIds.length,
    userVotesUsed: quota.userVotesUsed,
    votesRemaining: quota.votesRemaining,
    lockedVotesCount: quota.lockedVotesCount,
    lockedRanks: quota.lockedRanks,
    participants: session.participants.map((p) => ({
      rsvp: p.rsvp,
      respondedAt: p.respondedAt,
      user: p.user,
    })),
    proposals: orderedProposals,
  };
}

export async function updateParticipantRsvp(
  userId: string,
  sessionId: string,
  rsvp: RsvpStatus,
  scope?: SessionAccessScope,
) {
  await assertSessionAccess(userId, sessionId, scope);

  await prisma.sessionParticipant.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    update: { rsvp, respondedAt: new Date() },
    create: { sessionId, userId, rsvp },
  });

  return getSessionDetail(userId, sessionId, scope);
}

export async function updateSessionStatus(
  userId: string,
  sessionId: string,
  status: SessionStatus,
) {
  const { isHost, isGroupAdmin } = await assertSessionAccess(userId, sessionId);
  if (!isHost && !isGroupAdmin) {
    throw forbidden(
      'Solo el anfitrión o un administrador del grupo puede cambiar el estado de la juntada',
      'SESSION_HOST_REQUIRED',
    );
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { status },
  });

  return getSessionDetail(userId, sessionId);
}

export async function getSessionCombinedPool(
  userId: string,
  sessionId: string,
  query: SessionPoolQuery,
  scope?: SessionAccessScope,
) {
  await assertSessionAccess(userId, sessionId, scope);

  const goingParticipants = await prisma.sessionParticipant.findMany({
    where: { sessionId, rsvp: RsvpStatus.going },
    select: { userId: true },
  });

  const goingUserIds = goingParticipants.map((p) => p.userId);
  const confirmedCount = goingUserIds.length;

  if (confirmedCount === 0) {
    return {
      confirmedCount: 0,
      onlyCompatible: query.onlyCompatible ?? true,
      includeExpansions: query.includeExpansions ?? false,
      total: 0,
      items: [],
    };
  }

  const onlyCompatible = query.onlyCompatible ?? true;
  const includeExpansions = query.includeExpansions ?? false;

  const gameWhere: Prisma.GameWhereInput = {};
  const gameAnd: Prisma.GameWhereInput[] = [];

  if (!includeExpansions) {
    gameWhere.isExpansion = false;
  }

  if (onlyCompatible) {
    gameAnd.push(
      { minPlayers: { lte: confirmedCount } },
      { maxPlayers: { gte: confirmedCount } },
    );
  }

  if (query.q) {
    gameWhere.name = { contains: query.q, mode: 'insensitive' };
  }

  if (query.maxPlayingTime !== undefined) {
    gameWhere.playingTimeMinutes = { lte: query.maxPlayingTime };
  }

  if (query.minWeight !== undefined || query.maxWeight !== undefined) {
    gameWhere.weight = {
      ...(query.minWeight !== undefined ? { gte: query.minWeight } : {}),
      ...(query.maxWeight !== undefined ? { lte: query.maxWeight } : {}),
    };
  }

  if (query.mechanicIds && query.mechanicIds.length > 0) {
    for (const mechanicId of query.mechanicIds) {
      gameAnd.push({
        mechanics: { some: { mechanicId } },
      });
    }
  }

  if (gameAnd.length > 0) {
    gameWhere.AND = gameAnd;
  }

  const [ownedRows, existingProposals] = await Promise.all([
    prisma.userGame.findMany({
      where: {
        userId: { in: goingUserIds },
        status: UserGameStatus.owned,
        game: gameWhere,
      },
      include: {
        user: { select: USER_SUMMARY_SELECT },
        game: { include: GAME_WITH_MECHANICS_INCLUDE },
      },
    }),
    prisma.sessionProposal.findMany({
      where: { sessionId },
      select: { gameId: true, status: true },
    }),
  ]);

  const proposalStatusByGameId = new Map(
    existingProposals.map((p) => [p.gameId, p.status]),
  );
  const items = aggregateCombinedPool(
    ownedRows.map((row) => ({
      user: row.user,
      game: formatGame(row.game),
    })),
    proposalStatusByGameId,
    {
      confirmedCount,
      onlyCompatible,
      includeExpansions,
    },
  );

  return {
    confirmedCount,
    onlyCompatible,
    includeExpansions,
    total: items.length,
    items,
  };
}

export async function proposeGameForSession(
  userId: string,
  sessionId: string,
  input: CreateProposalInput,
  scope?: SessionAccessScope,
) {
  const { session } = await assertSessionAccess(userId, sessionId, scope);

  if (
    session.status === SessionStatus.locked ||
    session.status === SessionStatus.completed ||
    session.status === SessionStatus.cancelled
  ) {
    throw badRequest(
      'La votación está cerrada y no se pueden agregar nuevas propuestas',
      undefined,
      'SESSION_VOTING_CLOSED',
    );
  }

  const game = await prisma.game.findUnique({
    where: { id: input.gameId },
    select: { id: true },
  });

  if (!game) {
    throw notFound('El juego seleccionado no existe en el catálogo', 'GAME_NOT_FOUND');
  }

  const existing = await prisma.sessionProposal.findUnique({
    where: {
      sessionId_gameId: { sessionId, gameId: input.gameId },
    },
    select: { id: true },
  });

  if (existing) {
    throw conflict('Ese juego ya fue propuesto en esta juntada', 'DUPLICATE_PROPOSAL');
  }

  if (scope?.isGuest) {
    await prisma.sessionParticipant.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      update: {},
      create: { sessionId, userId, rsvp: RsvpStatus.going },
    });
  }

  await prisma.sessionProposal.create({
    data: {
      sessionId,
      gameId: input.gameId,
      proposedBy: userId,
      note: input.note ?? null,
    },
  });

  return getSessionDetail(userId, sessionId, scope);
}

export async function updateProposalStatus(
  userId: string,
  sessionId: string,
  proposalId: string,
  status: ProposalStatus,
) {
  const { session, isHost, isGroupAdmin } = await assertSessionAccess(userId, sessionId);
  if (!isHost && !isGroupAdmin) {
    throw forbidden(
      'Solo el anfitrión o un administrador del grupo puede aceptar o devolver juegos a votación',
      'SESSION_HOST_REQUIRED',
    );
  }

  if (
    session.status === SessionStatus.completed ||
    session.status === SessionStatus.cancelled
  ) {
    throw badRequest(
      'No se pueden modificar los juegos confirmados en una juntada finalizada o cancelada',
      undefined,
      'SESSION_CLOSED',
    );
  }

  const proposal = await prisma.sessionProposal.findFirst({
    where: { id: proposalId, sessionId },
    select: { id: true },
  });

  if (!proposal) {
    throw notFound('Propuesta no encontrada en esta juntada', 'PROPOSAL_NOT_FOUND');
  }

  await prisma.sessionProposal.update({
    where: { id: proposal.id },
    data:
      status === ProposalStatus.accepted
        ? {
            status: ProposalStatus.accepted,
            acceptedAt: new Date(),
            acceptedBy: userId,
          }
        : {
            status: ProposalStatus.open,
            acceptedAt: null,
            acceptedBy: null,
          },
  });

  return getSessionDetail(userId, sessionId);
}

export async function deleteSessionProposal(
  userId: string,
  sessionId: string,
  proposalId: string,
  scope?: SessionAccessScope,
) {
  const { session, isHost, isGroupAdmin } = await assertSessionAccess(
    userId,
    sessionId,
    scope,
  );

  if (session.status !== SessionStatus.voting && session.status !== SessionStatus.planning) {
    throw badRequest(
      'No se pueden eliminar propuestas cuando la votación está cerrada',
      undefined,
      'SESSION_VOTING_CLOSED',
    );
  }

  const proposal = await prisma.sessionProposal.findFirst({
    where: { id: proposalId, sessionId },
    select: { id: true, proposedBy: true, status: true },
  });

  if (!proposal) {
    throw notFound('Propuesta no encontrada', 'PROPOSAL_NOT_FOUND');
  }

  if (proposal.status === ProposalStatus.accepted) {
    throw badRequest(
      'Primero devolvé el juego a votación antes de quitar la propuesta',
      undefined,
      'PROPOSAL_ALREADY_ACCEPTED',
    );
  }

  if (proposal.proposedBy !== userId && !isHost && !isGroupAdmin) {
    throw forbidden(
      'Solo quien propuso el juego o el anfitrión pueden quitar la propuesta',
      'PROPOSAL_DELETE_FORBIDDEN',
    );
  }

  await prisma.sessionProposal.delete({ where: { id: proposal.id } });
  return getSessionDetail(userId, sessionId, scope);
}

export async function castVote(
  userId: string,
  sessionId: string,
  proposalId: string,
  rank: number,
  scope?: SessionAccessScope,
): Promise<SessionVotesSnapshot> {
  const [{ session, isParticipant }, proposals] = await Promise.all([
    assertSessionAccess(userId, sessionId, scope),
    prisma.sessionProposal.findMany({
      where: { sessionId },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        createdAt: true,
        votes: { select: { userId: true, rank: true } },
      },
    }),
  ]);

  if (session.status !== SessionStatus.voting && session.status !== SessionStatus.planning) {
    throw badRequest(
      'La votación está cerrada para esta juntada',
      undefined,
      'SESSION_VOTING_CLOSED',
    );
  }

  const targetProposal = proposals.find((p) => p.id === proposalId);

  if (!targetProposal) {
    throw notFound('Propuesta no encontrada en esta juntada', 'PROPOSAL_NOT_FOUND');
  }

  if (targetProposal.status === ProposalStatus.accepted) {
    throw badRequest(
      'Este juego ya está confirmado para la mesa y no admite cambios de voto',
      undefined,
      'PROPOSAL_ALREADY_ACCEPTED',
    );
  }

  const needsGuestParticipant = Boolean(scope?.isGuest && !isParticipant);

  if (session.votingMode === VotingMode.ranked_top3) {
    if (rank < 1 || rank > 3) {
      throw badRequest('En modo Top 3 el rank debe ser 1, 2 o 3', undefined, 'INVALID_RANK');
    }

    const hasLockedRankVote = proposals.some(
      (p) =>
        p.status === ProposalStatus.accepted &&
        p.votes.some((v) => v.userId === userId && v.rank === rank),
    );

    if (hasLockedRankVote) {
      throw badRequest(
        `Tu puesto ${rank}° ya se usó en un juego confirmado para la mesa`,
        { rank },
        'RANK_LOCKED_IN_ACCEPTED',
      );
    }

    const otherOpenWithSameRank = proposals.filter(
      (p) =>
        p.id !== proposalId &&
        p.status === ProposalStatus.open &&
        p.votes.some((v) => v.userId === userId && v.rank === rank),
    );

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (needsGuestParticipant) {
      ops.push(
        prisma.sessionParticipant.upsert({
          where: { sessionId_userId: { sessionId, userId } },
          update: {},
          create: { sessionId, userId, rsvp: RsvpStatus.going },
        }),
      );
    }
    if (otherOpenWithSameRank.length > 0) {
      ops.push(
        prisma.sessionVote.deleteMany({
          where: {
            userId,
            rank,
            proposalId: { in: otherOpenWithSameRank.map((p) => p.id) },
          },
        }),
      );
    }
    ops.push(
      prisma.sessionVote.upsert({
        where: { proposalId_userId: { proposalId, userId } },
        update: { rank },
        create: { proposalId, userId, rank },
      }),
    );

    if (ops.length === 1) {
      await ops[0];
    } else {
      await prisma.$transaction(ops);
    }

    for (const p of otherOpenWithSameRank) {
      p.votes = p.votes.filter((v) => !(v.userId === userId && v.rank === rank));
    }
    const existingVote = targetProposal.votes.find((v) => v.userId === userId);
    if (existingVote) {
      existingVote.rank = rank;
    } else {
      targetProposal.votes.push({ userId, rank });
    }

    return buildVotesSnapshot(
      sessionId,
      session.votingMode,
      session.maxVotesPerUser,
      userId,
      proposals,
    );
  }

  if (session.votingMode === VotingMode.single_choice) {
    const hasLockedVote = proposals.some(
      (p) =>
        p.status === ProposalStatus.accepted &&
        p.votes.some((v) => v.userId === userId),
    );

    if (hasLockedVote) {
      throw badRequest(
        'Tu voto ya se usó en un juego confirmado para la mesa',
        undefined,
        'VOTE_LOCKED_IN_ACCEPTED',
      );
    }

    const otherOpenWithUserVote = proposals.filter(
      (p) =>
        p.id !== proposalId &&
        p.status === ProposalStatus.open &&
        p.votes.some((v) => v.userId === userId),
    );

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (needsGuestParticipant) {
      ops.push(
        prisma.sessionParticipant.upsert({
          where: { sessionId_userId: { sessionId, userId } },
          update: {},
          create: { sessionId, userId, rsvp: RsvpStatus.going },
        }),
      );
    }
    if (otherOpenWithUserVote.length > 0) {
      ops.push(
        prisma.sessionVote.deleteMany({
          where: {
            userId,
            proposalId: { in: otherOpenWithUserVote.map((p) => p.id) },
          },
        }),
      );
    }
    ops.push(
      prisma.sessionVote.upsert({
        where: { proposalId_userId: { proposalId, userId } },
        update: { rank: 1 },
        create: { proposalId, userId, rank: 1 },
      }),
    );

    if (ops.length === 1) {
      await ops[0];
    } else {
      await prisma.$transaction(ops);
    }

    for (const p of otherOpenWithUserVote) {
      p.votes = p.votes.filter((v) => v.userId !== userId);
    }
    const existingVote = targetProposal.votes.find((v) => v.userId === userId);
    if (existingVote) {
      existingVote.rank = 1;
    } else {
      targetProposal.votes.push({ userId, rank: 1 });
    }

    return buildVotesSnapshot(
      sessionId,
      session.votingMode,
      session.maxVotesPerUser,
      userId,
      proposals,
    );
  }

  // multi_vote: votes on accepted proposals remain consumed and count toward maxVotesPerUser
  const alreadyVotedTarget = targetProposal.votes.some((v) => v.userId === userId);
  if (alreadyVotedTarget) {
    if (needsGuestParticipant) {
      await prisma.sessionParticipant.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        update: {},
        create: { sessionId, userId, rsvp: RsvpStatus.going },
      });
    }
    return buildVotesSnapshot(
      sessionId,
      session.votingMode,
      session.maxVotesPerUser,
      userId,
      proposals,
    );
  }

  const currentVoteCount = proposals.reduce(
    (sum, p) => sum + (p.votes.some((v) => v.userId === userId) ? 1 : 0),
    0,
  );

  if (currentVoteCount >= session.maxVotesPerUser) {
    throw badRequest(
      `Ya usaste el máximo de ${session.maxVotesPerUser} votos en esta juntada`,
      { maxVotesPerUser: session.maxVotesPerUser },
      'MAX_VOTES_REACHED',
    );
  }

  try {
    if (needsGuestParticipant) {
      await prisma.$transaction([
        prisma.sessionParticipant.upsert({
          where: { sessionId_userId: { sessionId, userId } },
          update: {},
          create: { sessionId, userId, rsvp: RsvpStatus.going },
        }),
        prisma.sessionVote.create({
          data: { proposalId, userId, rank: 1 },
        }),
      ]);
    } else {
      await prisma.sessionVote.create({
        data: { proposalId, userId, rank: 1 },
      });
    }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
  }

  targetProposal.votes.push({ userId, rank: 1 });

  return buildVotesSnapshot(
    sessionId,
    session.votingMode,
    session.maxVotesPerUser,
    userId,
    proposals,
  );
}

export async function removeVote(
  userId: string,
  sessionId: string,
  proposalId: string,
  scope?: SessionAccessScope,
): Promise<SessionVotesSnapshot> {
  const [{ session }, proposals] = await Promise.all([
    assertSessionAccess(userId, sessionId, scope),
    prisma.sessionProposal.findMany({
      where: { sessionId },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        createdAt: true,
        votes: { select: { userId: true, rank: true } },
      },
    }),
  ]);

  if (session.status !== SessionStatus.voting && session.status !== SessionStatus.planning) {
    throw badRequest(
      'La votación está cerrada para esta juntada',
      undefined,
      'SESSION_VOTING_CLOSED',
    );
  }

  const targetProposal = proposals.find((p) => p.id === proposalId);

  if (!targetProposal) {
    throw notFound('Propuesta no encontrada en esta juntada', 'PROPOSAL_NOT_FOUND');
  }

  if (targetProposal.status === ProposalStatus.accepted) {
    throw badRequest(
      'No podés quitar tu voto de un juego que ya fue confirmado para la mesa',
      undefined,
      'PROPOSAL_ALREADY_ACCEPTED',
    );
  }

  const hadVote = targetProposal.votes.some((v) => v.userId === userId);
  if (hadVote) {
    await prisma.sessionVote.deleteMany({
      where: {
        proposalId,
        userId,
      },
    });
    targetProposal.votes = targetProposal.votes.filter((v) => v.userId !== userId);
  }

  return buildVotesSnapshot(
    sessionId,
    session.votingMode,
    session.maxVotesPerUser,
    userId,
    proposals,
  );
}
