import { randomUUID } from 'node:crypto';
import { Prisma, RsvpStatus, SessionStatus, type User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import { getEnv } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { isUserAdminEmail } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, unauthorized } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { ensureActiveSeriesSession } from '../sessions/sessions.service.js';
import type {
  GuestJoinInput,
  InvitePreviewQuery,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from './auth.schemas.js';

export interface PublicUser {
  id: string;
  email: string;
  firebaseUid: string | null;
  displayName: string;
  avatarUrl: string | null;
  bggUsername: string | null;
  lastBggSyncAt: Date | null;
  createdAt: Date;
  isAdmin?: boolean;
}

export function toPublicUser(
  user: User,
  options?: { emailVerified?: boolean },
): PublicUser {
  const verified = options?.emailVerified ?? false;
  return {
    id: user.id,
    email: user.email,
    firebaseUid: user.firebaseUid,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bggUsername: user.bggUsername,
    lastBggSyncAt: user.lastBggSyncAt,
    createdAt: user.createdAt,
    isAdmin: isUserAdminEmail(user.email, verified),
  };
}

const FIREBASE_USER_CACHE_TTL_MS = 5 * 60 * 1000;
const FIREBASE_USER_CACHE_MAX_SIZE = 5000;

interface CachedFirebaseUser {
  user: User;
  expiresAt: number;
}

const firebaseUserCache = new Map<string, CachedFirebaseUser>();
const inFlightFirebaseUserSyncs = new Map<string, Promise<User>>();

function setCachedFirebaseUser(user: User): User {
  if (!user.firebaseUid) return user;
  if (firebaseUserCache.size >= FIREBASE_USER_CACHE_MAX_SIZE) {
    const oldestKey = firebaseUserCache.keys().next().value;
    if (oldestKey) {
      firebaseUserCache.delete(oldestKey);
    }
  }
  firebaseUserCache.set(user.firebaseUid, {
    user,
    expiresAt: Date.now() + FIREBASE_USER_CACHE_TTL_MS,
  });
  return user;
}

export function invalidateFirebaseUserCacheByUserId(userId: string): void {
  for (const [uid, entry] of firebaseUserCache.entries()) {
    if (entry.user.id === userId) {
      firebaseUserCache.delete(uid);
    }
  }
}

export async function syncFirebaseUser(decoded: DecodedIdToken): Promise<User> {
  const picture =
    typeof decoded.picture === 'string' && decoded.picture.trim()
      ? decoded.picture.trim()
      : null;

  const cached = firebaseUserCache.get(decoded.uid);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.user.avatarUrl || !picture) {
      return cached.user;
    }
  } else if (cached) {
    firebaseUserCache.delete(decoded.uid);
  }

  const existingInFlight = inFlightFirebaseUserSyncs.get(decoded.uid);
  if (existingInFlight) {
    return existingInFlight;
  }

  const syncPromise = (async () => {
    const existingByUid = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });

    if (existingByUid) {
      if (!existingByUid.avatarUrl && picture) {
        const updated = await prisma.user.update({
          where: { id: existingByUid.id },
          data: { avatarUrl: picture },
        });
        return setCachedFirebaseUser(updated);
      }
      return setCachedFirebaseUser(existingByUid);
    }

    const rawEmail = decoded.email?.trim().toLowerCase();
    if (!rawEmail) {
      throw unauthorized(
        'El token de Firebase no incluye un email válido',
        'INVALID_FIREBASE_TOKEN',
      );
    }

    const displayName =
      (typeof decoded.name === 'string' && decoded.name.trim()) ||
      rawEmail.split('@')[0] ||
      'Jugador';

    const existingByEmail = await prisma.user.findUnique({
      where: { email: rawEmail },
    });

    if (existingByEmail) {
      if (!decoded.email_verified) {
        throw unauthorized(
          'Debés verificar tu dirección de email antes de vincular esta cuenta',
          'EMAIL_NOT_VERIFIED',
        );
      }
      if (existingByEmail.firebaseUid && existingByEmail.firebaseUid !== decoded.uid) {
        throw conflict(
          'El email ya está vinculado a otra cuenta de autenticación',
          'EMAIL_ALREADY_LINKED',
        );
      }
      const updated = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          firebaseUid: decoded.uid,
          avatarUrl: existingByEmail.avatarUrl ?? picture,
        },
      });
      return setCachedFirebaseUser(updated);
    }

    try {
      const created = await prisma.user.create({
        data: {
          email: rawEmail,
          firebaseUid: decoded.uid,
          displayName,
          avatarUrl: picture,
        },
      });
      return setCachedFirebaseUser(created);
    } catch (error) {
      // Manejo seguro de race condition cuando llegan requests concurrentes en el primer login
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const recovered =
          (await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } })) ??
          (await prisma.user.findUnique({ where: { email: rawEmail } }));

        if (recovered) {
          if (!recovered.firebaseUid) {
            if (!decoded.email_verified) {
              throw unauthorized(
                'Debés verificar tu dirección de email antes de vincular esta cuenta',
                'EMAIL_NOT_VERIFIED',
              );
            }
            const linked = await prisma.user.update({
              where: { id: recovered.id },
              data: { firebaseUid: decoded.uid },
            });
            return setCachedFirebaseUser(linked);
          }
          if (recovered.firebaseUid !== decoded.uid) {
            throw conflict(
              'El email ya está vinculado a otra cuenta de autenticación',
              'EMAIL_ALREADY_LINKED',
            );
          }
          return setCachedFirebaseUser(recovered);
        }
      }
      throw error;
    }
  })().finally(() => {
    inFlightFirebaseUserSyncs.delete(decoded.uid);
  });

  inFlightFirebaseUserSyncs.set(decoded.uid, syncPromise);
  return syncPromise;
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw conflict('Ya existe una cuenta registrada con ese email', 'EMAIL_IN_USE');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      bggUsername: input.bggUsername ?? null,
    },
  });

  return toPublicUser(user);
}

