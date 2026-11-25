import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  brotliCompress as brotliCompressCb,
  constants as zlibConstants,
  gzip as gzipCb,
} from 'node:zlib';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getEnv } from '../config/env.js';
import { metricsStore } from './metricsStore.js';
import {
  getRequestTelemetry,
  runWithRequestTelemetry,
  type RequestTelemetryStore,
} from './requestContext.js';

const brotliCompress = promisify(brotliCompressCb);
const gzipCompress = promisify(gzipCb);

const SAFE_REQUEST_ID_RE = /^[a-zA-Z0-9._-]{4,64}$/;
const MIN_COMPRESS_BYTES = 1024;

function resolveSafeRequestId(headerValue: string | string[] | undefined): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (candidate && SAFE_REQUEST_ID_RE.test(candidate.trim())) {
    return candidate.trim();
  }
  return randomUUID();
}

function appendVaryHeader(reply: FastifyReply, field: string): void {
  const existing = reply.getHeader('vary');
  if (!existing) {
    reply.header('Vary', field);
    return;
  }
  const str = Array.isArray(existing) ? existing.join(', ') : String(existing);
  const parts = str.split(',').map((p) => p.trim().toLowerCase());
  if (!parts.includes(field.toLowerCase())) {
    reply.header('Vary', `${str}, ${field}`);
  }
}

function isCompressibleContentType(contentType: unknown): boolean {
  if (typeof contentType !== 'string') return false;
  const lower = contentType.toLowerCase();
  return (
    lower.includes('application/json') ||
    lower.startsWith('text/') ||
    lower.includes('application/javascript') ||
    lower.includes('image/svg+xml')
  );
}

function pickEncoding(
  acceptEncodingHeader: string | string[] | undefined,
): 'br' | 'gzip' | null {
  if (!acceptEncodingHeader) return null;
  const raw = Array.isArray(acceptEncodingHeader)
    ? acceptEncodingHeader.join(',')
    : acceptEncodingHeader;
  const lower = raw.toLowerCase();
  if (/\bbr\b(?:\s*;\s*q=(?!0(?:\.0+)?\b))?/.test(lower) && !/br\s*;\s*q=0(\.0+)?\b/.test(lower)) {
    return 'br';
  }
  if (
    /\bgzip\b(?:\s*;\s*q=(?!0(?:\.0+)?\b))?/.test(lower) &&
    !/gzip\s*;\s*q=0(\.0+)?\b/.test(lower)
  ) {
    return 'gzip';
  }
  return null;
}

function formatServerTiming(store: RequestTelemetryStore, totalMs: number): string {
  const authMs = Math.round(store.authDurationMs * 100) / 100;
  const dbMs = Math.round(store.dbTotalMs * 100) / 100;
  const appMs = Math.max(0, Math.round((totalMs - authMs - dbMs) * 100) / 100);
  const totMs = Math.round(totalMs * 100) / 100;

  return [
    `auth;dur=${authMs}`,
    `db;dur=${dbMs};desc="${store.dbQueryCount}q"`,
    `app;dur=${appMs}`,
    `total;dur=${totMs}`,
  ].join(', ');
}

