import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { SlowQueryEntry } from './requestContext.js';

export interface RequestMetricSample {
  requestId: string;
  timestamp: number;
  method: string;
  route: string;
  statusCode: number;
  totalMs: number;
  authMs: number;
  dbMs: number;
  dbQueryCount: number;
  slowQueries: SlowQueryEntry[];
  uncompressedBytes: number;
  wireBytes: number;
  encoding: 'br' | 'gzip' | 'identity';
  errorCode?: string;
}

export interface RouteMetricsSummary {
  key: string;
  method: string;
  route: string;
  count: number;
  error4xxCount: number;
  error5xxCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  avgDbQueries: number;
  avgDbMs: number;
  avgPayloadBytes: number;
  totalPayloadBytes: number;
  totalWireBytes: number;
}

export interface DbPingSample {
  timestamp: string;
  pingMs: number;
  ok: boolean;
  coldStartSuspected: boolean;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes rolling window
const MAX_SAMPLES = 1500;
const MAX_NOTABLE_EVENTS = 40;
const MAX_DB_PINGS = 25;
const COLD_START_PING_THRESHOLD_MS = 400;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return round2(sortedAsc[idx] ?? 0);
}

class BackendMetricsCollector {
  private samples: RequestMetricSample[] = [];
  private notableEvents: RequestMetricSample[] = [];
  private dbPings: DbPingSample[] = [];
  private lastDbActivityAt = 0;
  private eventLoopHistogram: IntervalHistogram | null = null;
  private readonly startedAt = Date.now();

  constructor() {
    try {
      const h = monitorEventLoopDelay({ resolution: 20 });
      h.enable();
      this.eventLoopHistogram = h;
    } catch {
      this.eventLoopHistogram = null;
    }
  }

  public recordRequest(
    sample: RequestMetricSample,
    slowThresholdMs: number,
  ): void {
    this.pruneOldSamples(sample.timestamp);
    if (this.samples.length >= MAX_SAMPLES) {
      this.samples.shift();
    }
    this.samples.push(sample);

    const isSlow = sample.totalMs >= slowThresholdMs || sample.dbQueryCount >= 10;
    const isServerError = sample.statusCode >= 500;
    if (isSlow || isServerError) {
      if (this.notableEvents.length >= MAX_NOTABLE_EVENTS) {
        this.notableEvents.shift();
      }
      this.notableEvents.push(sample);
    }
  }

  public getLastDbActivityAt(): number {
    return this.lastDbActivityAt;
  }

  public recordDbPing(
    pingMs: number,
    ok: boolean,
    previousActivityAt?: number,
  ): DbPingSample {
    const now = Date.now();
    const refActivity =
      previousActivityAt !== undefined ? previousActivityAt : this.lastDbActivityAt;
    const idleMs = refActivity > 0 ? now - refActivity : Infinity;
    const coldStartSuspected =
      ok && pingMs >= COLD_START_PING_THRESHOLD_MS && idleMs >= 4 * 60 * 1000;

    if (ok) {
      this.lastDbActivityAt = now;
    }

    const entry: DbPingSample = {
      timestamp: new Date(now).toISOString(),
      pingMs: round2(pingMs),
      ok,
      coldStartSuspected,
    };

    if (this.dbPings.length >= MAX_DB_PINGS) {
      this.dbPings.shift();
    }
    this.dbPings.push(entry);
    return entry;
  }

  public touchDbActivity(): void {
    this.lastDbActivityAt = Date.now();
  }