export async function loginUser(input: LoginInput): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user || !user.passwordHash) {
    throw unauthorized('Email o contraseña incorrectos', 'INVALID_CREDENTIALS');
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw unauthorized('Email o contraseña incorrectos', 'INVALID_CREDENTIALS');
  }

  return toPublicUser(user);
}

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  const { GOOGLE_CLIENT_ID } = getEnv();
  if (!GOOGLE_CLIENT_ID) {
    throw badRequest(
      'Google OAuth no está configurado en el servidor',
      undefined,
      'GOOGLE_OAUTH_NOT_CONFIGURED',
    );
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

export async function authenticateWithGoogle(idToken: string): Promise<PublicUser> {
  const env = getEnv();
  const client = getGoogleClient();

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw unauthorized('Token de Google inválido o expirado', 'INVALID_GOOGLE_TOKEN');
  }

  if (!payload?.sub || !payload.email) {
    throw unauthorized('El token de Google no contiene email válido', 'INVALID_GOOGLE_TOKEN');
  }

  const emailVerified = Boolean(payload.email_verified);
  const normalizedEmail = payload.email.toLowerCase();
  const displayName = payload.name?.trim() || normalizedEmail.split('@')[0] || 'Jugador';
  const avatarUrl = payload.picture ?? null;

  const existingByGoogle = await prisma.user.findUnique({
    where: { googleId: payload.sub },
  });

  if (existingByGoogle) {
    const updated = await prisma.user.update({
      where: { id: existingByGoogle.id },
      data: {
        avatarUrl: existingByGoogle.avatarUrl ?? avatarUrl,
      },
    });
    return toPublicUser(updated, { emailVerified });
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingByEmail) {
    if (!emailVerified) {
      throw unauthorized(
        'Debés verificar tu dirección de email antes de vincular esta cuenta',
        'EMAIL_NOT_VERIFIED',
      );
    }
    const linked = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleId: payload.sub,
        avatarUrl: existingByEmail.avatarUrl ?? avatarUrl,
      },
    });
    return toPublicUser(linked, { emailVerified });
  }

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      googleId: payload.sub,
      displayName,
      avatarUrl,
    },
  });

  return toPublicUser(created, { emailVerified });
}

export async function getUserProfile(
  userId: string,
  options?: { emailVerified?: boolean },
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw notFound('Usuario no encontrado', 'USER_NOT_FOUND');
  }

  return toPublicUser(user, options);
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput,
  options?: { emailVerified?: boolean },
): Promise<PublicUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.bggUsername !== undefined ? { bggUsername: input.bggUsername } : {}),
    },
  });

  setCachedFirebaseUser(user);
  return toPublicUser(user, options);
}

