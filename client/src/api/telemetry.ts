export interface ParsedServerTiming {
  authMs: number;
  dbMs: number;
  dbQueries: number;
  appMs: number;
  serverTotalMs: number;
}

export interface ClientApiTelemetryEntry {
  id: string;
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  clientTotalMs: number;
  tokenAcquireMs: number;
  networkOverheadMs: number;
  responseBytes: number;
  serverTiming: ParsedServerTiming | null;
  errorCode?: string;
}

const MAX_CLIENT_ENTRIES = 60;
const entries: ClientApiTelemetryEntry[] = [];
const listeners = new Set<() => void>();
let snapshotCache: ClientApiTelemetryEntry[] = [];

function notifyListeners(): void {
  snapshotCache = [...entries];
  for (const listener of listeners) {
    listener();
  }
}

export function generateClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseServerTimingHeader(raw: string | null): ParsedServerTiming | null {
  if (!raw) return null;

  let authMs = 0;
  let dbMs = 0;
  let dbQueries = 0;
  let appMs = 0;
  let serverTotalMs = 0;
  let matchedAny = false;

  for (const metric of raw.split(',')) {
    const parts = metric.split(';').map((p) => p.trim());
    const name = parts[0]?.toLowerCase();
    if (!name) continue;

    let dur = 0;
    let desc = '';
    for (let i = 1; i < parts.length; i += 1) {
      const part = parts[i]!;
      if (part.toLowerCase().startsWith('dur=')) {
        const val = Number(part.slice(4));
        if (Number.isFinite(val)) dur = val;
      } else if (part.toLowerCase().startsWith('desc=')) {
        desc = part.slice(5).replace(/^"|"$/g, '');
      }
    }

    if (name === 'auth') {
      authMs = dur;
      matchedAny = true;
    } else if (name === 'db') {
      dbMs = dur;
      const qMatch = desc.match(/^(\d+)q$/i);
      if (qMatch) dbQueries = Number(qMatch[1]);
      matchedAny = true;
    } else if (name === 'app') {
      appMs = dur;
      matchedAny = true;
    } else if (name === 'total') {
      serverTotalMs = dur;
      matchedAny = true;
    }
  }

  return matchedAny
    ? { authMs, dbMs, dbQueries, appMs, serverTotalMs }
    : null;
}

export function recordClientApiCall(entry: ClientApiTelemetryEntry): void {
  entries.unshift(entry);
  if (entries.length > MAX_CLIENT_ENTRIES) {
    entries.length = MAX_CLIENT_ENTRIES;
  }
  notifyListeners();
}

export function clearClientApiTelemetry(): void {
  entries.length = 0;
  notifyListeners();
}

export function getClientApiTelemetrySnapshot(): ClientApiTelemetryEntry[] {
  return snapshotCache;
}

export function subscribeClientApiTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
