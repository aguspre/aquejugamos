import { z } from 'zod';

export const listPlayLogsQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  gameId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const playLogPlayerInputSchema = z.object({
  userId: z.string().uuid('userId de jugador inválido'),
  score: z.number().int().nullable().optional(),
  isWinner: z.boolean().optional().default(false),
});

export const createPlayLogSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  gameId: z.string().uuid('gameId inválido'),
  playedAt: z.coerce.date().optional(),
  durationMinutes: z.coerce.number().int().positive().max(1440).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  players: z
    .array(playLogPlayerInputSchema)
    .min(1, 'Debés seleccionar al menos 1 jugador')
    .max(20),
});

export const playLogIdParamsSchema = z.object({
  playLogId: z.string().uuid('playLogId inválido'),
});

export const groupStatsParamsSchema = z.object({
  groupId: z.string().uuid('groupId inválido'),
});

export type ListPlayLogsQuery = z.infer<typeof listPlayLogsQuerySchema>;
export type CreatePlayLogInput = z.infer<typeof createPlayLogSchema>;
