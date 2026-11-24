import { RsvpStatus, SessionStatus, VotingMode } from '@prisma/client';
import { z } from 'zod';

const booleanQueryParam = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    return val === 'true' || val === '1';
  });

export const listSessionsQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
});

export const createSessionSchema = z.object({
  groupId: z.string().uuid().nullable().optional(),
  title: z
    .string()
    .trim()
    .min(2, 'El título debe tener al menos 2 caracteres')
    .max(120, 'El título es demasiado largo'),
  scheduledAt: z.coerce.date({ message: 'Fecha y hora inválidas' }),
  location: z.string().trim().max(200).nullable().optional(),
  status: z.nativeEnum(SessionStatus).optional().default(SessionStatus.voting),
  votingMode: z.nativeEnum(VotingMode).optional().default(VotingMode.multi_vote),
  maxVotesPerUser: z.coerce.number().int().min(1).max(10).optional().default(3),
});

export const sessionIdParamsSchema = z.object({
  sessionId: z.string().uuid('sessionId inválido'),
});

export const joinSessionSchema = z.object({
  inviteToken: z.string().trim().min(4, 'Token de invitación inválido').max(64),
  rsvp: z.nativeEnum(RsvpStatus).optional().default(RsvpStatus.going),
});

export const updateRsvpSchema = z.object({
  rsvp: z.nativeEnum(RsvpStatus),
});

export const updateSessionStatusSchema = z.object({
  status: z.nativeEnum(SessionStatus),
});

export const sessionPoolQuerySchema = z.object({
  onlyCompatible: booleanQueryParam,
  includeExpansions: booleanQueryParam,
  q: z.string().trim().max(100).optional(),
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
});

export const createProposalSchema = z.object({
  gameId: z.string().uuid('gameId inválido'),
  note: z.string().trim().max(500).nullable().optional(),
});

export const proposalParamsSchema = z.object({
  sessionId: z.string().uuid('sessionId inválido'),
  proposalId: z.string().uuid('proposalId inválido'),
});

export const castVoteSchema = z.object({
  rank: z.coerce.number().int().min(1).max(3).optional().default(1),
});

export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SessionPoolQuery = z.infer<typeof sessionPoolQuerySchema>;
export type CreateProposalInput = z.infer<typeof createProposalSchema>;
