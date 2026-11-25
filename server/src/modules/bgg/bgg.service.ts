import { Prisma, UserGameStatus } from '@prisma/client';
import { getEnv } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { invalidateFirebaseUserCacheByUserId } from '../auth/auth.service.js';
import { getBggClient } from './bgg.client.js';
import { getBggGuard, type BggSyncQuotaStatus } from './bgg.guard.js';
import { bggUsernameSchema, type BggImportBody } from './bgg.schemas.js';
import type { BggGameDetails, BggSearchPreview, BggSyncSummary } from './bgg.types.js';

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value !== null && value !== undefined ? Number(value) : null;
}

export async function getUserBggSyncQuota(userId: string): Promise<BggSyncQuotaStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bggUsername: true, lastBggSyncAt: true },
  });

  if (!user) {
    throw notFound('Usuario no encontrado', 'USER_NOT_FOUND');
  }

  return getBggGuard().getSyncQuota(user.id, user.lastBggSyncAt, user.bggUsername);
}

export async function upsertGamesFromBgg(
  bggIds: number[],
  options: { forceRefresh?: boolean; onUpstreamFetch?: () => void } = {},
): Promise<{
  gamesByBggId: Map<number, { id: string; bggId: number }>;
  metadataRefreshed: number;
}> {
  const uniqueIds = Array.from(new Set(bggIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) {
    return { gamesByBggId: new Map(), metadataRefreshed: 0 };
  }

  const env = getEnv();
  const ttlMs = env.BGG_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - ttlMs);
  // Incluso con forceRefresh, nunca re-descargar fichas actualizadas recientemente (24h por defecto)
  const minForceRefreshCutoff = new Date(
    Date.now() - env.BGG_MIN_FORCE_REFRESH_HOURS * 60 * 60 * 1000,
  );

  const existingGames = await prisma.game.findMany({
    where: { bggId: { in: uniqueIds } },
    select: { id: true, bggId: true, bggSyncedAt: true },
  });

  const existingByBggId = new Map(existingGames.map((g) => [g.bggId, g]));

  const idsToFetch = uniqueIds.filter((bggId) => {
    const existing = existingByBggId.get(bggId);
    if (!existing || !existing.bggSyncedAt) return true;
    if (options.forceRefresh) {
      return existing.bggSyncedAt < minForceRefreshCutoff;
    }
    return existing.bggSyncedAt < staleCutoff;
  });

  let metadataRefreshed = 0;

  if (idsToFetch.length > 0) {
    options.onUpstreamFetch?.();
    const detailsList = await getBggClient().fetchThingsByIds(idsToFetch);
    await persistBggGameDetails(detailsList);
    metadataRefreshed = detailsList.length;
  }

  const finalGames = await prisma.game.findMany({
    where: { bggId: { in: uniqueIds } },
    select: { id: true, bggId: true },
  });

  return {
    gamesByBggId: new Map(finalGames.map((g) => [g.bggId, g])),
    metadataRefreshed,
  };
}