export async function getInvitePreview(query: InvitePreviewQuery) {
  if (query.groupCode) {
    const group = await prisma.group.findFirst({
      where: {
        inviteCode: {
          equals: query.groupCode,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        _count: {
          select: {
            members: true,
          },
        },
        sessions: {
          where: {
            status: {
              in: [SessionStatus.voting, SessionStatus.planning, SessionStatus.locked],
            },
          },
          orderBy: [{ scheduledAt: 'asc' }],
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            status: true,
          },
        },
      },
    });

    if (!group) {
      throw notFound(
        'El link de invitación al grupo no es válido o expiró.',
        'GROUP_INVITE_NOT_FOUND',
      );
    }

    const activeSession =
      group.sessions.find((s) => s.status === SessionStatus.voting) ??
      group.sessions[0] ??
      null;

    return {
      kind: 'group' as const,
      groupId: group.id,
      groupName: group.name,
      inviteCode: group.inviteCode,
      membersCount: group._count.members,
      activeSession,
    };
  }

  if (query.seriesToken) {
    const series = await prisma.sessionSeries.findUnique({
      where: { shareToken: query.seriesToken },
      select: { id: true, frequency: true, shareToken: true, isActive: true },
    });

    if (!series) {
      throw notFound(
        'El link de la juntada recurrente no es válido o expiró.',
        'SERIES_NOT_FOUND',
      );
    }

    const ensured = await ensureActiveSeriesSession(series.id);
    if (!ensured?.activeSessionId) {
      throw notFound(
        'Esta juntada recurrente no tiene fechas disponibles.',
        'SESSION_NOT_FOUND',
      );
    }

    const activeSession = await prisma.session.findUnique({
      where: { id: ensured.activeSessionId },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        location: true,
        status: true,
        host: { select: { displayName: true } },
        group: { select: { name: true } },
        participants: {
          where: { rsvp: RsvpStatus.going },
          select: { userId: true },
        },
        _count: { select: { proposals: true } },
      },
    });

    if (!activeSession) {
      throw notFound('Juntada no encontrada.', 'SESSION_NOT_FOUND');
    }

    if (
      activeSession.status === SessionStatus.cancelled ||
      (!series.isActive && activeSession.status === SessionStatus.completed)
    ) {
      throw badRequest(
        'Esta juntada recurrente está pausada o cancelada.',
        undefined,
        'SERIES_PAUSED',
      );
    }

    return {
      kind: 'session' as const,
      sessionId: activeSession.id,
      sessionTitle: activeSession.title,
      groupName: activeSession.group?.name ?? 'Grupo',
      scheduledAt: activeSession.scheduledAt,
      location: activeSession.location,
      status: activeSession.status,
      hostName: activeSession.host.displayName,
      confirmedCount: activeSession.participants.length,
      proposalsCount: activeSession._count.proposals,
      isRecurring: true,
      recurrenceFrequency: series.frequency,
      seriesShareToken: series.shareToken,
    };
  }

  const session = await prisma.session.findUnique({
    where: { inviteToken: query.sessionToken! },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      location: true,
      status: true,
      host: { select: { displayName: true } },
      group: { select: { name: true } },
      participants: {
        where: { rsvp: RsvpStatus.going },
        select: { userId: true },
      },
      _count: {
        select: {
          proposals: true,
        },
      },
    },
  });

  if (!session) {
    throw notFound(
      'El link de invitación a la juntada no es válido o expiró.',
      'SESSION_INVITE_NOT_FOUND',
    );
  }

  if (session.status === SessionStatus.cancelled) {
    throw badRequest('Esta juntada fue cancelada.', undefined, 'SESSION_CANCELLED');
  }

  return {
    kind: 'session' as const,
    sessionId: session.id,
    sessionTitle: session.title,
    groupName: session.group?.name ?? 'Invitación directa',
    scheduledAt: session.scheduledAt,
    location: session.location,
    status: session.status,
    hostName: session.host.displayName,
    confirmedCount: session.participants.length,
    proposalsCount: session._count.proposals,
  };
}

