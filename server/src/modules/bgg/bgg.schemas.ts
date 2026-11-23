import { UserGameStatus } from '@prisma/client';
import { z } from 'zod';

export const bggSyncSchema = z.object({
  bggUsername: z
    .string()
    .trim()
    .min(1, 'El usuario de BGG no puede estar vacío')
    .max(60)
    .optional(),
  forceRefresh: z.boolean().optional().default(false),
});

export const bggSearchQuerySchema = z.object({
  query: z.string().trim().min(2, 'Ingresá al menos 2 caracteres para buscar').max(100),
  exact: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export const bggImportParamsSchema = z.object({
  bggId: z.coerce.number().int().positive('bggId inválido'),
});

export const bggImportBodySchema = z.object({
  status: z.nativeEnum(UserGameStatus).optional().default(UserGameStatus.owned),
  personalRating: z.number().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type BggSyncInput = z.infer<typeof bggSyncSchema>;
export type BggSearchQuery = z.infer<typeof bggSearchQuerySchema>;
export type BggImportBody = z.infer<typeof bggImportBodySchema>;
