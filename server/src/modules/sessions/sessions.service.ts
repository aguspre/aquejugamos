import {
  GroupRole,
  Prisma,
  ProposalStatus,
  RecurrenceFrequency,
  RsvpStatus,
  SessionStatus,
  UserGameStatus,
  VotingMode,
} from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { generateSessionInviteToken } from '../../utils/tokens.js';
import { assertGroupMember } from '../groups/groups.service.js';
import {
  computeNextOccurrenceDate,
  isOccurrencePastRollover,
  SERIES_ROLLOVER_GRACE_MS,
} from './sessions.recurrence.js';
import type {
  CreateProposalInput,
  CreateSessionInput,
  ListSessionsQuery,
  SessionPoolQuery,
  UpdateSeriesInput,
  UpdateSessionInput,
} from './sessions.schemas.js';
import {
  aggregateCombinedPool,
  computeUserProposalQuota,
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

  const isGroupMember = (session.group?.members.length ?? 0) > 0;
  const isHost =
    session.hostId === userId && (!session.groupId || isGroupMember);
  const isParticipant = session.participants.length > 0;
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

const SERIES_SUMMARY_SELECT = {
  id: true,
  frequency: true,
  shareToken: true,
  isActive: true,
} as const;

/** El token fijo de la serie solo se expone a miembros activos del grupo (no a invitados ni ex-miembros). */
function exposeSeriesSummary<T extends { shareToken: string }>(
  series: T | null | undefined,
  canSeeShareToken: boolean,
): (Omit<T, 'shareToken'> & { shareToken: string | null }) | null {
  if (!series) return null;
  return { ...series, shareToken: canSeeShareToken ? series.shareToken : null };
}

const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.planning,
  SessionStatus.voting,
  SessionStatus.locked,
];

interface LockedSeriesRow {
  id: string;
  group_id: string;
  host_id: string;
  title: string;
  location: string | null;
  frequency: RecurrenceFrequency;
  voting_mode: VotingMode;
  max_votes_per_user: number;
  max_proposals_per_user: number | null;
  share_token: string;
  is_active: boolean;
}

async function createNextOccurrenceInTx(
  tx: Prisma.TransactionClient,
  series: LockedSeriesRow,
  anchorDate: Date,
  now: Date,
): Promise<string | null> {
  const members = await tx.groupMember.findMany({
    where: { groupId: series.group_id },
    select: { userId: true, role: true },
    orderBy: { joinedAt: 'asc' },
  });

  if (members.length === 0) {
    return null;
  }

  const resolvedHostId = members.some((m) => m.userId === series.host_id)
    ? series.host_id
    : (members.find((m) => m.role === GroupRole.admin)?.userId ?? members[0]!.userId);

  const nextScheduledAt = computeNextOccurrenceDate(anchorDate, series.frequency, now);
  const created = await tx.session.create({
    data: {
      groupId: series.group_id,
      seriesId: series.id,
      hostId: resolvedHostId,
      title: series.title,
      scheduledAt: nextScheduledAt,
      location: series.location,
      status: SessionStatus.voting,
      votingMode: series.voting_mode,
      maxVotesPerUser: series.max_votes_per_user,
      maxProposalsPerUser: series.max_proposals_per_user,
      inviteToken: generateSessionInviteToken(),
      participants: {
        createMany: {
          data: members.map((m) => ({
            userId: m.userId,
            rsvp: m.userId === resolvedHostId ? RsvpStatus.going : RsvpStatus.maybe,
          })),
          skipDuplicates: true,
        },
      },
    },
    select: { id: true },
  });

  return created.id;
}

