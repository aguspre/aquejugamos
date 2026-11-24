import { firebaseAuth } from '../lib/firebase';

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

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(customHeaders as Record<string, string> | undefined),
  };

  let token: string | null = authToken ?? null;
  if (!token && firebaseAuth.currentUser) {
    token = await firebaseAuth.currentUser.getIdToken();
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

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
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
    throw new ApiError(
      response.status,
      errPayload?.code ?? `HTTP_${response.status}`,
      errPayload?.message ?? getFriendlyHttpFallbackMessage(response.status),
      errPayload?.details,
    );
  }

  return json as T;
}
