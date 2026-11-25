import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getEnv } from '../config/env.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';
import { syncFirebaseUser } from '../modules/auth/auth.service.js';
import { recordAuthDuration } from '../telemetry/requestContext.js';
import { AppError, forbidden, unauthorized } from '../utils/errors.js';

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

/**
 * Inspecciona el encabezado JWT sin verificar firma solo para enrutar entre
 * tokens RS256 de Firebase Auth y JWT locales HS256 (compatibilidad legacy e invitados).
 * La validación criptográfica real siempre la realizan firebase-admin o @fastify/jwt.
 */
function isLikelyFirebaseToken(token: string): boolean {
  const [encodedHeader] = token.split('.');
  if (!encodedHeader) return false;
  try {
    const headerJson = Buffer.from(encodedHeader, 'base64url').toString('utf8');
    const header = JSON.parse(headerJson) as { alg?: string; kid?: string };
    return header.alg === 'RS256' || typeof header.kid === 'string';
  } catch {
    return false;
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const startedAt = performance.now();
  try {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw unauthorized('Token de autorización requerido', 'MISSING_TOKEN');
    }

    if (isLikelyFirebaseToken(token)) {
      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(token);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw unauthorized(
          'Token de Firebase inválido o expirado',
          'INVALID_FIREBASE_TOKEN',
        );
      }

      const user = await syncFirebaseUser(decoded);
      request.syncedUser = user;
      request.user = {
        sub: user.id,
        email: user.email,
        emailVerified: Boolean(decoded.email_verified),
        firebaseUid: decoded.uid,
      };
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Token inválido o expirado', 'INVALID_TOKEN');
    }
  } finally {
    recordAuthDuration(performance.now() - startedAt);
  }
}

export function isUserAdminEmail(
  email: string | null | undefined,
  emailVerified = false,
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.endsWith('@guest.aquejugamos.local')) {
    return false;
  }

  const env = getEnv();
  const devBypassEnabled =
    env.NODE_ENV === 'development' &&
    (env.ALLOW_DEV_ADMIN_BYPASS === 'true' || env.ALLOW_DEV_ADMIN_BYPASS === '1');

  if (devBypassEnabled) {
    return true;
  }

  if (!emailVerified) {
    return false;
  }

  const allowed = env.ADMIN_EMAILS.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}

export function hasValidAdminTokenHeader(
  headerValue: string | string[] | undefined,
): boolean {
  if (Array.isArray(headerValue)) return false;
  const configuredToken = getEnv().ADMIN_METRICS_TOKEN.trim();
  if (configuredToken.length < 16) return false;
  const provided = headerValue?.trim();
  if (!provided) return false;

  const expectedDigest = createHash('sha256').update(configuredToken, 'utf8').digest();
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

export async function requireAdminMonitorAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (hasValidAdminTokenHeader(request.headers['x-admin-token'])) {
    request.hasAdminTokenAuth = true;
    return;
  }

  await authenticate(request, reply);
  if (
    request.user?.isGuest ||
    !isUserAdminEmail(request.user?.email, Boolean(request.user?.emailVerified))
  ) {
    throw forbidden(
      'No tenés permisos para consultar las métricas internas del servidor.',
      'ADMIN_ACCESS_REQUIRED',
    );
  }
}

export async function requireRegisteredUser(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (request.user?.isGuest) {
    throw forbidden(
      'Esta acción requiere una cuenta registrada. Iniciá sesión o creá tu cuenta para continuar.',
      'GUEST_ACTION_FORBIDDEN',
    );
  }
}