export async function ensureActiveSeriesSession(
  seriesId: string,
  now: Date = new Date(),
): Promise<{
  series: {
    id: string;
    groupId: string;
    frequency: RecurrenceFrequency;
    shareToken: string;
    isActive: boolean;
  };
  activeSessionId: string | null;
  createdNew: boolean;
} | null> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedSeriesRow[]>`
        SELECT
          id,
          group_id,
          host_id,
          title,
          location,
          frequency,
          voting_mode,
          max_votes_per_user,
          max_proposals_per_user,
          share_token,
          is_active
        FROM session_series
        WHERE id = ${seriesId}::uuid
        FOR UPDATE
      `;

      const series = rows[0];
      if (!series) {
        return null;
      }

      const summary = {
        id: series.id,
        groupId: series.group_id,
        frequency: series.frequency,
        shareToken: series.share_token,
        isActive: series.is_active,
      };

      const activeOccurrences = await tx.session.findMany({
        where: {
          seriesId: series.id,
          status: { in: ACTIVE_SESSION_STATUSES },
        },
        select: { id: true, scheduledAt: true },
        orderBy: { scheduledAt: 'asc' },
      });

      const expired = activeOccurrences.filter((s) =>
        isOccurrencePastRollover(s.scheduledAt, now),
      );
      const upcoming = activeOccurrences.filter(
        (s) => !isOccurrencePastRollover(s.scheduledAt, now),
      );

      if (expired.length > 0) {
        await tx.session.updateMany({
          where: {
            id: { in: expired.map((s) => s.id) },
            status: { in: ACTIVE_SESSION_STATUSES },
          },
          data: { status: SessionStatus.completed },
        });
      }

      if (upcoming.length > 0) {
        return {
          series: summary,
          activeSessionId: upcoming[0]!.id,
          createdNew: false,
        };
      }

      const latestSession = await tx.session.findFirst({
        where: { seriesId: series.id },
        select: { id: true, scheduledAt: true },
        orderBy: { scheduledAt: 'desc' },
      });

      if (!series.is_active) {
        return {
          series: summary,
          activeSessionId: latestSession?.id ?? null,
          createdNew: false,
        };
      }

      const anchorDate = latestSession?.scheduledAt ?? now;
      const createdId = await createNextOccurrenceInTx(tx, series, anchorDate, now);

      return {
        series: summary,
        activeSessionId: createdId ?? latestSession?.id ?? null,
        createdNew: Boolean(createdId),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
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

    // Roll over any active recurring series in the user's groups whose occurrence passed
    const rolloverCutoff = new Date(Date.now() - SERIES_ROLLOVER_GRACE_MS);
    const staleSeries = await prisma.sessionSeries.findMany({
      where: {
        isActive: true,
        ...(query.groupId ? { groupId: query.groupId } : {}),
        group: { members: { some: { userId } } },
        NOT: {
          sessions: {
            some: {
              status: { in: ACTIVE_SESSION_STATUSES },
              scheduledAt: { gt: rolloverCutoff },
            },
          },
        },
      },
      select: { id: true },
      take: 10,
    });

    for (const s of staleSeries) {
      await ensureActiveSeriesSession(s.id);
    }

    accessOr = [
      { hostId: userId, groupId: null },
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
      series: { select: SERIES_SUMMARY_SELECT },
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
      maxProposalsPerUser: session.maxProposalsPerUser,
      inviteToken: session.inviteToken,
      series: exposeSeriesSummary(
        session.series,
        !scope?.isGuest && (session.group?.members.length ?? 0) > 0,
      ),
      host: session.host,
      canManageSession:
        !scope?.isGuest &&
        ((session.hostId === userId &&
          (!session.groupId || (session.group?.members.length ?? 0) > 0)) ||
          session.group?.members[0]?.role === GroupRole.admin),
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

  const createdSessionId = await prisma.$transaction(async (tx) => {
    let seriesId: string | null = null;

    if (input.recurrenceFrequency && input.groupId) {
      const series = await tx.sessionSeries.create({
        data: {
          groupId: input.groupId,
          hostId: userId,
          title: input.title,
          location: input.location ?? null,
          frequency: input.recurrenceFrequency,
          votingMode: input.votingMode,
          maxVotesPerUser: normalizedMaxVotes,
          maxProposalsPerUser: input.maxProposalsPerUser ?? null,
          shareToken: generateSessionInviteToken(),
          isActive: true,
        },
        select: { id: true },
      });
      seriesId = series.id;
    }

    const created = await tx.session.create({
      data: {
        groupId: input.groupId ?? null,
        seriesId,
        hostId: userId,
        title: input.title,
        scheduledAt: input.scheduledAt,
        location: input.location ?? null,
        status: input.status,
        votingMode: input.votingMode,
        maxVotesPerUser: normalizedMaxVotes,
        maxProposalsPerUser: input.maxProposalsPerUser ?? null,
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

    return created.id;
  });

  return getSessionDetail(userId, createdSessionId);
}

export async function joinSeriesByShareToken(
  userId: string,
  shareToken: string,
  rsvp: RsvpStatus,
) {
  const series = await prisma.sessionSeries.findUnique({
    where: { shareToken },
    select: { id: true, groupId: true, isActive: true },
  });

  if (!series) {
    throw notFound(
      'Link de juntada recurrente inválido o inexistente',
      'SERIES_NOT_FOUND',
    );
  }

  const joinerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: series.groupId, userId } },
    select: { role: true },
  });

  if (!series.isActive && !joinerMembership) {
    throw badRequest(
      'Esta juntada recurrente está pausada y no admite nuevos ingresos',
      undefined,
      'SERIES_PAUSED',
    );
  }

  const ensured = await ensureActiveSeriesSession(series.id);
  if (!ensured?.activeSessionId) {
    throw notFound(
      'No hay ninguna juntada disponible en esta serie',
      'SESSION_NOT_FOUND',
    );
  }

  const activeSession = await prisma.session.findUnique({
    where: { id: ensured.activeSessionId },
    select: { id: true, status: true },
  });

  if (!activeSession) {
    throw notFound('Juntada no encontrada', 'SESSION_NOT_FOUND');
  }

  const isClosed =
    activeSession.status === SessionStatus.cancelled ||
    activeSession.status === SessionStatus.completed;

  if (!isClosed) {
    await prisma.sessionParticipant.upsert({
      where: {
        sessionId_userId: { sessionId: activeSession.id, userId },
      },
      update: {
        rsvp,
        respondedAt: new Date(),
      },
      create: {
        sessionId: activeSession.id,
        userId,
        rsvp,
      },
    });
  } else {
    // If paused & closed, allow group members to view the last archived occurrence
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: series.groupId, userId } },
      select: { role: true },
    });
    if (!membership) {
      throw badRequest(
        'Esta juntada recurrente está pausada y no tiene próximas fechas abiertas',
        undefined,
        'SERIES_PAUSED',
      );
    }
  }

  return getSessionDetail(userId, activeSession.id);
}

