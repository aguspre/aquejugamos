import { AsyncLocalStorage } from 'node:async_hooks';

export interface SlowQueryEntry {
  target: string;
  durationMs: number;
}

export interface RequestTelemetryStore {
  requestId: string;
  method: string;
  startedAtMs: number;
  authDurationMs: number;
  dbQueryCount: number;
  dbTotalMs: number;
  dbMaxMs: number;
  slowQueries: SlowQueryEntry[];
  uncompressedBytes: number;
  wireBytes: number;
  encoding: 'br' | 'gzip' | 'identity';
}

const requestTelemetryStorage = new AsyncLocalStorage<RequestTelemetryStore>();

const MAX_SLOW_QUERIES_PER_REQUEST = 8;

export function runWithRequestTelemetry<T>(
  store: RequestTelemetryStore,
  fn: () => T,
): T {
  return requestTelemetryStorage.run(store, fn);
}

export function getRequestTelemetry(): RequestTelemetryStore | undefined {
  return requestTelemetryStorage.getStore();
}

export function recordAuthDuration(durationMs: number): void {
  const store = requestTelemetryStorage.getStore();
  if (!store) return;
  store.authDurationMs += durationMs;
}

export function recordDbOperation(
  target: string,
  durationMs: number,
  slowThresholdMs: number,
): void {
  const store = requestTelemetryStorage.getStore();
  if (!store) return;

  const rounded = Math.round(durationMs * 100) / 100;
  store.dbQueryCount += 1;
  store.dbTotalMs += durationMs;
  if (durationMs > store.dbMaxMs) {
    store.dbMaxMs = durationMs;
  }

  if (
    durationMs >= slowThresholdMs &&
    store.slowQueries.length < MAX_SLOW_QUERIES_PER_REQUEST
  ) {
    store.slowQueries.push({
      target,
      durationMs: rounded,
    });
  }
}
