import { getEnv } from '../../config/env.js';
import { conflict, tooManyRequests } from '../../utils/errors.js';
import type { BggSearchItem } from './bgg.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MAX_SEARCH_CACHE_ENTRIES = 300;

interface SyncRecord {
  timestamp: number;
  bggUsername: string | null;
}

interface SearchCacheEntry {
  results: BggSearchItem[];
  expiresAt: number;
}

export interface BggSyncQuotaStatus {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  nextResetAt: string | null;
  cooldownUntil: string | null;
  inProgress: boolean;
}

export interface BggGuardConfig {
  maxSyncsPerDay?: number;
  sameUserCooldownMs?: number;
  searchRateLimitPerMin?: number;
  importRateLimitPerHour?: number;
  searchCacheTtlMs?: number;
  maxSearchCacheEntries?: number;
  nowFn?: () => number;
}

function formatWaitDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE_MS));
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? 'minuto' : 'minutos'}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${hours} h ${mins} min`;
}

export class BggGuard {
  private readonly maxSyncsPerDay: number;
  private readonly sameUserCooldownMs: number;
  private readonly searchRateLimitPerMin: number;
  private readonly importRateLimitPerHour: number;
  private readonly searchCacheTtlMs: number;
  private readonly maxSearchCacheEntries: number;
  private readonly nowFn: () => number;

  private readonly syncHistory = new Map<string, SyncRecord[]>();
  private readonly inFlightSyncUsers = new Set<string>();
  private readonly searchWindows = new Map<string, number[]>();
  private readonly importWindows = new Map<string, number[]>();
  private readonly searchCache = new Map<string, SearchCacheEntry>();
  private readonly inFlightSearches = new Map<string, Promise<BggSearchItem[]>>();

  constructor(config: BggGuardConfig = {}) {
    const useEnv =
      config.maxSyncsPerDay === undefined ||
      config.sameUserCooldownMs === undefined ||
      config.searchRateLimitPerMin === undefined ||
      config.importRateLimitPerHour === undefined ||
      config.searchCacheTtlMs === undefined;

    const env = useEnv ? getEnv() : null;

    this.maxSyncsPerDay = config.maxSyncsPerDay ?? env?.BGG_MAX_SYNCS_PER_DAY ?? 2;
    this.sameUserCooldownMs =
      config.sameUserCooldownMs ??
      (env?.BGG_SYNC_SAME_USER_COOLDOWN_MINUTES ?? 5) * MINUTE_MS;
    this.searchRateLimitPerMin =
      config.searchRateLimitPerMin ?? env?.BGG_SEARCH_RATE_LIMIT_PER_MIN ?? 15;
    this.importRateLimitPerHour =
      config.importRateLimitPerHour ?? env?.BGG_IMPORT_RATE_LIMIT_PER_HOUR ?? 30;
    this.searchCacheTtlMs =
      config.searchCacheTtlMs ??
      (env?.BGG_SEARCH_CACHE_TTL_MINUTES ?? 15) * MINUTE_MS;
    this.maxSearchCacheEntries =
      config.maxSearchCacheEntries ?? DEFAULT_MAX_SEARCH_CACHE_ENTRIES;
    this.nowFn = config.nowFn ?? (() => Date.now());
  }

  private getPrunedSyncRecords(
    userId: string,
    lastKnownSyncAt?: Date | null,
    lastKnownBggUsername?: string | null,
  ): SyncRecord[] {
    const now = this.nowFn();
    const cutoff = now - DAY_MS;

    const existing = (this.syncHistory.get(userId) ?? []).filter(
      (entry) => entry.timestamp > cutoff,
    );

    // Seed from persisted User.lastBggSyncAt (survives server restarts)
    if (lastKnownSyncAt) {
      const persistedTs = lastKnownSyncAt.getTime();
      if (persistedTs > cutoff) {
        const alreadyTracked = existing.some(
          (entry) => Math.abs(entry.timestamp - persistedTs) < 5_000,
        );
        if (!alreadyTracked) {
          existing.push({
            timestamp: persistedTs,
            bggUsername: lastKnownBggUsername?.trim().toLowerCase() ?? null,
          });
          existing.sort((a, b) => a.timestamp - b.timestamp);
        }
      }
    }

    if (existing.length > 0) {
      this.syncHistory.set(userId, existing);
    } else {
      this.syncHistory.delete(userId);
    }

    return existing;
  }

  public getSyncQuota(
    userId: string,
    lastKnownSyncAt?: Date | null,
    lastKnownBggUsername?: string | null,
  ): BggSyncQuotaStatus {
    const now = this.nowFn();
    const records = this.getPrunedSyncRecords(
      userId,
      lastKnownSyncAt,
      lastKnownBggUsername,
    );
    const usedToday = records.length;
    const remainingToday = Math.max(0, this.maxSyncsPerDay - usedToday);

    const oldest = records[0];
    const nextResetAt =
      remainingToday === 0 && oldest
        ? new Date(oldest.timestamp + DAY_MS).toISOString()
        : null;

    const latest = records[records.length - 1];
    const cooldownEnd =
      latest && this.sameUserCooldownMs > 0
        ? latest.timestamp + this.sameUserCooldownMs
        : 0;
    const cooldownUntil =
      cooldownEnd > now ? new Date(cooldownEnd).toISOString() : null;

    return {
      dailyLimit: this.maxSyncsPerDay,
      usedToday,
      remainingToday,
      nextResetAt,
      cooldownUntil,
      inProgress: this.inFlightSyncUsers.has(userId),
    };
  }

  public acquireSyncSlot(
    userId: string,
    bggUsername: string,
    lastKnownSyncAt?: Date | null,
    lastKnownBggUsername?: string | null,
  ): { release: (succeeded: boolean) => void } {
    if (this.inFlightSyncUsers.has(userId)) {
      throw conflict(
        'Ya hay una sincronización con BoardGameGeek en curso para tu cuenta. Esperá a que finalice.',
        'BGG_SYNC_IN_PROGRESS',
      );
    }

    const now = this.nowFn();
    const normalizedUsername = bggUsername.trim().toLowerCase();
    const records = this.getPrunedSyncRecords(
      userId,
      lastKnownSyncAt,
      lastKnownBggUsername,
    );

    if (records.length >= this.maxSyncsPerDay) {
      const oldest = records[0]!;
      const resetAtMs = oldest.timestamp + DAY_MS;
      const waitMs = Math.max(1000, resetAtMs - now);
      throw tooManyRequests(
        `Alcanzaste el límite de ${this.maxSyncsPerDay} actualizaciones de ludoteca por día. Podrás volver a sincronizar en ${formatWaitDuration(waitMs)}.`,
        'BGG_DAILY_SYNC_LIMIT_REACHED',
        {
          dailyLimit: this.maxSyncsPerDay,
          usedToday: records.length,
          remainingToday: 0,
          nextResetAt: new Date(resetAtMs).toISOString(),
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        },
      );
    }

    const latest = records[records.length - 1];
    if (
      latest &&
      this.sameUserCooldownMs > 0 &&
      latest.bggUsername === normalizedUsername &&
      now - latest.timestamp < this.sameUserCooldownMs
    ) {
      const waitMs = this.sameUserCooldownMs - (now - latest.timestamp);
      throw tooManyRequests(
        `Tu ludoteca de @${bggUsername} se actualizó recién. Esperá ${formatWaitDuration(waitMs)} antes de volver a sincronizar.`,
        'BGG_SYNC_COOLDOWN',
        {
          cooldownUntil: new Date(latest.timestamp + this.sameUserCooldownMs).toISOString(),
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        },
      );
    }

    this.inFlightSyncUsers.add(userId);
    let released = false;

    return {
      release: (succeeded: boolean) => {
        if (released) return;
        released = true;
        this.inFlightSyncUsers.delete(userId);

        if (succeeded) {
          const updated = this.getPrunedSyncRecords(userId);
          updated.push({
            timestamp: this.nowFn(),
            bggUsername: normalizedUsername,
          });
          this.syncHistory.set(userId, updated);
        }
      },
    };
  }

  private assertSlidingWindow(
    store: Map<string, number[]>,
    key: string,
    limit: number,
    windowMs: number,
    code: string,
    buildMessage: (waitMs: number) => string,
  ): void {
    const now = this.nowFn();
    const cutoff = now - windowMs;
    const timestamps = (store.get(key) ?? []).filter((ts) => ts > cutoff);

    if (timestamps.length >= limit) {
      const oldest = timestamps[0]!;
      const waitMs = Math.max(1000, oldest + windowMs - now);
      store.set(key, timestamps);
      throw tooManyRequests(buildMessage(waitMs), code, {
        limit,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }

    timestamps.push(now);
    store.set(key, timestamps);
  }

  public assertSearchRateLimit(userId: string): void {
    this.assertSlidingWindow(
      this.searchWindows,
      userId,
      this.searchRateLimitPerMin,
      MINUTE_MS,
      'BGG_SEARCH_RATE_LIMITED',
      (waitMs) =>
        `Realizaste demasiadas búsquedas en BGG seguidas. Esperá ${Math.ceil(waitMs / 1000)} segundos antes de intentar nuevamente.`,
    );
  }

  public assertUpstreamImportRateLimit(userId: string): void {
    this.assertSlidingWindow(
      this.importWindows,
      userId,
      this.importRateLimitPerHour,
      HOUR_MS,
      'BGG_IMPORT_RATE_LIMITED',
      (waitMs) =>
        `Alcanzaste el límite temporal de importaciones individuales desde BGG. Esperá ${formatWaitDuration(waitMs)} o usá la sincronización de colección.`,
    );
  }

  public async getOrFetchSearch(
    query: string,
    exact: boolean,
    fetcher: () => Promise<BggSearchItem[]>,
  ): Promise<{ results: BggSearchItem[]; fromCache: boolean }> {
    const normalizedKey = `${exact ? 'exact' : 'fuzzy'}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    const now = this.nowFn();

    const cached = this.searchCache.get(normalizedKey);
    if (cached && cached.expiresAt > now) {
      // Refresh LRU position
      this.searchCache.delete(normalizedKey);
      this.searchCache.set(normalizedKey, cached);
      return { results: cached.results, fromCache: true };
    }

    if (cached) {
      this.searchCache.delete(normalizedKey);
    }

    const inFlight = this.inFlightSearches.get(normalizedKey);
    if (inFlight) {
      const results = await inFlight;
      return { results, fromCache: true };
    }

    const promise = fetcher()
      .then((results) => {
        if (this.searchCache.size >= this.maxSearchCacheEntries) {
          const oldestKey = this.searchCache.keys().next().value;
          if (oldestKey !== undefined) {
            this.searchCache.delete(oldestKey);
          }
        }
        this.searchCache.set(normalizedKey, {
          results,
          expiresAt: this.nowFn() + this.searchCacheTtlMs,
        });
        return results;
      })
      .finally(() => {
        this.inFlightSearches.delete(normalizedKey);
      });

    this.inFlightSearches.set(normalizedKey, promise);
    const results = await promise;
    return { results, fromCache: false };
  }
}

let defaultBggGuard: BggGuard | null = null;

export function getBggGuard(): BggGuard {
  if (!defaultBggGuard) {
    defaultBggGuard = new BggGuard();
  }
  return defaultBggGuard;
}