export async function advanceSeriesToNextOccurrence(
  userId: string,
  seriesId: string,
) {
  const nextSessionId = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedSeriesRow[]>`
        SELECT
          id,
          group_id,
          host_id,
          title,
          location,
          frequency,
          voting_mode,
          max_votes_per_user,
          max_proposals_per_user,
          share_token,
          is_active
        FROM session_series
        WHERE id = ${seriesId}::uuid
        FOR UPDATE
      `;

      const series = rows[0];
      if (!series) {
        throw notFound('Serie recurrente no encontrada', 'SERIES_NOT_FOUND');
      }

      const membership = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId: series.group_id, userId } },
        select: { role: true },
      });

      const isActiveHost = series.host_id === userId && Boolean(membership);
      const isGroupAdmin = membership?.role === GroupRole.admin;
      if (!isActiveHost && !isGroupAdmin) {
        throw forbidden(
          'Solo el anfitrión o un administrador del grupo puede avanzar la serie recurrente',
          'SESSION_HOST_REQUIRED',
        );
      }

      if (!series.is_active) {
        throw badRequest(
          'La recurrencia está pausada. Reactivala para generar la próxima fecha.',
          undefined,
          'SERIES_PAUSED',
        );
      }

      const latest = await tx.session.findFirst({
        where: { seriesId: series.id },
        select: { scheduledAt: true },
        orderBy: { scheduledAt: 'desc' },
      });

      await tx.session.updateMany({
        where: {
          seriesId: series.id,
          status: { in: ACTIVE_SESSION_STATUSES },
        },
        data: { status: SessionStatus.completed },
      });

      const now = new Date();
      const createdId = await createNextOccurrenceInTx(
        tx,
        series,
        latest?.scheduledAt ?? now,
        now,
      );

      if (!createdId) {
        throw badRequest(
          'El grupo no tiene miembros activos para generar la próxima juntada',
          undefined,
          'GROUP_HAS_NO_MEMBERS',
        );
      }

      return createdId;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  return getSessionDetail(userId, nextSessionId);
}

