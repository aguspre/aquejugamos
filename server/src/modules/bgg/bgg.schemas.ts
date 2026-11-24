import { UserGameStatus } from '@prisma/client';
import { z } from 'zod';

const BGG_USERNAME_REGEX = /^[a-zA-Z0-9._ -]+$/;

export const bggUsernameSchema = z
  .string()
  .trim()
  .min(2, 'El usuario de BGG debe tener al menos 2 caracteres')
  .max(60, 'El usuario de BGG es demasiado largo')
  .refine((val) => BGG_USERNAME_REGEX.test(val), {
    message:
      'El usuario de BGG solo puede contener letras, números, espacios, puntos, guiones o guiones bajos',
  })
  .refine((val) => (val.match(/[a-zA-Z0-9]/g)?.length ?? 0) >= 2, {
    message: 'El usuario de BGG debe incluir al menos 2 letras o números',
  });

export const bggSyncSchema = z.object({
  bggUsername: bggUsernameSchema.optional(),
  forceRefresh: z.boolean().optional().default(false),
});

export const bggSearchQuerySchema = z.object({
  query: z
    .string()
    .transform((val) => val.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(2, 'Ingresá al menos 2 caracteres para buscar')
        .max(100, 'La búsqueda es demasiado larga')
        .refine((val) => (val.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2, {
          message: 'Ingresá al menos 2 letras o números para buscar en BGG',
        }),
    ),
  exact: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export const bggImportParamsSchema = z.object({
  bggId: z.coerce
    .number()
    .int('bggId inválido')
    .min(1, 'bggId inválido')
    .max(10_000_000, 'bggId fuera de rango'),
});

export const bggImportBodySchema = z.object({
  status: z.nativeEnum(UserGameStatus).optional().default(UserGameStatus.owned),
  personalRating: z.number().min(1).max(10).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type BggSyncInput = z.infer<typeof bggSyncSchema>;
export type BggSearchQuery = z.infer<typeof bggSearchQuerySchema>;
export type BggImportBody = z.infer<typeof bggImportBodySchema>;
