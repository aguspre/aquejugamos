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

function getFallbackJwtToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  authToken?: string;
}

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  ''
).replace(/\/+$/, '');

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, authToken, headers: customHeaders, ...rest } = options;

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
    token = getFallbackJwtToken();
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...rest,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Verificá que el backend esté corriendo en el puerto 3001.',
    );
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
      errPayload?.message ?? `Error del servidor (HTTP ${response.status})`,
      errPayload?.details,
    );
  }

  return json as T;
}
