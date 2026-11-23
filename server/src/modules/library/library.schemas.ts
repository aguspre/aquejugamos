import { UserGameStatus } from '@prisma/client';
import { z } from 'zod';

const booleanQueryParam = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    return val === 'true' || val === '1';
  });

export const listLibraryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.nativeEnum(UserGameStatus).optional(),
  players: z.coerce.number().int().positive().max(99).optional(),
  maxPlayingTime: z.coerce.number().int().positive().max(2000).optional(),
  minWeight: z.coerce.number().min(1).max(5).optional(),
  maxWeight: z.coerce.number().min(1).max(5).optional(),
  mechanicIds: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined,
    ),
  includeExpansions: booleanQueryParam,
  sortBy: z.enum(['name', 'rating', 'weight', 'playingTime', 'year']).optional().default('name'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const libraryGameParamsSchema = z.object({
  gameId: z.string().uuid('gameId debe ser un UUID válido'),
});

export const updateLibraryItemSchema = z.object({
  status: z.nativeEnum(UserGameStatus).optional(),
  personalRating: z.number().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const listMechanicsQuerySchema = z.object({
  onlyMine: booleanQueryParam,
});

export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>;
export type UpdateLibraryItemInput = z.infer<typeof updateLibraryItemSchema>;