export async function createGuestForInvite(input: GuestJoinInput) {
  const syntheticEmail = `guest+${randomUUID()}@guest.aquejugamos.local`;

  if (input.groupInviteCode) {
    const group = await prisma.group.findFirst({
      where: {
        inviteCode: {
          equals: input.groupInviteCode,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        sessions: {
          where: {
            status: {
              in: [SessionStatus.voting, SessionStatus.planning, SessionStatus.locked],
            },
          },
          orderBy: [{ scheduledAt: 'asc' }],
          select: { id: true, status: true },
        },
      },
    });

    if (!group) {
      throw notFound(
        'No encontramos ningún grupo con ese link de invitación.',
        'GROUP_INVITE_NOT_FOUND',
      );
    }

    const targetSession =
      group.sessions.find((s) => s.status === SessionStatus.voting) ??
      group.sessions[0] ??
      null;

    const user = await prisma.user.create({
      data: {
        email: syntheticEmail,
        displayName: input.displayName,
      },
    });

    if (targetSession) {
      await prisma.sessionParticipant.upsert({
        where: {
          sessionId_userId: { sessionId: targetSession.id, userId: user.id },
        },
        update: {
          rsvp: RsvpStatus.going,
          respondedAt: new Date(),
        },
        create: {
          sessionId: targetSession.id,
          userId: user.id,
          rsvp: RsvpStatus.going,
        },
      });
    }

    return {
      user: toPublicUser(user),
      guestScope: {
        kind: 'group' as const,
        groupId: group.id,
        groupName: group.name,
        targetSessionId: targetSession?.id ?? null,
      },
    };
  }

  if (input.seriesShareToken) {
    const series = await prisma.sessionSeries.findUnique({
      where: { shareToken: input.seriesShareToken },
      select: { id: true, isActive: true },
    });

    if (!series) {
      throw notFound(
        'El link de la juntada recurrente no es válido o expiró.',
        'SERIES_NOT_FOUND',
      );
    }

    if (!series.isActive) {
      throw badRequest(
        'Esta juntada recurrente está pausada.',
        undefined,
        'SERIES_PAUSED',
      );
    }

    const ensured = await ensureActiveSeriesSession(series.id);
    if (!ensured?.activeSessionId) {
      throw notFound(
        'Esta juntada recurrente no tiene fechas disponibles.',
        'SESSION_NOT_FOUND',
      );
    }

    const activeSession = await prisma.session.findUnique({
      where: { id: ensured.activeSessionId },
      select: {
        id: true,
        status: true,
        group: { select: { name: true } },
      },
    });

    if (!activeSession) {
      throw notFound('Juntada no encontrada.', 'SESSION_NOT_FOUND');
    }

    if (
      activeSession.status === SessionStatus.cancelled ||
      activeSession.status === SessionStatus.completed
    ) {
      throw badRequest(
        'Esta juntada recurrente está pausada o finalizada.',
        undefined,
        'SERIES_PAUSED',
      );
    }

    const user = await prisma.user.create({
      data: {
        email: syntheticEmail,
        displayName: input.displayName,
      },
    });

    await prisma.sessionParticipant.upsert({
      where: {
        sessionId_userId: { sessionId: activeSession.id, userId: user.id },
      },
      update: {
        rsvp: RsvpStatus.going,
        respondedAt: new Date(),
      },
      create: {
        sessionId: activeSession.id,
        userId: user.id,
        rsvp: RsvpStatus.going,
      },
    });

    return {
      user: toPublicUser(user),
      guestScope: {
        kind: 'session' as const,
        sessionId: activeSession.id,
        groupName: activeSession.group?.name ?? 'Grupo',
        targetSessionId: activeSession.id,
      },
    };
  }

  const session = await prisma.session.findUnique({
    where: { inviteToken: input.sessionInviteToken! },
    select: {
      id: true,
      status: true,
      group: { select: { name: true } },
    },
  });

  if (!session) {
    throw notFound(
      'El link de invitación a la juntada no es válido o expiró.',
      'SESSION_INVITE_NOT_FOUND',
    );
  }

  if (session.status === SessionStatus.cancelled) {
    throw badRequest('Esta juntada fue cancelada.', undefined, 'SESSION_CANCELLED');
  }

  const user = await prisma.user.create({
    data: {
      email: syntheticEmail,
      displayName: input.displayName,
    },
  });

  await prisma.sessionParticipant.upsert({
    where: {
      sessionId_userId: { sessionId: session.id, userId: user.id },
    },
    update: {
      rsvp: RsvpStatus.going,
      respondedAt: new Date(),
    },
    create: {
      sessionId: session.id,
      userId: user.id,
      rsvp: RsvpStatus.going,
    },
  });

  return {
    user: toPublicUser(user),
    guestScope: {
      kind: 'session' as const,
      sessionId: session.id,
      groupName: session.group?.name ?? 'Invitación directa',
      targetSessionId: session.id,
    },
  };
}
