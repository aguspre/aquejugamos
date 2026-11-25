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

  const userGroupIds = !query.groupId && !query.sessionId
    ? (
        await prisma.groupMember.findMany({
          where: { userId },
          select: { groupId: true },
        })
      ).map((m) => m.groupId)
    : [];

  const logs = await prisma.playLog.findMany({
    relationLoadStrategy: 'join',
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
    relationLoadStrategy: 'join',
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

const SHELF_OF_SHAME_PREVIEW_LIMIT = 12;

export async function getGroupStats(userId: string, groupId: string) {
  await assertGroupMember(userId, groupId);

  const [
    members,
    totalsAgg,
    topGamesGrouped,
    playerWinRows,
    shelfTotalRows,
    shelfTopGameRows,
  ] = await Promise.all([
    prisma.groupMember.findMany({
      relationLoadStrategy: 'join',
      where: { groupId },
      include: { user: { select: USER_SUMMARY_SELECT } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.playLog.aggregate({
      where: { groupId },
      _count: { _all: true },
      _sum: { durationMinutes: true },
    }),
    prisma.playLog.groupBy({
      by: ['gameId'],
      where: { groupId },
      _count: { gameId: true },
      _max: { playedAt: true },
      orderBy: [{ _count: { gameId: 'desc' } }, { _max: { playedAt: 'desc' } }],
      take: 10,
    }),
    prisma.$queryRaw<{ userId: string; playedCount: number; winsCount: number }[]>`
      SELECT
        plp.user_id AS "userId",
        COUNT(*)::int AS "playedCount",
        COUNT(*) FILTER (WHERE plp.is_winner = true)::int AS "winsCount"
      FROM play_log_players plp
      INNER JOIN play_logs pl ON pl.id = plp.play_log_id
      WHERE pl.group_id = ${groupId}::uuid
      GROUP BY plp.user_id
    `,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT ug.game_id)::int AS "total"
      FROM group_members gm
      INNER JOIN user_games ug
        ON ug.user_id = gm.user_id
       AND ug.status = 'owned'::"UserGameStatus"
      INNER JOIN games g
        ON g.id = ug.game_id
       AND g.is_expansion = false
      WHERE gm.group_id = ${groupId}::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM play_logs pl
          WHERE pl.group_id = ${groupId}::uuid
            AND pl.game_id = ug.game_id
        )
    `,
    prisma.$queryRaw<{ gameId: string }[]>`
      SELECT g.id AS "gameId"
      FROM games g
      WHERE g.is_expansion = false
        AND EXISTS (
          SELECT 1
          FROM group_members gm
          INNER JOIN user_games ug
            ON ug.user_id = gm.user_id
           AND ug.status = 'owned'::"UserGameStatus"
          WHERE gm.group_id = ${groupId}::uuid
            AND ug.game_id = g.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM play_logs pl
          WHERE pl.group_id = ${groupId}::uuid
            AND pl.game_id = g.id
        )
      ORDER BY g.bgg_rating DESC NULLS LAST, g.name ASC
      LIMIT ${SHELF_OF_SHAME_PREVIEW_LIMIT}
    `,
  ]);

  const memberIds = members.map((m) => m.userId);
  const topGameIds = topGamesGrouped.map((row) => row.gameId);
  const shelfGameIds = shelfTopGameRows.map((row) => row.gameId);

  const [topGamesRecords, shelfGamesRecords] = await Promise.all([
    topGameIds.length > 0
      ? prisma.game.findMany({
          where: { id: { in: topGameIds } },
          select: {
            id: true,
            bggId: true,
            name: true,
            thumbnailUrl: true,
            imageUrl: true,
          },
        })
      : Promise.resolve([]),
    shelfGameIds.length > 0 && memberIds.length > 0
      ? prisma.game.findMany({
          relationLoadStrategy: 'join',
          where: { id: { in: shelfGameIds } },
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
            userGames: {
              where: {
                userId: { in: memberIds },
                status: UserGameStatus.owned,
              },
              select: {
                user: { select: USER_SUMMARY_SELECT },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const topGameById = new Map(topGamesRecords.map((g) => [g.id, g]));
  const mostPlayedGames = topGamesGrouped
    .map((entry) => {
      const game = topGameById.get(entry.gameId);
      if (!game || !entry._max.playedAt) return null;
      return {
        game,
        playCount: entry._count.gameId,
        lastPlayedAt: entry._max.playedAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const statsByUserId = new Map(
    playerWinRows.map((row) => [
      row.userId,
      {
        playedCount: Number(row.playedCount),
        winsCount: Number(row.winsCount),
      },
    ]),
  );

  const winLeaderboard = members
    .map((m) => {
      const st = statsByUserId.get(m.userId) ?? { playedCount: 0, winsCount: 0 };
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

  const shelfGameById = new Map(shelfGamesRecords.map((g) => [g.id, g]));
  const shelfOfShame = shelfGameIds
    .map((gameId) => {
      const g = shelfGameById.get(gameId);
      if (!g) return null;
      const { userGames, ...restGame } = g;
      return {
        game: {
          ...restGame,
          weight: decimalToNumber(restGame.weight),
          bggRating: decimalToNumber(restGame.bggRating),
        },
        owners: userGames.map((ug) => ug.user),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    groupId,
    totalPlays: totalsAgg._count._all,
    totalDurationMinutes: totalsAgg._sum.durationMinutes ?? 0,
    mostPlayedGames,
    winLeaderboard,
    shelfOfShameTotalCount: Number(shelfTotalRows[0]?.total ?? shelfOfShame.length),
    shelfOfShame,
  };
}
