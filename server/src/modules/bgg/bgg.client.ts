import { getEnv } from '../../config/env.js';
import { badGateway, serviceUnavailable } from '../../utils/errors.js';
import { defaultSleep, withExponentialBackoff } from '../../utils/retry.js';
import {
  parseBggCollectionXml,
  parseBggSearchXml,
  parseBggThingXml,
} from './bgg.parser.js';
import type {
  BggCollectionItem,
  BggGameDetails,
  BggSearchItem,
} from './bgg.types.js';

const THING_BATCH_SIZE = 20;
const INTER_BATCH_DELAY_MS = 600;

class RetryableBggHttpError extends Error {
  public readonly status: number;
  public readonly retryAfterMs?: number;

  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableBggHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface BggClientConfig {
  baseUrl?: string;
  apiToken?: string;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  collectionMaxAttempts?: number;
  collectionInitialDelayMs?: number;
  collectionMaxDelayMs?: number;
  thingBatchDelayMs?: number;
  requestTimeoutMs?: number;
}

function parseRetryAfterHeader(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number.parseInt(headerValue, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const parsedDate = Date.parse(headerValue);
  if (!Number.isNaN(parsedDate)) {
    const diff = parsedDate - Date.now();
    return diff > 0 ? diff : undefined;
  }
  return undefined;
}

export class BggClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly collectionMaxAttempts: number;
  private readonly collectionInitialDelayMs: number;
  private readonly collectionMaxDelayMs: number;
  private readonly thingBatchDelayMs: number;
  private readonly requestTimeoutMs: number;

  constructor(config: BggClientConfig = {}) {
    const env = config.baseUrl ? null : getEnv();
    this.baseUrl = (config.baseUrl ?? env?.BGG_API_BASE_URL ?? 'https://boardgamegeek.com/xmlapi2').replace(/\/+$/, '');
    this.apiToken = config.apiToken ?? env?.BGG_API_TOKEN ?? '';
    this.fetchFn = config.fetchFn ?? fetch;
    this.sleepFn = config.sleepFn ?? defaultSleep;
    this.collectionMaxAttempts = config.collectionMaxAttempts ?? 8;
    this.collectionInitialDelayMs = config.collectionInitialDelayMs ?? 1500;
    this.collectionMaxDelayMs = config.collectionMaxDelayMs ?? 12000;
    this.thingBatchDelayMs = config.thingBatchDelayMs ?? INTER_BATCH_DELAY_MS;
    this.requestTimeoutMs = config.requestTimeoutMs ?? env?.BGG_REQUEST_TIMEOUT_MS ?? 15000;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/xml, text/xml',
      'User-Agent': 'AQueJugamos/0.1 (BoardGameGroupApp)',
    };

    if (this.apiToken) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    }

