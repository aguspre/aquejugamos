import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRawMock } = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    'postgresql://user:pass@ep-demo-pooler.us-west-2.aws.neon.tech/db';
  process.env.DATABASE_URL_UNPOOLED = '';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-16-chars';
  process.env.ADMIN_EMAILS = 'admin@aquejugamos.com';
  process.env.ALLOW_DEV_ADMIN_BYPASS = 'false';
  process.env.ADMIN_METRICS_TOKEN = 'super-secret-monitor-token-32chars!';
  process.env.RENDER_REGION = 'oregon';
  return {
    queryRawMock: vi.fn(),
  };
});

vi.mock('../../../config/prisma.js', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

vi.mock('../../../config/firebase.js', () => ({
  isFirebaseAdminConfigured: () => true,
  verifyFirebaseIdToken: vi.fn(),
}));

import { buildApp } from '../../../app.js';

describe('Telemetry, Server-Timing, compression & /api/status/metrics', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  }, 20_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    queryRawMock.mockReset();
    queryRawMock.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('devuelve 503 en /api/health cuando PostgreSQL falla y luego 200 con CORS + Server-Timing', async () => {
    // Primera consulta (sin cache previo): fallo de DB -> 503
    queryRawMock.mockRejectedValueOnce(new Error('DB connection error'));
    const downRes = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        'x-request-id': 'bad header!@#', // inválido -> servidor debe regenerar UUID seguro
      },
    });
    expect(downRes.statusCode).toBe(503);
    expect(downRes.json().status).toBe('down');
    expect(downRes.headers['x-request-id']).not.toBe('bad header!@#');

    // Liveness no golpea la base de datos
    queryRawMock.mockClear();
    const liveRes = await app.inject({
      method: 'GET',
      url: '/api/health/live',
    });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().status).toBe('ok');
    expect(queryRawMock).not.toHaveBeenCalled();

    // Preflight CORS con maxAge 86400 y origin permitido
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/sessions',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers':
          'authorization,content-type,x-request-id,x-admin-token',
      },
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(preflight.headers['access-control-max-age']).toBe('86400');
    expect(
      String(preflight.headers['access-control-allow-headers']).toLowerCase(),
    ).toContain('x-admin-token');

    // Esperar expiración del cache corto de error (1.5s) o forzar ping fresco desde metrics
    const freshMetrics = await app.inject({
      method: 'GET',
      url: '/api/status/metrics?fresh=1',
      headers: {
        origin: 'http://localhost:5173',
        'x-request-id': 'client-req-12345',
        'x-admin-token': 'super-secret-monitor-token-32chars!',
      },
    });
    expect(freshMetrics.statusCode).toBe(200);
    expect(freshMetrics.headers['x-request-id']).toBe('client-req-12345');
    expect(String(freshMetrics.headers['access-control-expose-headers'])).toContain(
      'Server-Timing',
    );
    expect(String(freshMetrics.headers['server-timing'])).toContain('total;dur=');

    const okHealth = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(okHealth.statusCode).toBe(200);
    expect(okHealth.json().status).toBe('ok');
  });

  it('restringe /api/status/metrics a admins con email verificado o x-admin-token y comprime con Brotli y Gzip', async () => {
    // 1. Sin credenciales -> 401
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/status/metrics',
    });
    expect(unauth.statusCode).toBe(401);

    // 2. x-admin-token inválido -> cae en authenticate y devuelve 401
    const badAdminToken = await app.inject({
      method: 'GET',
      url: '/api/status/metrics',
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(badAdminToken.statusCode).toBe(401);

    // 3. Usuario en ADMIN_EMAILS pero con emailVerified = false -> 403 (evita account takeover / spoofing)
    const unverifiedAdminJwt = app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      email: 'admin@aquejugamos.com',
      emailVerified: false,
    });
    const unverifiedRes = await app.inject({
      method: 'GET',
      url: '/api/status/metrics',
      headers: { authorization: `Bearer ${unverifiedAdminJwt}` },
    });
    expect(unverifiedRes.statusCode).toBe(403);

    // 4. Invitado -> 403
    const guestJwt = app.jwt.sign({
      sub: '33333333-3333-4333-8333-333333333333',
      email: 'admin@aquejugamos.com',
      emailVerified: true,
      isGuest: true,
    });
    const guestRes = await app.inject({
      method: 'GET',
      url: '/api/status/metrics',
      headers: { authorization: `Bearer ${guestJwt}` },
    });
    expect(guestRes.statusCode).toBe(403);

    // 5. Usuario en ADMIN_EMAILS con emailVerified = true -> 200
    const verifiedAdminJwt = app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      email: 'admin@aquejugamos.com',
      emailVerified: true,
    });
    const okAdmin = await app.inject({
      method: 'GET',
      url: '/api/status/metrics?fresh=1',
      headers: { authorization: `Bearer ${verifiedAdminJwt}` },
    });
    expect(okAdmin.statusCode).toBe(200);
    const adminBody = okAdmin.json();
    expect(adminBody.health.db.pooled).toBe(true);
    expect(adminBody.health.db.dbRegionHint).toBe('us-west-2');
    expect(adminBody.health.db.serverRegionHint).toBe('oregon');
    expect(adminBody.health.db.regionMismatchWarning).toBeNull();

    // 6. Generar varias rutas distintas + 404s para garantizar payload > 1024 B y probar Brotli + Gzip reales
    for (let i = 0; i < 8; i += 1) {
      await app.inject({ method: 'GET', url: `/ruta-inexistente-${i}` });
    }
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
    await app.inject({ method: 'GET', url: '/api/groups' });
    await app.inject({ method: 'GET', url: '/api/library' });
    await app.inject({ method: 'GET', url: '/api/play-logs' });

    const compressedBr = await app.inject({
      method: 'GET',
      url: '/api/status/metrics',
      headers: {
        'x-admin-token': 'super-secret-monitor-token-32chars!',
        'accept-encoding': 'br, gzip',
      },
    });
    expect(compressedBr.statusCode).toBe(200);
    expect(compressedBr.headers['content-encoding']).toBe('br');
    expect(String(compressedBr.headers['vary']).toLowerCase()).toContain(
      'accept-encoding',
    );

    const decompressedText = brotliDecompressSync(compressedBr.rawPayload).toString(
      'utf8',
    );
    expect(Buffer.byteLength(decompressedText, 'utf8')).toBeGreaterThanOrEqual(1024);
    expect(compressedBr.rawPayload.byteLength).toBeLessThan(
      Buffer.byteLength(decompressedText, 'utf8'),
    );

    const parsed = JSON.parse(decompressedText);
    const unmatchedBuckets = parsed.routes.filter(
      (r: { route: string }) => r.route === 'UNMATCHED_ROUTE',
    );
    expect(unmatchedBuckets).toHaveLength(1);
    expect(unmatchedBuckets[0].count).toBeGreaterThanOrEqual(8);
    expect(
      parsed.routes.some((r: { route: string }) => r.route.includes('ruta-inexistente')),
    ).toBe(false);

    // Gzip fallback cuando el cliente solo acepta gzip
    const compressedGzip = await app.inject({
      method: 'GET',
      url: '/api/status/metrics',
      headers: {
        'x-admin-token': 'super-secret-monitor-token-32chars!',
        'accept-encoding': 'gzip',
      },
    });
    expect(compressedGzip.statusCode).toBe(200);
    expect(compressedGzip.headers['content-encoding']).toBe('gzip');
    const unzipped = JSON.parse(gunzipSync(compressedGzip.rawPayload).toString('utf8'));
    expect(unzipped.status).toBe('ok');
  });
});
