import { randomUUID } from 'node:crypto';
import { Prisma, RsvpStatus, SessionStatus, type User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import { getEnv } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, notFound, unauthorized } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
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
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firebaseUid: user.firebaseUid,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bggUsername: user.bggUsername,
    lastBggSyncAt: user.lastBggSyncAt,
    createdAt: user.createdAt,
  };
}

export async function syncFirebaseUser(decoded: DecodedIdToken): Promise<User> {
  const existingByUid = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  const picture = typeof decoded.picture === 'string' && decoded.picture.trim()
    ? decoded.picture.trim()
    : null;

  if (existingByUid) {
    if (!existingByUid.avatarUrl && picture) {
      return prisma.user.update({
        where: { id: existingByUid.id },
        data: { avatarUrl: picture },
      });
    }
    return existingByUid;
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
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        firebaseUid: decoded.uid,
        avatarUrl: existingByEmail.avatarUrl ?? picture,
      },
    });
  }

  try {
    return await prisma.user.create({
      data: {
        email: rawEmail,
        firebaseUid: decoded.uid,
        displayName,
        avatarUrl: picture,
      },
    });
  } catch (error) {
    // Manejo seguro de race condition cuando llegan requests concurrentes en el primer login
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const recovered =
        (await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } })) ??
        (await prisma.user.findUnique({ where: { email: rawEmail } }));

      if (recovered) {
        if (!recovered.firebaseUid) {
          return prisma.user.update({
            where: { id: recovered.id },
            data: { firebaseUid: decoded.uid },
          });
        }
        return recovered;
      }
    }
    throw error;
  }
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
    return toPublicUser(updated);
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingByEmail) {
    const linked = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleId: payload.sub,
        avatarUrl: existingByEmail.avatarUrl ?? avatarUrl,
      },
    });
    return toPublicUser(linked);
  }

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      googleId: payload.sub,
      displayName,
      avatarUrl,
    },
  });

  return toPublicUser(created);
}

export async function getUserProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw notFound('Usuario no encontrado', 'USER_NOT_FOUND');
  }

  return toPublicUser(user);
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.bggUsername !== undefined ? { bggUsername: input.bggUsername } : {}),
    },
  });

  return toPublicUser(user);
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
      activeSession,
    };
  }

  const session = await prisma.session.findUnique({
    where: { inviteToken: query.sessionToken! },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
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

  return {
    kind: 'session' as const,
    sessionId: session.id,
    sessionTitle: session.title,
    groupName: session.group?.name ?? 'Invitación directa',
    scheduledAt: session.scheduledAt,
    status: session.status,
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
