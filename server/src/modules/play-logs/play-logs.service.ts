import { GroupRole, Prisma } from '@prisma/client';
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
              { group: { members: { some: { userId } } } },
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
  const [
    members,
    totalsAgg,
    topGameRows,
    playerWinRows,
    shelfRows,
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
    prisma.$queryRaw<{
      gameId: string;
      playCount: number;
      lastPlayedAt: Date;
      bggId: number;
      name: string;
      thumbnailUrl: string | null;
      imageUrl: string | null;
    }[]>`
      SELECT
        pl.game_id AS "gameId",
        COUNT(*)::int AS "playCount",
        MAX(pl.played_at) AS "lastPlayedAt",
        g.bgg_id AS "bggId",
        g.name,
        g.thumbnail_url AS "thumbnailUrl",
        g.image_url AS "imageUrl"
      FROM play_logs pl
      INNER JOIN games g ON g.id = pl.game_id
      WHERE pl.group_id = ${groupId}::uuid
        AND EXISTS (
          SELECT 1
          FROM group_members auth_gm
          WHERE auth_gm.group_id = ${groupId}::uuid
            AND auth_gm.user_id = ${userId}::uuid
        )
      GROUP BY pl.game_id, g.bgg_id, g.name, g.thumbnail_url, g.image_url
      ORDER BY "playCount" DESC, "lastPlayedAt" DESC
      LIMIT 10
    `,
    prisma.$queryRaw<{ userId: string; playedCount: number; winsCount: number }[]>`
      SELECT
        plp.user_id AS "userId",
        COUNT(*)::int AS "playedCount",
        COUNT(*) FILTER (WHERE plp.is_winner = true)::int AS "winsCount"
      FROM play_log_players plp
      INNER JOIN play_logs pl ON pl.id = plp.play_log_id
      WHERE pl.group_id = ${groupId}::uuid
        AND EXISTS (
          SELECT 1
          FROM group_members auth_gm
          WHERE auth_gm.group_id = ${groupId}::uuid
            AND auth_gm.user_id = ${userId}::uuid
        )
      GROUP BY plp.user_id
    `,
    prisma.$queryRaw<{
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
      totalCount: number;
      ownerIds: string[];
    }[]>`
      WITH unplayed AS (
        SELECT
          g.id,
          g.bgg_id AS "bggId",
          g.name,
          g.year_published AS "yearPublished",
          g.thumbnail_url AS "thumbnailUrl",
          g.image_url AS "imageUrl",
          g.min_players AS "minPlayers",
          g.max_players AS "maxPlayers",
          g.playing_time_minutes AS "playingTimeMinutes",
          g.weight::float8 AS "weight",
          g.bgg_rating::float8 AS "bggRating",
          COUNT(*) OVER()::int AS "totalCount"
        FROM games g
        WHERE g.is_expansion = false
          AND EXISTS (
            SELECT 1
            FROM group_members auth_gm
            WHERE auth_gm.group_id = ${groupId}::uuid
              AND auth_gm.user_id = ${userId}::uuid
          )
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
      )
      SELECT
        u.*,
        ARRAY_AGG(ug.user_id::text ORDER BY gm.joined_at ASC) AS "ownerIds"
      FROM unplayed u
      INNER JOIN user_games ug
        ON ug.game_id = u.id
       AND ug.status = 'owned'::"UserGameStatus"
      INNER JOIN group_members gm
        ON gm.group_id = ${groupId}::uuid
       AND gm.user_id = ug.user_id
      GROUP BY
        u.id, u."bggId", u.name, u."yearPublished", u."thumbnailUrl", u."imageUrl",
        u."minPlayers", u."maxPlayers", u."playingTimeMinutes", u.weight, u."bggRating", u."totalCount"
      ORDER BY u."bggRating" DESC NULLS LAST, u.name ASC
    `,
  ]);

  if (!members.some((m) => m.userId === userId)) {
    throw forbidden('No pertenecés a este grupo', 'NOT_GROUP_MEMBER');
  }

  const memberUserById = new Map(members.map((m) => [m.userId, m.user]));

  const mostPlayedGames = topGameRows.map((row) => ({
    game: {
      id: row.gameId,
      bggId: Number(row.bggId),
      name: row.name,
      thumbnailUrl: row.thumbnailUrl,
      imageUrl: row.imageUrl,
    },
    playCount: Number(row.playCount),
    lastPlayedAt: row.lastPlayedAt,
  }));

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

  const shelfOfShame = shelfRows.map((row) => ({
    game: {
      id: row.id,
      bggId: Number(row.bggId),
      name: row.name,
      yearPublished: row.yearPublished,
      thumbnailUrl: row.thumbnailUrl,
      imageUrl: row.imageUrl,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      playingTimeMinutes: row.playingTimeMinutes,
      weight: row.weight,
      bggRating: row.bggRating,
    },
    owners: (row.ownerIds ?? [])
      .map((ownerId) => memberUserById.get(ownerId))
      .filter((u): u is NonNullable<typeof u> => Boolean(u)),
  }));

  return {
    groupId,
    totalPlays: totalsAgg._count._all,
    totalDurationMinutes: totalsAgg._sum.durationMinutes ?? 0,
    mostPlayedGames,
    winLeaderboard,
    shelfOfShameTotalCount: Number(shelfRows[0]?.totalCount ?? 0),
    shelfOfShame,
  };
}
