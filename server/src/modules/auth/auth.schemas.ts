import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(128, 'La contraseña es demasiado larga'),
  displayName: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre es demasiado largo'),
  bggUsername: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken es requerido'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  avatarUrl: z
    .string()
    .trim()
    .url('URL de avatar inválida')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  bggUsername: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});

export const syncProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z
      .string()
      .trim()
      .url('URL de avatar inválida')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    bggUsername: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
  })
  .optional()
  .default({});

export const invitePreviewQuerySchema = z
  .object({
    groupCode: z.string().trim().min(2).max(40).optional(),
    sessionToken: z.string().trim().min(4).max(80).optional(),
    seriesToken: z.string().trim().min(4).max(80).optional(),
  })
  .refine((v) => Boolean(v.groupCode || v.sessionToken || v.seriesToken), {
    message: 'Indicá un código de grupo o token de juntada',
  });

export const guestJoinSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Ingresá tu nombre (al menos 2 caracteres)')
      .max(60, 'El nombre es demasiado largo'),
    groupInviteCode: z.string().trim().min(2).max(40).optional(),
    sessionInviteToken: z.string().trim().min(4).max(80).optional(),
    seriesShareToken: z.string().trim().min(4).max(80).optional(),
  })
  .refine((v) => Boolean(v.groupInviteCode || v.sessionInviteToken || v.seriesShareToken), {
    message: 'Se requiere un enlace de invitación válido para entrar como invitado',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SyncProfileInput = z.infer<typeof syncProfileSchema>;
export type InvitePreviewQuery = z.infer<typeof invitePreviewQuerySchema>;
export type GuestJoinInput = z.infer<typeof guestJoinSchema>;
