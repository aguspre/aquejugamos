import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { notFound } from '../../utils/errors.js';
import type { ListLibraryQuery, UpdateLibraryItemInput } from './library.schemas.js';

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value !== null && value !== undefined ? Number(value) : null;
}

export async function listUserLibrary(userId: string, filters: ListLibraryQuery) {
  const gameFilters: Prisma.GameWhereInput = {};
  const gameAnd: Prisma.GameWhereInput[] = [];

  if (filters.q) {
    gameFilters.name = { contains: filters.q, mode: 'insensitive' };
  }

  if (filters.includeExpansions === false) {
    gameFilters.isExpansion = false;
  }

  if (filters.players !== undefined) {
    gameAnd.push(
      { minPlayers: { lte: filters.players } },
      { maxPlayers: { gte: filters.players } },
    );
  }

  if (filters.maxPlayingTime !== undefined) {
    gameFilters.playingTimeMinutes = { lte: filters.maxPlayingTime };
  }

  if (filters.minWeight !== undefined || filters.maxWeight !== undefined) {
    gameFilters.weight = {
      ...(filters.minWeight !== undefined ? { gte: filters.minWeight } : {}),
      ...(filters.maxWeight !== undefined ? { lte: filters.maxWeight } : {}),
    };
  }

  if (filters.mechanicIds && filters.mechanicIds.length > 0) {
    for (const mechanicId of filters.mechanicIds) {
      gameAnd.push({
        mechanics: {
          some: { mechanicId },
        },
      });
    }
  }

  if (gameAnd.length > 0) {
    gameFilters.AND = gameAnd;
  }

  const orderByMap: Record<ListLibraryQuery['sortBy'], Prisma.UserGameOrderByWithRelationInput> = {
    name: { game: { name: filters.sortDir } },
    rating: { game: { bggRating: filters.sortDir } },
    weight: { game: { weight: filters.sortDir } },
    playingTime: { game: { playingTimeMinutes: filters.sortDir } },
    year: { game: { yearPublished: filters.sortDir } },
  };

  const entries = await prisma.userGame.findMany({
    where: {
      userId,
      ...(filters.status ? { status: filters.status } : {}),
      game: gameFilters,
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
    orderBy: orderByMap[filters.sortBy],
  });

  return entries.map((entry) => ({
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
      mechanics: entry.game.mechanics
        .map((gm) => ({
          id: gm.mechanic.id,
          bggId: gm.mechanic.bggId,
          name: gm.mechanic.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  }));
}

export async function updateUserLibraryItem(
  userId: string,
  gameId: string,
  input: UpdateLibraryItemInput,
) {
  const existing = await prisma.userGame.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { gameId: true },
  });

  if (!existing) {
    throw notFound('Ese juego no se encuentra en tu ludoteca', 'LIBRARY_ITEM_NOT_FOUND');
  }

  const ratingDecimal =
    input.personalRating !== undefined
      ? input.personalRating !== null
        ? new Prisma.Decimal(input.personalRating.toFixed(2))
        : null
      : undefined;

  const updated = await prisma.userGame.update({
    where: { userId_gameId: { userId, gameId } },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(ratingDecimal !== undefined ? { personalRating: ratingDecimal } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  return {
    gameId: updated.gameId,
    status: updated.status,
    personalRating: decimalToNumber(updated.personalRating),
    notes: updated.notes,
    updatedAt: updated.updatedAt,
  };
}

export async function removeUserLibraryItem(userId: string, gameId: string): Promise<void> {
  const existing = await prisma.userGame.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { gameId: true },
  });

  if (!existing) {
    throw notFound('Ese juego no se encuentra en tu ludoteca', 'LIBRARY_ITEM_NOT_FOUND');
  }

  await prisma.userGame.delete({
    where: { userId_gameId: { userId, gameId } },
  });
}

export async function listMechanics(userId: string, onlyMine = false) {
  return prisma.mechanic.findMany({
    where: onlyMine
      ? {
          games: {
            some: {
              game: {
                userGames: {
                  some: { userId },
                },
              },
            },
          },
        }
      : undefined,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      bggId: true,
      name: true,
    },
  });
}