  public getSnapshot() {
    const now = Date.now();
    this.pruneOldSamples(now);

    const totalRequests = this.samples.length;
    const allDurations = this.samples.map((s) => s.totalMs).sort((a, b) => a - b);
    const error5xxCount = this.samples.filter((s) => s.statusCode >= 500).length;
    const error4xxCount = this.samples.filter(
      (s) => s.statusCode >= 400 && s.statusCode < 500,
    ).length;
    const totalPayloadBytes = this.samples.reduce(
      (acc, s) => acc + s.uncompressedBytes,
      0,
    );
    const totalWireBytes = this.samples.reduce((acc, s) => acc + s.wireBytes, 0);

    const byRouteMap = new Map<string, RequestMetricSample[]>();
    for (const sample of this.samples) {
      const key = `${sample.method} ${sample.route}`;
      let list = byRouteMap.get(key);
      if (!list) {
        list = [];
        byRouteMap.set(key, list);
      }
      list.push(sample);
    }

    const routes: RouteMetricsSummary[] = Array.from(byRouteMap.entries())
      .map(([key, items]) => {
        const count = items.length;
        const durations = items.map((i) => i.totalMs).sort((a, b) => a - b);
        const sumMs = items.reduce((a, b) => a + b.totalMs, 0);
        const sumDbQ = items.reduce((a, b) => a + b.dbQueryCount, 0);
        const sumDbMs = items.reduce((a, b) => a + b.dbMs, 0);
        const sumBytes = items.reduce((a, b) => a + b.uncompressedBytes, 0);
        const sumWire = items.reduce((a, b) => a + b.wireBytes, 0);
        const first = items[0]!;

        return {
          key,
          method: first.method,
          route: first.route,
          count,
          error4xxCount: items.filter(
            (i) => i.statusCode >= 400 && i.statusCode < 500,
          ).length,
          error5xxCount: items.filter((i) => i.statusCode >= 500).length,
          avgMs: round2(sumMs / count),
          p50Ms: percentile(durations, 50),
          p95Ms: percentile(durations, 95),
          p99Ms: percentile(durations, 99),
          maxMs: round2(durations[durations.length - 1] ?? 0),
          avgDbQueries: round2(sumDbQ / count),
          avgDbMs: round2(sumDbMs / count),
          avgPayloadBytes: Math.round(sumBytes / count),
          totalPayloadBytes: sumBytes,
          totalWireBytes: sumWire,
        };
      })
      .sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);

    const mem = process.memoryUsage();
    const el = this.eventLoopHistogram;
    const nsToMs = (ns: number) =>
      Number.isFinite(ns) && ns > 0 ? round2(ns / 1_000_000) : 0;

    return {
      uptimeSeconds: Math.floor((now - this.startedAt) / 1000),
      startedAt: new Date(this.startedAt).toISOString(),
      windowMinutes: WINDOW_MS / 60_000,
      summary: {
        totalRequests,
        error4xxCount,
        error5xxCount,
        p50Ms: percentile(allDurations, 50),
        p95Ms: percentile(allDurations, 95),
        p99Ms: percentile(allDurations, 99),
        maxMs: round2(allDurations[allDurations.length - 1] ?? 0),
        totalPayloadBytes,
        totalWireBytes,
        compressionSavedBytes: Math.max(0, totalPayloadBytes - totalWireBytes),
      },
      process: {
        nodeVersion: process.version,
        rssMb: round2(mem.rss / (1024 * 1024)),
        heapUsedMb: round2(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: round2(mem.heapTotal / (1024 * 1024)),
        eventLoopLagMs: el
          ? {
              mean: nsToMs(el.mean),
              p50: nsToMs(el.percentile(50)),
              p95: nsToMs(el.percentile(95)),
              p99: nsToMs(el.percentile(99)),
              max: nsToMs(el.max),
            }
          : null,
      },
      dbPings: [...this.dbPings].reverse(),
      routes,
      recentNotableRequests: [...this.notableEvents]
        .reverse()
        .slice(0, 30)
        .map((e) => ({
          requestId: e.requestId,
          timestamp: new Date(e.timestamp).toISOString(),
          method: e.method,
          route: e.route,
          statusCode: e.statusCode,
          totalMs: round2(e.totalMs),
          authMs: round2(e.authMs),
          dbMs: round2(e.dbMs),
          dbQueryCount: e.dbQueryCount,
          slowQueries: e.slowQueries,
          payloadBytes: e.uncompressedBytes,
          wireBytes: e.wireBytes,
          encoding: e.encoding,
          ...(e.errorCode ? { errorCode: e.errorCode } : {}),
        })),
    };
  }

  private pruneOldSamples(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (this.samples.length > 0 && this.samples[0]!.timestamp < cutoff) {
      this.samples.shift();
    }
  }
}

export const metricsStore = new BackendMetricsCollector();