export function registerTelemetryAndCompression(app: FastifyInstance): void {
  const env = getEnv();

  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    const requestId = resolveSafeRequestId(request.headers['x-request-id']);
    const store: RequestTelemetryStore = {
      requestId,
      method: request.method,
      startedAtMs: performance.now(),
      authDurationMs: 0,
      dbQueryCount: 0,
      dbTotalMs: 0,
      dbMaxMs: 0,
      slowQueries: [],
      uncompressedBytes: 0,
      wireBytes: 0,
      encoding: 'identity',
    };

    reply.header('x-request-id', requestId);
    runWithRequestTelemetry(store, done);
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const store = getRequestTelemetry();
    appendVaryHeader(reply, 'Accept-Encoding');

    let finalPayload = payload;
    let rawBuffer: Buffer | null = null;

    if (typeof payload === 'string') {
      rawBuffer = Buffer.from(payload, 'utf8');
    } else if (Buffer.isBuffer(payload)) {
      rawBuffer = payload;
    }

    if (rawBuffer && store) {
      store.uncompressedBytes = rawBuffer.byteLength;
      store.wireBytes = request.method === 'HEAD' ? 0 : rawBuffer.byteLength;
    }

    if (
      rawBuffer &&
      request.method !== 'HEAD' &&
      rawBuffer.byteLength >= MIN_COMPRESS_BYTES &&
      !reply.getHeader('content-encoding') &&
      isCompressibleContentType(reply.getHeader('content-type'))
    ) {
      const encoding = pickEncoding(request.headers['accept-encoding']);
      if (encoding === 'br') {
        const compressed = await brotliCompress(rawBuffer, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: rawBuffer.byteLength,
          },
        });
        if (compressed.byteLength < rawBuffer.byteLength) {
          reply.header('Content-Encoding', 'br');
          reply.header('Content-Length', String(compressed.byteLength));
          finalPayload = compressed;
          if (store) {
            store.wireBytes = compressed.byteLength;
            store.encoding = 'br';
          }
        }
      } else if (encoding === 'gzip') {
        const compressed = await gzipCompress(rawBuffer, { level: 6 });
        if (compressed.byteLength < rawBuffer.byteLength) {
          reply.header('Content-Encoding', 'gzip');
          reply.header('Content-Length', String(compressed.byteLength));
          finalPayload = compressed;
          if (store) {
            store.wireBytes = compressed.byteLength;
            store.encoding = 'gzip';
          }
        }
      }
    }

    // Only expose Server-Timing to authenticated callers or health/status checks
    // (avoiding timing side-channels on public /api/auth/login or /invite-preview)
    const isAuthenticatedCaller = Boolean(
      request.user?.sub || request.hasAdminTokenAuth,
    );
    const routeUrl = request.routeOptions?.url ?? '';
    const canExposeServerTiming =
      isAuthenticatedCaller || routeUrl === '/api/health';

    if (store && canExposeServerTiming) {
      const totalMs = performance.now() - store.startedAtMs;
      reply.header('Server-Timing', formatServerTiming(store, totalMs));
    }

    return finalPayload;
  });

  app.addHook('onResponse', (request, reply, done) => {
    const store = getRequestTelemetry();
    if (!store || request.method === 'OPTIONS') {
      done();
      return;
    }

    const totalMs = performance.now() - store.startedAtMs;
    const rawRoute = request.routeOptions?.url;
    const normalizedRoute =
      rawRoute && rawRoute !== '/*' ? rawRoute : 'UNMATCHED_ROUTE';

    if (normalizedRoute !== '/api/health/live') {
      metricsStore.recordRequest(
        {
          requestId: store.requestId,
          timestamp: Date.now(),
          method: request.method,
          route: normalizedRoute,
          statusCode: reply.statusCode,
          totalMs,
          authMs: store.authDurationMs,
          dbMs: store.dbTotalMs,
          dbQueryCount: store.dbQueryCount,
          slowQueries: store.slowQueries,
          uncompressedBytes: store.uncompressedBytes,
          wireBytes: store.wireBytes,
          encoding: store.encoding,
          errorCode: reply.telemetryErrorCode,
        },
        env.SLOW_REQUEST_THRESHOLD_MS,
      );
    }

    if (env.NODE_ENV !== 'test' && normalizedRoute !== '/api/health/live') {
      const logPayload = {
        reqId: store.requestId,
        method: request.method,
        route: normalizedRoute,
        status: reply.statusCode,
        totalMs: Math.round(totalMs * 100) / 100,
        authMs: Math.round(store.authDurationMs * 100) / 100,
        dbMs: Math.round(store.dbTotalMs * 100) / 100,
        dbQueries: store.dbQueryCount,
        ...(store.slowQueries.length > 0 ? { slowQueries: store.slowQueries } : {}),
        bytes: store.uncompressedBytes,
        wireBytes: store.wireBytes,
        enc: store.encoding,
        ...(request.user?.sub ? { userId: request.user.sub } : {}),
        ...(reply.telemetryErrorCode ? { errorCode: reply.telemetryErrorCode } : {}),
      };

      if (reply.statusCode >= 500) {
        request.log.error(logPayload, 'HTTP request failed');
      } else if (
        totalMs >= env.SLOW_REQUEST_THRESHOLD_MS ||
        store.dbQueryCount >= 10 ||
        store.uncompressedBytes >= 50_000 ||
        reply.statusCode >= 400
      ) {
        request.log.warn(logPayload, 'HTTP slow or warning request');
      } else {
        request.log.info(logPayload, 'HTTP request completed');
      }
    }

    done();
  });
}
