import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyFirebaseIdToken } from '../config/firebase.js';
import { syncFirebaseUser } from '../modules/auth/auth.service.js';
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
      firebaseUid: decoded.uid,
    };
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized('Token inválido o expirado', 'INVALID_TOKEN');
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
