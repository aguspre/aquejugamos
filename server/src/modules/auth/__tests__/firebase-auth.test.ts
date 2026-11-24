import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../utils/errors.js';

const verifyFirebaseIdTokenMock = vi.fn();
const syncFirebaseUserMock = vi.fn();

vi.mock('../../../config/firebase.js', () => ({
  verifyFirebaseIdToken: (...args: unknown[]) => verifyFirebaseIdTokenMock(...args),
}));

vi.mock('../auth.service.js', () => ({
  syncFirebaseUser: (...args: unknown[]) => syncFirebaseUserMock(...args),
}));

import { authenticate } from '../../../middleware/auth.js';

function makeFakeJwt(header: Record<string, unknown>): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify({ sub: 'uid-1' })).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.fakesignature`;
}

describe('authenticate middleware (Firebase ID Token + legacy JWT)', () => {
  beforeEach(() => {
    verifyFirebaseIdTokenMock.mockReset();
    syncFirebaseUserMock.mockReset();
  });

  it('rechaza requests sin header Authorization', async () => {
    const request = { headers: {} } as FastifyRequest;
    await expect(authenticate(request, {} as FastifyReply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'MISSING_TOKEN',
    });
  });

  it('verifica tokens RS256 con Firebase Admin y sincroniza el usuario en Prisma', async () => {
    const firebaseToken = makeFakeJwt({ alg: 'RS256', kid: 'key-123' });

    verifyFirebaseIdTokenMock.mockResolvedValue({
      uid: 'fb-uid-42',
      email: 'agus@example.com',
      name: 'Agustín',
    });
    syncFirebaseUserMock.mockResolvedValue({
      id: 'prisma-uuid-1',
      email: 'agus@example.com',
      firebaseUid: 'fb-uid-42',
    });

    const request = {
      headers: { authorization: `Bearer ${firebaseToken}` },
      jwtVerify: vi.fn(),
    } as unknown as FastifyRequest;

    await authenticate(request, {} as FastifyReply);

    expect(verifyFirebaseIdTokenMock).toHaveBeenCalledWith(firebaseToken);
    expect(syncFirebaseUserMock).toHaveBeenCalledTimes(1);
    expect(request.user).toEqual({
      sub: 'prisma-uuid-1',
      email: 'agus@example.com',
      firebaseUid: 'fb-uid-42',
    });
  });

  it('devuelve 401 INVALID_FIREBASE_TOKEN si Firebase rechaza el token', async () => {
    const firebaseToken = makeFakeJwt({ alg: 'RS256', kid: 'key-123' });
    verifyFirebaseIdTokenMock.mockRejectedValue(new Error('auth/id-token-expired'));

    const request = {
      headers: { authorization: `Bearer ${firebaseToken}` },
    } as unknown as FastifyRequest;

    await expect(authenticate(request, {} as FastifyReply)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_FIREBASE_TOKEN',
    });
  });

  it('propaga 503 FIREBASE_NOT_CONFIGURED si faltan credenciales de firebase-admin', async () => {
    const firebaseToken = makeFakeJwt({ alg: 'RS256', kid: 'key-123' });
    verifyFirebaseIdTokenMock.mockRejectedValue(
      new AppError(503, 'FIREBASE_NOT_CONFIGURED', 'Firebase Admin no configurado'),
    );

    const request = {
      headers: { authorization: `Bearer ${firebaseToken}` },
    } as unknown as FastifyRequest;

    await expect(authenticate(request, {} as FastifyReply)).rejects.toMatchObject({
      statusCode: 503,
      code: 'FIREBASE_NOT_CONFIGURED',
    });
  });

  it('mantiene compatibilidad con JWT HS256 locales', async () => {
    const hs256Token = makeFakeJwt({ alg: 'HS256', typ: 'JWT' });
    const jwtVerify = vi.fn().mockResolvedValue(undefined);

    const request = {
      headers: { authorization: `Bearer ${hs256Token}` },
      jwtVerify,
    } as unknown as FastifyRequest;

    await authenticate(request, {} as FastifyReply);

    expect(verifyFirebaseIdTokenMock).not.toHaveBeenCalled();
    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });
});
