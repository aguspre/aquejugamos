import { GroupRole, Prisma, UserGameStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { assertGroupMember } from '../groups/groups.service.js';
import { assertSessionAccess } from '../sessions/sessions.service.js';
import type { CreatePlayLogInput, ListPlayLogsQuery } from './play-logs.schemas.js';

const USER_SUMMARY_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
  bggUsername: true,
} as const;

const PLAY_LOG_INCLUDE = {
  game: {
    select: {
      id: true,
      bggId: true,
      name: true,
      yearPublished: true,
      imageUrl: true,
      thumbnailUrl: true,
      playingTimeMinutes: true,
      weight: true,
      bggRating: true,
    },
  },
  session: {
    select: {
      id: true,
      title: true,
    },
  },
  group: {
    select: {
      id: true,
      name: true,
    },
  },
  creator: {
    select: USER_SUMMARY_SELECT,
  },
  players: {
    include: {
      user: { select: USER_SUMMARY_SELECT },
    },
  },
} as const;

type PlayLogWithRelations = Prisma.PlayLogGetPayload<{
  include: typeof PLAY_LOG_INCLUDE;
}>;

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value !== null && value !== undefined ? Number(value) : null;
}

function formatPlayLog(log: PlayLogWithRelations) {
  const sortedPlayers = [...log.players].sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    return (b.score ?? -Infinity) - (a.score ?? -Infinity);
  });

  return {
    id: log.id,
    sessionId: log.sessionId,
    sessionTitle: log.session?.title ?? null,
    groupId: log.groupId,
    groupName: log.group?.name ?? null,
    playedAt: log.playedAt,
    durationMinutes: log.durationMinutes,
    notes: log.notes,
    createdBy: log.creator,
    game: {
      ...log.game,
      weight: decimalToNumber(log.game.weight),
      bggRating: decimalToNumber(log.game.bggRating),
    },
    players: sortedPlayers.map((p) => ({
      score: p.score,
      isWinner: p.isWinner,
      user: p.user,
    })),
  };
}

export async function listPlayLogs(userId: string, query: ListPlayLogsQuery) {
  if (query.groupId) {
    await assertGroupMember(userId, query.groupId);
  }
  if (query.sessionId) {
    await assertSessionAccess(userId, query.sessionId);
  }

  const userGroupIds = (
    await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    })
  ).map((m) => m.groupId);

  const logs = await prisma.playLog.findMany({
    where: {
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.gameId ? { gameId: query.gameId } : {}),
      ...(!query.groupId && !query.sessionId
        ? {
            OR: [
              { createdBy: userId },
              { players: { some: { userId } } },
              ...(userGroupIds.length > 0 ? [{ groupId: { in: userGroupIds } }] : []),
            ],
          }
        : {}),
    },
    include: PLAY_LOG_INCLUDE,
    orderBy: [{ playedAt: 'desc' }, { createdAt: 'desc' }],
    take: query.limit,
  });

  return logs.map(formatPlayLog);
}

export async function createPlayLog(userId: string, input: CreatePlayLogInput) {
  let resolvedGroupId = input.groupId ?? null;

  if (input.sessionId) {
    const { session } = await assertSessionAccess(userId, input.sessionId);
    if (!resolvedGroupId && session.groupId) {
      resolvedGroupId = session.groupId;
    }
  }

  if (resolvedGroupId) {
    await assertGroupMember(userId, resolvedGroupId);
  }

  const game = await prisma.game.findUnique({
    where: { id: input.gameId },
    select: { id: true, playingTimeMinutes: true },
  });

  if (!game) {
    throw notFound('Juego no encontrado', 'GAME_NOT_FOUND');
  }

  // Deduplicate players by userId
  const uniquePlayersMap = new Map(input.players.map((p) => [p.userId, p]));
  const playerIds = Array.from(uniquePlayersMap.keys());

  const existingUsers = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: { id: true },
  });

  if (existingUsers.length !== playerIds.length) {
    throw badRequest(
      'Uno o más jugadores seleccionados no existen',
      undefined,
      'INVALID_PLAYER_IDS',
    );
  }

  const created = await prisma.playLog.create({
    data: {
      sessionId: input.sessionId ?? null,
      groupId: resolvedGroupId,
      gameId: input.gameId,
      playedAt: input.playedAt ?? new Date(),
      durationMinutes: input.durationMinutes ?? game.playingTimeMinutes ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
      players: {
        createMany: {
          data: Array.from(uniquePlayersMap.values()).map((p) => ({
            userId: p.userId,
            score: p.score ?? null,
            isWinner: p.isWinner ?? false,
          })),
        },
      },
    },
    include: PLAY_LOG_INCLUDE,
  });

  return formatPlayLog(created);
}

