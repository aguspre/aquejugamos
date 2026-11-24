import { Prisma, type User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import { getEnv } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, notFound, unauthorized } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import type {
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