async function persistBggGameDetails(detailsList: BggGameDetails[]): Promise<void> {
  if (detailsList.length === 0) return;

  // 1. Upsert all unique mechanics in batch instead of sequential N+1 round-trips
  const uniqueMechanics = new Map<number, string>();
  for (const details of detailsList) {
    for (const mechanic of details.mechanics) {
      uniqueMechanics.set(mechanic.bggId, mechanic.name);
    }
  }

  const mechanicIdByBggId = new Map<number, string>();
  if (uniqueMechanics.size > 0) {
    const mechanicEntries = Array.from(uniqueMechanics.entries());
    await prisma.mechanic.createMany({
      data: mechanicEntries.map(([bggId, name]) => ({ bggId, name })),
      skipDuplicates: true,
    });

    const mechanicRows = await prisma.mechanic.findMany({
      where: { bggId: { in: mechanicEntries.map(([bggId]) => bggId) } },
      select: { id: true, bggId: true },
    });
    for (const row of mechanicRows) {
      mechanicIdByBggId.set(row.bggId, row.id);
    }
  }

  // 2. Upsert each game and refresh its mechanics links
  const syncedAt = new Date();

  for (const details of detailsList) {
    const gameData = {
      name: details.name,
      yearPublished: details.yearPublished,
      imageUrl: details.imageUrl,
      thumbnailUrl: details.thumbnailUrl,
      minPlayers: details.minPlayers,
      maxPlayers: details.maxPlayers,
      bestPlayers: details.bestPlayers,
      playingTimeMinutes: details.playingTimeMinutes,
      weight: details.weight !== null ? new Prisma.Decimal(details.weight.toFixed(2)) : null,
      bggRating:
        details.bggRating !== null ? new Prisma.Decimal(details.bggRating.toFixed(2)) : null,
      isExpansion: details.isExpansion,
      baseGameBggId: details.baseGameBggId,
      bggSyncedAt: syncedAt,
    };

    const mechanicIds = details.mechanics
      .map((m) => mechanicIdByBggId.get(m.bggId))
      .filter((id): id is string => Boolean(id));

    await prisma.$transaction(async (tx) => {
      const game = await tx.game.upsert({
        where: { bggId: details.bggId },
        update: gameData,
        create: {
          bggId: details.bggId,
          ...gameData,
        },
        select: { id: true },
      });

      await tx.gameMechanic.deleteMany({
        where: { gameId: game.id },
      });

      if (mechanicIds.length > 0) {
        await tx.gameMechanic.createMany({
          data: mechanicIds.map((mechanicId) => ({
            gameId: game.id,
            mechanicId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }
}

export async function syncUserBggCollection(
  userId: string,
  bggUsernameInput?: string,
  forceRefresh = false,
): Promise<BggSyncSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bggUsername: true, lastBggSyncAt: true },
  });

  if (!user) {
    throw notFound('Usuario no encontrado', 'USER_NOT_FOUND');
  }

  const rawUsername = bggUsernameInput?.trim() || user.bggUsername?.trim();
  if (!rawUsername) {
    throw badRequest(
      'Debés indicar un nombre de usuario de BoardGameGeek para sincronizar',
      undefined,
      'BGG_USERNAME_REQUIRED',
    );
  }

  const parsedUsername = bggUsernameSchema.safeParse(rawUsername);
  if (!parsedUsername.success) {
    throw badRequest(
      parsedUsername.error.issues[0]?.message ?? 'Usuario de BoardGameGeek inválido',
      undefined,
      'INVALID_BGG_USERNAME',
    );
  }
  const bggUsername = parsedUsername.data;

  const guard = getBggGuard();
  const syncSlot = guard.acquireSyncSlot(
    userId,
    bggUsername,
    user.lastBggSyncAt,
    user.bggUsername,
  );

  try {
    const env = getEnv();
    const rawCollectionItems = await getBggClient().fetchUserCollection(bggUsername);
    const dedupedMap = new Map<number, (typeof rawCollectionItems)[number]>();
    for (const item of rawCollectionItems) {
      const prev = dedupedMap.get(item.bggId);
      if (!prev || (prev.personalRating === null && item.personalRating !== null)) {
        dedupedMap.set(item.bggId, item);
      }
    }
    const collectionItems = Array.from(dedupedMap.values()).slice(
      0,
      env.BGG_MAX_COLLECTION_ITEMS,
    );
    const collectionBggIds = collectionItems.map((item) => item.bggId);

    const { gamesByBggId, metadataRefreshed } = await upsertGamesFromBgg(collectionBggIds, {
      forceRefresh,
    });

    const resolvedGameIds = collectionItems
      .map((item) => gamesByBggId.get(item.bggId)?.id)
      .filter((id): id is string => Boolean(id));

    const existingLibrary = await prisma.userGame.findMany({
      where: {
        userId,
        gameId: { in: resolvedGameIds },
      },
      select: { gameId: true, status: true, personalRating: true },
    });

    const existingByGameId = new Map(existingLibrary.map((entry) => [entry.gameId, entry]));
    let addedToLibrary = 0;
    let updatedInLibrary = 0;

    const toCreate: Prisma.UserGameCreateManyInput[] = [];
    const toUpdate: Prisma.PrismaPromise<unknown>[] = [];

    for (const item of collectionItems) {
      const game = gamesByBggId.get(item.bggId);
      if (!game) continue;

      const ratingDecimal =
        item.personalRating !== null
          ? new Prisma.Decimal(item.personalRating.toFixed(2))
          : undefined;

      const existing = existingByGameId.get(game.id);
      if (!existing) {
        addedToLibrary += 1;
        toCreate.push({
          userId,
          gameId: game.id,
          status: UserGameStatus.owned,
          personalRating: ratingDecimal ?? null,
        });
      } else {
        updatedInLibrary += 1;
        const statusNeedsUpdate = existing.status !== UserGameStatus.owned;
        const ratingNeedsUpdate =
          ratingDecimal !== undefined &&
          (existing.personalRating === null || !existing.personalRating.equals(ratingDecimal));

        if (statusNeedsUpdate || ratingNeedsUpdate) {
          toUpdate.push(
            prisma.userGame.update({
              where: {
                userId_gameId: {
                  userId,
                  gameId: game.id,
                },
              },
              data: {
                status: UserGameStatus.owned,
                ...(ratingDecimal !== undefined ? { personalRating: ratingDecimal } : {}),
              },
            }),
          );
        }
      }
    }

    if (toCreate.length > 0) {
      await prisma.userGame.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }

    const UPDATE_BATCH_SIZE = 50;
    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH_SIZE) {
      await prisma.$transaction(toUpdate.slice(i, i + UPDATE_BATCH_SIZE));
    }

    const syncedAt = new Date();

    await prisma.user.update({
      where: { id: userId },
      data: {
        bggUsername,
        lastBggSyncAt: syncedAt,
      },
    });
    invalidateFirebaseUserCacheByUserId(userId);

    syncSlot.release(true);

    return {
      bggUsername,
      totalInBgg: collectionItems.length,
      metadataRefreshed,
      addedToLibrary,
      updatedInLibrary,
      syncedAt,
      quota: guard.getSyncQuota(userId, syncedAt, bggUsername),
    };
  } catch (error) {
    syncSlot.release(false);
    throw error;
  }
}

const SEARCH_RESULTS_LIMIT = 20;

export async function searchBggCatalog(userId: string, query: string, exact = false) {
  const guard = getBggGuard();
  guard.assertSearchRateLimit(userId);

  const { results: rawResults } = await guard.getOrFetchSearch(query, exact, () =>
    getBggClient().searchGames(query, exact),
  );
  const results = rawResults.slice(0, SEARCH_RESULTS_LIMIT);
  if (results.length === 0) {
    return [];
  }

  const bggIds = results.map((item) => item.bggId);

  const cachedGames = await prisma.game.findMany({
    where: { bggId: { in: bggIds } },
    select: {
      id: true,
      bggId: true,
      imageUrl: true,
      thumbnailUrl: true,
      minPlayers: true,
      maxPlayers: true,
      playingTimeMinutes: true,
      userGames: {
        where: { userId },
        select: { status: true },
      },
    },
  });

  const cachedByBggId = new Map(cachedGames.map((g) => [g.bggId, g]));
  const idsMissingDbThumbnail = bggIds.filter((bggId) => {
    const cached = cachedByBggId.get(bggId);
    return !cached || (!cached.thumbnailUrl && !cached.imageUrl);
  });

  const previewByBggId = guard.getCachedThingPreviews(idsMissingDbThumbnail);
  const idsToFetchPreviews = idsMissingDbThumbnail.filter(
    (bggId) => !previewByBggId.has(bggId),
  );

  if (idsToFetchPreviews.length > 0) {
    try {
      const fetchedDetails = await getBggClient().fetchThingsByIds(idsToFetchPreviews, {
        includeStats: false,
      });
      const fetchedPreviews: BggSearchPreview[] = fetchedDetails.map((details) => ({
        bggId: details.bggId,
        thumbnailUrl: details.thumbnailUrl,
        imageUrl: details.imageUrl,
        minPlayers: details.minPlayers,
        maxPlayers: details.maxPlayers,
        playingTimeMinutes: details.playingTimeMinutes,
      }));
      guard.cacheThingPreviews(fetchedPreviews);
      for (const preview of fetchedPreviews) {
        previewByBggId.set(preview.bggId, preview);
      }
    } catch {
      // If lightweight thumbnail enrichment fails, degrade gracefully and still return search results
    }
  }

  return results.map((item) => {
    const cached = cachedByBggId.get(item.bggId);
    const preview = previewByBggId.get(item.bggId);
    return {
      ...item,
      thumbnailUrl:
        cached?.thumbnailUrl ??
        cached?.imageUrl ??
        preview?.thumbnailUrl ??
        preview?.imageUrl ??
        null,
      minPlayers: cached?.minPlayers ?? preview?.minPlayers ?? null,
      maxPlayers: cached?.maxPlayers ?? preview?.maxPlayers ?? null,
      playingTimeMinutes: cached?.playingTimeMinutes ?? preview?.playingTimeMinutes ?? null,
      inLibraryStatus: cached?.userGames[0]?.status ?? null,
    };
  });
}

export async function importGameToLibrary(
  userId: string,
  bggId: number,
  input: BggImportBody,
) {
  const { gamesByBggId } = await upsertGamesFromBgg([bggId], {
    onUpstreamFetch: () => getBggGuard().assertUpstreamImportRateLimit(userId),
  });
  const game = gamesByBggId.get(bggId);

  if (!game) {
    throw notFound(
      `No se encontró el juego #${bggId} en BoardGameGeek`,
      'BGG_GAME_NOT_FOUND',
    );
  }

  const ratingDecimal =
    input.personalRating !== undefined
      ? input.personalRating !== null
        ? new Prisma.Decimal(input.personalRating.toFixed(2))
        : null
      : undefined;

  const entry = await prisma.userGame.upsert({
    where: {
      userId_gameId: {
        userId,
        gameId: game.id,
      },
    },
    update: {
      status: input.status,
      ...(ratingDecimal !== undefined ? { personalRating: ratingDecimal } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    create: {
      userId,
      gameId: game.id,
      status: input.status,
      personalRating: ratingDecimal ?? null,
      notes: input.notes ?? null,
    },
    include: {
      game: {
        include: {
          mechanics: {
            include: {
              mechanic: true,
            },
          },
        },
      },
    },
  });

  return {
    gameId: entry.gameId,
    status: entry.status,
    personalRating: decimalToNumber(entry.personalRating),
    notes: entry.notes,
    updatedAt: entry.updatedAt,
    game: {
      id: entry.game.id,
      bggId: entry.game.bggId,
      name: entry.game.name,
      yearPublished: entry.game.yearPublished,
      imageUrl: entry.game.imageUrl,
      thumbnailUrl: entry.game.thumbnailUrl,
      minPlayers: entry.game.minPlayers,
      maxPlayers: entry.game.maxPlayers,
      bestPlayers: entry.game.bestPlayers,
      playingTimeMinutes: entry.game.playingTimeMinutes,
      weight: decimalToNumber(entry.game.weight),
      bggRating: decimalToNumber(entry.game.bggRating),
      isExpansion: entry.game.isExpansion,
      baseGameBggId: entry.game.baseGameBggId,
      mechanics: entry.game.mechanics.map((gm) => ({
        id: gm.mechanic.id,
        bggId: gm.mechanic.bggId,
        name: gm.mechanic.name,
      })),
    },
  };
}