export async function deletePlayLog(userId: string, playLogId: string): Promise<void> {
  const log = await prisma.playLog.findUnique({
    where: { id: playLogId },
    select: { id: true, createdBy: true, groupId: true },
  });

  if (!log) {
    throw notFound('Partida no encontrada', 'PLAY_LOG_NOT_FOUND');
  }

  let canDelete = log.createdBy === userId;

  if (!canDelete && log.groupId) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: log.groupId, userId } },
      select: { role: true },
    });
    canDelete = membership?.role === GroupRole.admin;
  }

  if (!canDelete) {
    throw forbidden(
      'Solo quien registró la partida o un administrador del grupo puede eliminarla',
      'PLAY_LOG_DELETE_FORBIDDEN',
    );
  }

  await prisma.playLog.delete({ where: { id: playLogId } });
}

export async function getGroupStats(userId: string, groupId: string) {
  await assertGroupMember(userId, groupId);

  const [members, logs] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: USER_SUMMARY_SELECT } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.playLog.findMany({
      where: { groupId },
      include: {
        game: {
          select: {
            id: true,
            bggId: true,
            name: true,
            thumbnailUrl: true,
            imageUrl: true,
          },
        },
        players: {
          select: { userId: true, isWinner: true },
        },
      },
      orderBy: { playedAt: 'desc' },
    }),
  ]);

  const memberIds = members.map((m) => m.userId);

  const ownedRows =
    memberIds.length > 0
      ? await prisma.userGame.findMany({
          where: {
            userId: { in: memberIds },
            status: UserGameStatus.owned,
            game: { isExpansion: false },
          },
          include: {
            user: { select: USER_SUMMARY_SELECT },
            game: {
              select: {
                id: true,
                bggId: true,
                name: true,
                yearPublished: true,
                thumbnailUrl: true,
                imageUrl: true,
                minPlayers: true,
                maxPlayers: true,
                playingTimeMinutes: true,
                weight: true,
                bggRating: true,
              },
            },
          },
        })
      : [];

  let totalDurationMinutes = 0;
  const playsByGame = new Map<
    string,
    {
      game: (typeof logs)[number]['game'];
      playCount: number;
      lastPlayedAt: Date;
    }
  >();

  const playerStats = new Map<string, { playedCount: number; winsCount: number }>();
  for (const m of members) {
    playerStats.set(m.userId, { playedCount: 0, winsCount: 0 });
  }

  for (const log of logs) {
    totalDurationMinutes += log.durationMinutes ?? 0;

    const existingGame = playsByGame.get(log.gameId);
    if (existingGame) {
      existingGame.playCount += 1;
      if (log.playedAt > existingGame.lastPlayedAt) {
        existingGame.lastPlayedAt = log.playedAt;
      }
    } else {
      playsByGame.set(log.gameId, {
        game: log.game,
        playCount: 1,
        lastPlayedAt: log.playedAt,
      });
    }

    for (const p of log.players) {
      const current = playerStats.get(p.userId);
      if (current) {
        current.playedCount += 1;
        if (p.isWinner) current.winsCount += 1;
      }
    }
  }

  const mostPlayedGames = Array.from(playsByGame.values())
    .sort(
      (a, b) =>
        b.playCount - a.playCount || b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime(),
    )
    .slice(0, 10);

  const winLeaderboard = members
    .map((m) => {
      const st = playerStats.get(m.userId) ?? { playedCount: 0, winsCount: 0 };
      const winRate =
        st.playedCount > 0 ? Math.round((st.winsCount / st.playedCount) * 100) : 0;
      return {
        user: m.user,
        playedCount: st.playedCount,
        winsCount: st.winsCount,
        winRate,
      };
    })
    .sort((a, b) => b.winsCount - a.winsCount || b.winRate - a.winRate);

  const playedGameIds = new Set(logs.map((l) => l.gameId));
  const unplayedMap = new Map<
    string,
    {
      game: {
        id: string;
        bggId: number;
        name: string;
        yearPublished: number | null;
        thumbnailUrl: string | null;
        imageUrl: string | null;
        minPlayers: number | null;
        maxPlayers: number | null;
        playingTimeMinutes: number | null;
        weight: number | null;
        bggRating: number | null;
      };
      owners: (typeof members)[number]['user'][];
    }
  >();

  for (const row of ownedRows) {
    if (playedGameIds.has(row.gameId)) continue;
    const existing = unplayedMap.get(row.gameId);
    if (!existing) {
      unplayedMap.set(row.gameId, {
        game: {
          ...row.game,
          weight: decimalToNumber(row.game.weight),
          bggRating: decimalToNumber(row.game.bggRating),
        },
        owners: [row.user],
      });
    } else if (!existing.owners.some((o) => o.id === row.user.id)) {
      existing.owners.push(row.user);
    }
  }

  const shelfOfShame = Array.from(unplayedMap.values()).sort(
    (a, b) =>
      (b.game.bggRating ?? 0) - (a.game.bggRating ?? 0) ||
      a.game.name.localeCompare(b.game.name, 'es'),
  );

  return {
    groupId,
    totalPlays: logs.length,
    totalDurationMinutes,
    mostPlayedGames,
    winLeaderboard,
    shelfOfShame,
  };
}
