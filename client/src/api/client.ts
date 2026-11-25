import { firebaseAuth } from '../lib/firebase';
import {
  generateClientRequestId,
  parseServerTimingHeader,
  recordClientApiCall,
} from './telemetry';

const TOKEN_STORAGE_KEY = 'aquejugamos_token';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getStoredGuestToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredGuestToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  authToken?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  ''
).replace(/\/+$/, '');

let warmUpSent = false;

/**
 * Envía un ping liviano y no bloqueante para despertar el servidor (cold start)
 * y abrir la conexión TLS en paralelo con la inicialización de autenticación.
 */
export function warmUpBackend(): void {
  if (warmUpSent || typeof window === 'undefined') return;
  warmUpSent = true;
  const url = new URL(`${API_BASE}/api/health`, window.location.origin);
  void fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    keepalive: true,
  }).catch(() => {
    // Permitir reintentar el precalentamiento si falló antes de estar online
    warmUpSent = false;
  });
}

function getFriendlyHttpFallbackMessage(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return 'El servidor se está iniciando. Esperá unos segundos y volvé a intentar.';
  }
  if (status === 408) {
    return 'La solicitud tardó demasiado. Intentá nuevamente en unos segundos.';
  }
  return 'Ocurrió un problema con el servidor. Intentá nuevamente en unos segundos.';
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    query,
    authToken,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    headers: customHeaders,
    ...rest
  } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.set(key, String(val));
      }
    }
  }

  const startedAt = performance.now();
  const method = (rest.method ?? 'GET').toUpperCase();
  const requestId = generateClientRequestId();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-request-id': requestId,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(customHeaders as Record<string, string> | undefined),
  };

  let token: string | null = authToken ?? null;
  let tokenAcquireMs = 0;
  if (!token && firebaseAuth.currentUser) {
    const tokenStart = performance.now();
    token = await firebaseAuth.currentUser.getIdToken();
    tokenAcquireMs = Math.round((performance.now() - tokenStart) * 100) / 100;
  } else if (!token) {
    token = getStoredGuestToken();
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId =
    timeoutMs > 0
      ? window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...rest,
      signal: controller.signal,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const clientTotalMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const errorCode = timedOut
      ? 'REQUEST_TIMEOUT'
      : error instanceof DOMException && error.name === 'AbortError'
        ? 'REQUEST_ABORTED'
        : 'NETWORK_ERROR';

    if (errorCode !== 'REQUEST_ABORTED') {
      recordClientApiCall({
        id: requestId,
        requestId,
        timestamp: new Date().toISOString(),
        method,
        path: `${url.pathname}${url.search}`,
        status: timedOut ? 408 : 0,
        ok: false,
        clientTotalMs,
        tokenAcquireMs,
        networkOverheadMs: Math.max(0, Math.round((clientTotalMs - tokenAcquireMs) * 100) / 100),
        responseBytes: 0,
        serverTiming: null,
        errorCode,
      });
    }

    if (timedOut) {
      throw new ApiError(
        408,
        'REQUEST_TIMEOUT',
        'El servidor está tardando más de lo habitual en responder. Intentá nuevamente en unos segundos.',
      );
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'REQUEST_ABORTED', 'La solicitud fue cancelada.');
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectar con el servidor. Verificá tu conexión o intentá nuevamente en unos segundos.',
    );
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  const serverRequestId = response.headers.get('x-request-id') ?? requestId;
  const serverTiming = parseServerTimingHeader(response.headers.get('server-timing'));

  if (response.status === 204) {
    const clientTotalMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const serverTotalMs = serverTiming?.serverTotalMs ?? 0;
    recordClientApiCall({
      id: serverRequestId,
      requestId: serverRequestId,
      timestamp: new Date().toISOString(),
      method,
      path: `${url.pathname}${url.search}`,
      status: 204,
      ok: true,
      clientTotalMs,
      tokenAcquireMs,
      networkOverheadMs: Math.max(
        0,
        Math.round((clientTotalMs - tokenAcquireMs - serverTotalMs) * 100) / 100,
      ),
      responseBytes: 0,
      serverTiming,
    });
    return undefined as T;
  }

  const text = await response.text();
  const clientTotalMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const responseBytes = text ? new TextEncoder().encode(text).byteLength : 0;
  const serverTotalMs = serverTiming?.serverTotalMs ?? 0;
  const networkOverheadMs = Math.max(
    0,
    Math.round((clientTotalMs - tokenAcquireMs - serverTotalMs) * 100) / 100,
  );

  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const errPayload = (
      json as { error?: { code?: string; message?: string; details?: unknown } }
    )?.error;
    const resolvedCode = errPayload?.code ?? `HTTP_${response.status}`;

    recordClientApiCall({
      id: serverRequestId,
      requestId: serverRequestId,
      timestamp: new Date().toISOString(),
      method,
      path: `${url.pathname}${url.search}`,
      status: response.status,
      ok: false,
      clientTotalMs,
      tokenAcquireMs,
      networkOverheadMs,
      responseBytes,
      serverTiming,
      errorCode: resolvedCode,
    });

    throw new ApiError(
      response.status,
      resolvedCode,
      errPayload?.message ?? getFriendlyHttpFallbackMessage(response.status),
      errPayload?.details,
    );
  }

  recordClientApiCall({
    id: serverRequestId,
    requestId: serverRequestId,
    timestamp: new Date().toISOString(),
    method,
    path: `${url.pathname}${url.search}`,
    status: response.status,
    ok: true,
    clientTotalMs,
    tokenAcquireMs,
    networkOverheadMs,
    responseBytes,
    serverTiming,
  });

  return json as T;
}
