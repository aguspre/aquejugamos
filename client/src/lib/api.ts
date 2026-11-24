import { firebaseAuth } from './firebase';

export interface BackendUserProfile {
  id: string;
  email: string;
  firebaseUid: string | null;
  displayName: string;
  avatarUrl: string | null;
  bggUsername: string | null;
  lastBggSyncAt: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

interface ApiRequestOptions extends RequestInit {
  authToken?: string;
  requireAuth?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { authToken, requireAuth = true, headers, ...fetchOptions } = options;

  const resolvedHeaders = new Headers(headers);
  if (fetchOptions.body && !resolvedHeaders.has('Content-Type')) {
    resolvedHeaders.set('Content-Type', 'application/json');
  }

  let token = authToken;
  if (!token && requireAuth && firebaseAuth.currentUser) {
    token = await firebaseAuth.currentUser.getIdToken();
  }

  if (token) {
    resolvedHeaders.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: resolvedHeaders,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const code = payload?.error?.code ?? 'API_ERROR';
    const message =
      payload?.error?.message ??
      `Error al comunicarse con el servidor (HTTP ${response.status})`;
    throw new ApiError(response.status, code, message);
  }

  return payload as T;
}

export async function syncBackendUser(
  payload?: {
    displayName?: string;
    avatarUrl?: string | null;
    bggUsername?: string | null;
  },
  authToken?: string,
): Promise<BackendUserProfile> {
  const response = await apiRequest<{ user: BackendUserProfile }>('/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
    authToken,
  });
  return response.user;
}

export async function updateBackendUser(payload: {
  displayName?: string;
  avatarUrl?: string | null;
  bggUsername?: string | null;
}): Promise<BackendUserProfile> {
  const response = await apiRequest<{ user: BackendUserProfile }>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.user;
}