export async function updateSessionSeries(
  userId: string,
  seriesId: string,
  input: UpdateSeriesInput,
) {
  const updatedSeries = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; group_id: string; host_id: string; is_active: boolean }[]
      >`
        SELECT id, group_id, host_id, is_active
        FROM session_series
        WHERE id = ${seriesId}::uuid
        FOR UPDATE
      `;

      const series = rows[0];
      if (!series) {
        throw notFound('Serie recurrente no encontrada', 'SERIES_NOT_FOUND');
      }

      const membership = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId: series.group_id, userId } },
        select: { role: true },
      });

      const isActiveHost = series.host_id === userId && Boolean(membership);
      const isGroupAdmin = membership?.role === GroupRole.admin;
      if (!isActiveHost && !isGroupAdmin) {
        throw forbidden(
          'Solo el anfitrión o un administrador del grupo puede modificar la recurrencia',
          'SESSION_HOST_REQUIRED',
        );
      }

      return tx.sessionSeries.update({
        where: { id: seriesId },
        data: {
          ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SERIES_SUMMARY_SELECT,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  let activeSessionId: string | null = null;
  if (updatedSeries.isActive) {
    const ensured = await ensureActiveSeriesSession(updatedSeries.id);
    activeSessionId = ensured?.activeSessionId ?? null;
  }

  return {
    series: updatedSeries,
    activeSessionId,
  };
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
      series: { select: SERIES_SUMMARY_SELECT },
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

  const isGroupMember = (session.group?.members.length ?? 0) > 0;
  const isHost =
    session.hostId === userId && (!session.groupId || isGroupMember);
  const isParticipant = session.participants.some((p) => p.userId === userId);
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

  const canViewAllSeriesHistory =
    isGroupMember ||
    Boolean(
      scope?.isGuest &&
        scope.guestGroupId &&
        session.groupId === scope.guestGroupId,
    );
  const canQuerySeriesHistory = Boolean(
    session.seriesId && (canViewAllSeriesHistory || !scope?.isGuest),
  );

  const [ownedRows, siblingOccurrences] = await Promise.all([
    proposalGameIds.length > 0 && allParticipantIds.length > 0
      ? prisma.userGame.findMany({
          where: {
            gameId: { in: proposalGameIds },
            userId: { in: allParticipantIds },
            status: UserGameStatus.owned,
          },
          include: { user: { select: USER_SUMMARY_SELECT } },
        })
      : Promise.resolve([]),
    canQuerySeriesHistory && session.seriesId
      ? prisma.session.findMany({
          where: canViewAllSeriesHistory
            ? {
                seriesId: session.seriesId,
                id: { not: session.id },
              }
            : {
                seriesId: session.seriesId,
                id: { not: session.id },
                participants: { some: { userId } },
              },
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            status: true,
            participants: {
              where: { rsvp: RsvpStatus.going },
              select: { userId: true },
            },
            proposals: {
              where: { status: ProposalStatus.accepted },
              select: { game: { select: { name: true } } },
              orderBy: { acceptedAt: 'asc' },
            },
          },
          orderBy: { scheduledAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

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
  const proposalQuota = computeUserProposalQuota(
    session.proposals.map((p) => ({ proposedById: p.proposedBy })),
    userId,
    session.maxProposalsPerUser,
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
    maxProposalsPerUser: proposalQuota.maxProposalsPerUser,
    userProposalsCount: proposalQuota.userProposalsCount,
    proposalsRemaining: proposalQuota.proposalsRemaining,
    inviteToken: session.inviteToken,
    series: exposeSeriesSummary(session.series, !scope?.isGuest && isGroupMember),
    seriesHistory: siblingOccurrences.map((occ) => ({
      id: occ.id,
      title: occ.title,
      scheduledAt: occ.scheduledAt,
      status: occ.status,
      confirmedCount: occ.participants.length,
      acceptedGames: occ.proposals.map((p) => p.game.name),
    })),
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

async function lockAndAssertSessionManager(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  forbiddenMessage: string,
) {
  const sessionRows = await tx.$queryRaw<
    {
      id: string;
      group_id: string | null;
      series_id: string | null;
      host_id: string;
      status: SessionStatus;
    }[]
  >`
    SELECT id, group_id, series_id, host_id, status
    FROM sessions
    WHERE id = ${sessionId}::uuid
    FOR UPDATE
  `;

  const lockedSession = sessionRows[0];
  if (!lockedSession) {
    throw notFound('Juntada no encontrada', 'SESSION_NOT_FOUND');
  }

  const membership = lockedSession.group_id
    ? await tx.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: lockedSession.group_id, userId },
        },
        select: { role: true },
      })
    : null;

  // For group sessions, a removed/kicked ex-member loses host privileges
  const isActiveHost =
    lockedSession.host_id === userId &&
    (!lockedSession.group_id || Boolean(membership));
  const isGroupAdmin = membership?.role === GroupRole.admin;

  if (!isActiveHost && !isGroupAdmin) {
    throw forbidden(forbiddenMessage, 'SESSION_HOST_REQUIRED');
  }

  return lockedSession;
}

export async function updateSession(
  userId: string,
  sessionId: string,
  input: UpdateSessionInput,
) {
  await prisma.$transaction(
    async (tx) => {
      const lockedSession = await lockAndAssertSessionManager(
        tx,
        userId,
        sessionId,
        'Solo el anfitrión o un administrador del grupo puede editar la juntada',
      );

      if (
        lockedSession.status === SessionStatus.completed ||
        lockedSession.status === SessionStatus.cancelled
      ) {
        throw badRequest(
          'No se puede editar una juntada finalizada o cancelada',
          undefined,
          'SESSION_CLOSED',
        );
      }

      await tx.session.update({
        where: { id: sessionId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.maxProposalsPerUser !== undefined
            ? { maxProposalsPerUser: input.maxProposalsPerUser }
            : {}),
        },
      });

      // Keep recurring series template in sync when editing an active occurrence
      if (
        lockedSession.series_id &&
        (input.title !== undefined ||
          input.location !== undefined ||
          input.maxProposalsPerUser !== undefined)
      ) {
        await tx.sessionSeries.update({
          where: { id: lockedSession.series_id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.location !== undefined ? { location: input.location } : {}),
            ...(input.maxProposalsPerUser !== undefined
              ? { maxProposalsPerUser: input.maxProposalsPerUser }
              : {}),
          },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  return getSessionDetail(userId, sessionId);
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockAndAssertSessionManager(
        tx,
        userId,
        sessionId,
        'Solo el anfitrión o un administrador del grupo puede eliminar la juntada',
      );

      // Participants, proposals, and votes cascade via FK; PlayLogs preserve history with sessionId = null.
      await tx.session.delete({
        where: { id: sessionId },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

export async function updateSessionStatus(
  userId: string,
  sessionId: string,
  status: SessionStatus,
) {
  await prisma.$transaction(
    async (tx) => {
      const lockedSession = await lockAndAssertSessionManager(
        tx,
        userId,
        sessionId,
        'Solo el anfitrión o un administrador del grupo puede cambiar el estado de la juntada',
      );

      if (lockedSession.status === status) {
        return;
      }

      if (lockedSession.status === SessionStatus.completed) {
        throw badRequest(
          'No se puede cambiar el estado de una juntada ya finalizada',
          undefined,
          'SESSION_CLOSED',
        );
      }

      if (
        lockedSession.status === SessionStatus.cancelled &&
        status !== SessionStatus.voting &&
        status !== SessionStatus.planning
      ) {
        throw badRequest(
          'Una juntada cancelada solo puede reabrirse a votación o planificación',
          undefined,
          'INVALID_STATUS_TRANSITION',
        );
      }

      await tx.session.update({
        where: { id: sessionId },
        data: { status },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

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
  await prisma.$transaction(
    async (tx) => {
      // Lock session row (FOR SHARE) so concurrent status changes cannot race with proposing
      const sessionRows = await tx.$queryRaw<
        {
          id: string;
          group_id: string | null;
          host_id: string;
          status: SessionStatus;
          max_proposals_per_user: number | null;
        }[]
      >`
      SELECT id, group_id, host_id, status, max_proposals_per_user
      FROM sessions
      WHERE id = ${sessionId}::uuid
      FOR SHARE
    `;

      const lockedSession = sessionRows[0];
      if (!lockedSession) {
        throw notFound('Juntada no encontrada', 'SESSION_NOT_FOUND');
      }

      const [participant, membership] = await Promise.all([
        tx.sessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId, userId } },
          select: { userId: true },
        }),
        lockedSession.group_id
          ? tx.groupMember.findUnique({
              where: {
                groupId_userId: { groupId: lockedSession.group_id, userId },
              },
              select: { role: true },
            })
          : Promise.resolve(null),
      ]);

      const isHost = lockedSession.host_id === userId;
      const isParticipant = Boolean(participant);
      const isGroupMember = Boolean(membership);
      const isInvitedGuest = Boolean(
        scope?.isGuest &&
          ((scope.guestGroupId && lockedSession.group_id === scope.guestGroupId) ||
            (scope.guestSessionId && lockedSession.id === scope.guestSessionId)),
      );

      if (!isHost && !isParticipant && !isGroupMember && !isInvitedGuest) {
        throw forbidden('No tenés acceso a esta juntada', 'SESSION_ACCESS_DENIED');
      }

      if (
        lockedSession.status !== SessionStatus.voting &&
        lockedSession.status !== SessionStatus.planning
      ) {
        throw badRequest(
          'La votación está cerrada y no se pueden agregar nuevas propuestas',
          undefined,
          'SESSION_VOTING_CLOSED',
        );
      }

      // Serialize concurrent proposals by the same user within this session when a limit applies.
      // Must use $executeRaw (not $queryRaw) because pg_advisory_xact_lock returns PostgreSQL void.
      if (lockedSession.max_proposals_per_user !== null) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${sessionId}), hashtext(${userId}))
        `;
      }

      const [game, existing, userProposalCount] = await Promise.all([
        tx.game.findUnique({
          where: { id: input.gameId },
          select: { id: true },
        }),
        tx.sessionProposal.findUnique({
          where: {
            sessionId_gameId: { sessionId, gameId: input.gameId },
          },
          select: { id: true },
        }),
        lockedSession.max_proposals_per_user !== null
          ? tx.sessionProposal.count({
              where: { sessionId, proposedBy: userId },
            })
          : Promise.resolve(0),
      ]);

      if (!game) {
        throw notFound('El juego seleccionado no existe en el catálogo', 'GAME_NOT_FOUND');
      }

      if (existing) {
        throw conflict('Ese juego ya fue propuesto en esta juntada', 'DUPLICATE_PROPOSAL');
      }

      if (
        lockedSession.max_proposals_per_user !== null &&
        userProposalCount >= lockedSession.max_proposals_per_user
      ) {
        const limit = lockedSession.max_proposals_per_user;
        throw badRequest(
          `Ya alcanzaste el límite de ${limit} ${limit === 1 ? 'propuesta' : 'propuestas'} por integrante en esta juntada`,
          {
            maxProposalsPerUser: limit,
            userProposalsCount: userProposalCount,
          },
          'MAX_PROPOSALS_REACHED',
        );
      }

      if (scope?.isGuest && !isParticipant) {
        await tx.sessionParticipant.upsert({
          where: { sessionId_userId: { sessionId, userId } },
          update: {},
          create: { sessionId, userId, rsvp: RsvpStatus.going },
        });
      }

      try {
        await tx.sessionProposal.create({
          data: {
            sessionId,
            gameId: input.gameId,
            proposedBy: userId,
            note: input.note ?? null,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw conflict('Ese juego ya fue propuesto en esta juntada', 'DUPLICATE_PROPOSAL');
        }
        throw error;
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

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

export interface DeleteSessionProposalResult {
  session: Awaited<ReturnType<typeof getSessionDetail>>;
  refundedVotesCount: number;
}

export async function deleteSessionProposal(
  userId: string,
  sessionId: string,
  proposalId: string,
  scope?: SessionAccessScope,
): Promise<DeleteSessionProposalResult> {
  const refundedVotesCount = await prisma.$transaction(async (tx) => {
    // Lock the session row (FOR SHARE) so concurrent status changes (e.g. locking/cancelling)
    // cannot race with proposal deletion.
    const sessionRows = await tx.$queryRaw<
      { id: string; group_id: string | null; host_id: string; status: SessionStatus }[]
    >`
      SELECT id, group_id, host_id, status
      FROM sessions
      WHERE id = ${sessionId}::uuid
      FOR SHARE
    `;

    const lockedSession = sessionRows[0];
    if (!lockedSession) {
      throw notFound('Juntada no encontrada', 'SESSION_NOT_FOUND');
    }

    const [participant, membership] = await Promise.all([
      tx.sessionParticipant.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
        select: { userId: true },
      }),
      lockedSession.group_id
        ? tx.groupMember.findUnique({
            where: {
              groupId_userId: { groupId: lockedSession.group_id, userId },
            },
            select: { role: true },
          })
        : Promise.resolve(null),
    ]);

    const isHost = lockedSession.host_id === userId;
    const isParticipant = Boolean(participant);
    const isGroupMember = Boolean(membership);
    const isInvitedGuest = Boolean(
      scope?.isGuest &&
        ((scope.guestGroupId && lockedSession.group_id === scope.guestGroupId) ||
          (scope.guestSessionId && lockedSession.id === scope.guestSessionId)),
    );

    if (!isHost && !isParticipant && !isGroupMember && !isInvitedGuest) {
      throw forbidden('No tenés acceso a esta juntada', 'SESSION_ACCESS_DENIED');
    }

    const isGroupAdmin = !scope?.isGuest && membership?.role === GroupRole.admin;

    if (
      lockedSession.status !== SessionStatus.voting &&
      lockedSession.status !== SessionStatus.planning
    ) {
      throw badRequest(
        'No se pueden eliminar propuestas cuando la votación está cerrada',
        undefined,
        'SESSION_VOTING_CLOSED',
      );
    }

    // Lock the proposal row (FOR UPDATE) to block concurrent accepts, double deletes,
    // and FK-checked vote inserts until the transaction commits.
    const proposalRows = await tx.$queryRaw<
      { id: string; proposed_by: string; status: ProposalStatus }[]
    >`
      SELECT id, proposed_by, status
      FROM session_proposals
      WHERE id = ${proposalId}::uuid AND session_id = ${sessionId}::uuid
      FOR UPDATE
    `;

    const proposal = proposalRows[0];
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

    if (proposal.proposed_by !== userId && !isHost && !isGroupAdmin) {
      throw forbidden(
        'Solo quien propuso el juego o el anfitrión pueden quitar la propuesta',
        'PROPOSAL_DELETE_FORBIDDEN',
      );
    }

    // Explicit delete under FOR UPDATE lock returns the exact refunded vote count atomically.
    const deletedVotes = await tx.sessionVote.deleteMany({
      where: { proposalId: proposal.id },
    });

    await tx.sessionProposal.delete({
      where: { id: proposal.id },
    });

    return deletedVotes.count;
  });

  const detail = await getSessionDetail(userId, sessionId, scope);
  return { session: detail, refundedVotesCount };
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
            proposal: { status: ProposalStatus.open },
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

    try {
      if (ops.length === 1) {
        await ops[0];
      } else {
        await prisma.$transaction(ops);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw notFound('Propuesta no encontrada en esta juntada', 'PROPOSAL_NOT_FOUND');
      }
      throw error;
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
            proposal: { status: ProposalStatus.open },
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

    try {
      if (ops.length === 1) {
        await ops[0];
      } else {
        await prisma.$transaction(ops);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw notFound('Propuesta no encontrada en esta juntada', 'PROPOSAL_NOT_FOUND');
      }
      throw error;
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw notFound('Propuesta no encontrada en esta juntada', 'PROPOSAL_NOT_FOUND');
    }
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
    const removed = await prisma.sessionVote.deleteMany({
      where: {
        proposalId,
        userId,
        proposal: { status: ProposalStatus.open },
      },
    });
    if (removed.count > 0) {
      targetProposal.votes = targetProposal.votes.filter((v) => v.userId !== userId);
    }
  }

  return buildVotesSnapshot(
    sessionId,
    session.votingMode,
    session.maxVotesPerUser,
    userId,
    proposals,
  );
}