    return headers;
  }

  private async fetchXml(
    endpoint: string,
    params: Record<string, string>,
    retryConfig: {
      maxAttempts: number;
      initialDelayMs: number;
      maxDelayMs: number;
      retryOn202: boolean;
    },
  ): Promise<string> {
    const searchParams = new URLSearchParams(params);
    const url = `${this.baseUrl}/${endpoint}?${searchParams.toString()}`;

    try {
      return await withExponentialBackoff(
        async () => {
          let response: Response;
          try {
            response = await this.fetchFn(url, {
              method: 'GET',
              headers: this.buildHeaders(),
              signal: AbortSignal.timeout(this.requestTimeoutMs),
            });
          } catch (networkError) {
            throw new RetryableBggHttpError(
              0,
              `Error de red consultando BGG: ${
                networkError instanceof Error ? networkError.message : String(networkError)
              }`,
            );
          }

          if (response.status === 202 && retryConfig.retryOn202) {
            throw new RetryableBggHttpError(
              202,
              'BoardGameGeek encoló la solicitud de colección (202 Accepted)',
            );
          }

          if (response.status === 429) {
            const retryAfterMs = parseRetryAfterHeader(response.headers.get('retry-after'));
            throw new RetryableBggHttpError(
              429,
              'Rate limit alcanzado en BoardGameGeek (429)',
              retryAfterMs,
            );
          }

          if (response.status >= 500) {
            throw new RetryableBggHttpError(
              response.status,
              `Error temporal de BoardGameGeek (${response.status})`,
            );
          }

          if (response.status === 401 || response.status === 403) {
            throw badGateway(
              'BoardGameGeek rechazó la solicitud (401/403). Verificá BGG_API_TOKEN si es requerido.',
              'BGG_UNAUTHORIZED',
            );
          }

          if (!response.ok) {
            throw badGateway(
              `BoardGameGeek respondió con HTTP ${response.status}`,
              'BGG_HTTP_ERROR',
            );
          }

          return response.text();
        },
        {
          maxAttempts: retryConfig.maxAttempts,
          initialDelayMs: retryConfig.initialDelayMs,
          maxDelayMs: retryConfig.maxDelayMs,
          sleepFn: this.sleepFn,
          shouldRetry: (error) => error instanceof RetryableBggHttpError,
          getCustomDelayMs: (error) =>
            error instanceof RetryableBggHttpError ? error.retryAfterMs : undefined,
        },
      );
    } catch (error) {
      if (error instanceof RetryableBggHttpError) {
        if (error.status === 202) {
          throw serviceUnavailable(
            'BoardGameGeek sigue preparando tu colección (202 Accepted). Intentá nuevamente en unos segundos.',
            'BGG_COLLECTION_QUEUED_TIMEOUT',
          );
        }
        throw serviceUnavailable(
          'BoardGameGeek no respondió a tiempo o limitó las solicitudes. Intentá nuevamente en breve.',
          'BGG_UNAVAILABLE',
        );
      }
      throw error;
    }
  }

  public async fetchUserCollection(username: string): Promise<BggCollectionItem[]> {
    const xml = await this.fetchXml(
      'collection',
      {
        username,
        own: '1',
        stats: '1',
      },
      {
        maxAttempts: this.collectionMaxAttempts,
        initialDelayMs: this.collectionInitialDelayMs,
        maxDelayMs: this.collectionMaxDelayMs,
        retryOn202: true,
      },
    );

    return parseBggCollectionXml(xml);
  }

  public async fetchThingsByIds(bggIds: number[]): Promise<BggGameDetails[]> {
    const uniqueIds = Array.from(new Set(bggIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (uniqueIds.length === 0) {
      return [];
    }

    const results: BggGameDetails[] = [];

    for (let i = 0; i < uniqueIds.length; i += THING_BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + THING_BATCH_SIZE);
      const xml = await this.fetchXml(
        'thing',
        {
          id: batch.join(','),
          stats: '1',
        },
        {
          maxAttempts: 4,
          initialDelayMs: 1000,
          maxDelayMs: 8000,
          retryOn202: false,
        },
      );

      results.push(...parseBggThingXml(xml));

      if (i + THING_BATCH_SIZE < uniqueIds.length && this.thingBatchDelayMs > 0) {
        await this.sleepFn(this.thingBatchDelayMs);
      }
    }

    return results;
  }

  public async searchGames(query: string, exact = false): Promise<BggSearchItem[]> {
    const params: Record<string, string> = {
      query,
      type: 'boardgame,boardgameexpansion',
    };

    if (exact) {
      params.exact = '1';
    }

    const xml = await this.fetchXml('search', params, {
      maxAttempts: 3,
      initialDelayMs: 800,
      maxDelayMs: 5000,
      retryOn202: false,
    });

    return parseBggSearchXml(xml);
  }
}

let defaultBggClient: BggClient | null = null;

export function getBggClient(): BggClient {
  if (!defaultBggClient) {
    defaultBggClient = new BggClient();
  }
  return defaultBggClient;
}
