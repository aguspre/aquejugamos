import { GroupRole } from '@prisma/client';
import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre del grupo debe tener al menos 2 caracteres')
    .max(80, 'El nombre del grupo es demasiado largo'),
});

export const joinGroupSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(3, 'Código de invitación inválido')
    .max(32)
    .transform((val) => val.toUpperCase()),
});

export const groupIdParamsSchema = z.object({
  groupId: z.string().uuid('groupId inválido'),
});

export const groupMemberParamsSchema = z.object({
  groupId: z.string().uuid('groupId inválido'),
  userId: z.string().uuid('userId inválido'),
});

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(GroupRole),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
