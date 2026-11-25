import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { isFirebaseAdminConfigured } from '../../config/firebase.js';
import { prisma } from '../../config/prisma.js';
import { requireAdminMonitorAccess } from '../../middleware/auth.js';
import { metricsStore, type DbPingSample } from '../../telemetry/metricsStore.js';

interface ConnectionDiagnostics {
  pooled: boolean;
  hasDirectUrlConfigured: boolean;
  dbRegionHint: string | null;
  serverRegionHint: string | null;
  regionMismatchWarning: string | null;
}

function inspectDatabaseConnection(): ConnectionDiagnostics {
  const env = getEnv();
  let pooled = false;
  let dbRegionHint: string | null = null;

  try {
    const parsed = new URL(env.DATABASE_URL);
    const host = parsed.hostname.toLowerCase();
    pooled =
      host.includes('-pooler') ||
      parsed.port === '6543' ||
      parsed.searchParams.get('pgbouncer') === 'true';

    // Extract cloud region hint safely from Neon/cloud hostnames without exposing credentials or endpoint IDs
    const neonRegionMatch = host.match(
      /\b((?:aws|azure|gcp)-[a-z]+-[a-z]+-\d|[a-z]{2}-[a-z]+-\d)\b/i,
    );
    if (neonRegionMatch?.[1]) {
      dbRegionHint = neonRegionMatch[1].toLowerCase();
    } else if (host === 'localhost' || host === '127.0.0.1') {
      dbRegionHint = 'local';
    }
  } catch {
    pooled = false;
  }

  const serverRegionHint =
    process.env.RENDER_REGION?.trim().toLowerCase() ||
    process.env.FLY_REGION?.trim().toLowerCase() ||
    process.env.VERCEL_REGION?.trim().toLowerCase() ||
    null;

  let regionMismatchWarning: string | null = null;
  if (serverRegionHint && dbRegionHint && dbRegionHint !== 'local') {
    const isServerUsWest =
      serverRegionHint.includes('oregon') || serverRegionHint.includes('us-west');
    const isDbUsWest = dbRegionHint.includes('us-west');
    const isServerUsEast =
      serverRegionHint.includes('ohio') ||
      serverRegionHint.includes('virginia') ||
      serverRegionHint.includes('us-east');
    const isDbUsEast = dbRegionHint.includes('us-east');

    if ((isServerUsWest && !isDbUsWest) || (isServerUsEast && !isDbUsEast)) {
      regionMismatchWarning = `El backend corre en "${serverRegionHint}" pero la base de datos parece estar en "${dbRegionHint}". Cada query SQL suma latencia inter-región; mové el servicio de Render o la base de Neon a la misma región (ej. ambos en Oregon / us-west-2).`;
    }
  }

  return {
    pooled,
    hasDirectUrlConfigured: Boolean(env.DATABASE_URL_UNPOOLED.trim()),
    dbRegionHint,
    serverRegionHint,
    regionMismatchWarning,
  };
}

const statusMetricsQuerySchema = z.object({
  fresh: z.enum(['0', '1']).optional(),
});

const HEALTH_CACHE_TTL_MS = 5_000;
let cachedPing: { expiresAt: number; sample: DbPingSample } | null = null;
let inFlightPing: Promise<DbPingSample> | null = null;

async function runDatabasePing(forceFresh = false): Promise<DbPingSample> {
  const now = Date.now();
  if (!forceFresh && cachedPing && cachedPing.expiresAt > now) {
    return cachedPing.sample;
  }
  if (inFlightPing) {
    return inFlightPing;
  }

  inFlightPing = (async () => {
    const previousActivityAt = metricsStore.getLastDbActivityAt();
    const start = performance.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const pingMs = performance.now() - start;
      const sample = metricsStore.recordDbPing(pingMs, true, previousActivityAt);
      cachedPing = { expiresAt: Date.now() + HEALTH_CACHE_TTL_MS, sample };
      return sample;
    } catch {
      const pingMs = performance.now() - start;
      const sample = metricsStore.recordDbPing(pingMs, false, previousActivityAt);
      cachedPing = { expiresAt: Date.now() + 1_500, sample };
      return sample;
    } finally {
      inFlightPing = null;
    }
  })();

  return inFlightPing;
}

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  const connDiagnostics = inspectDatabaseConnection();

  app.get('/api/health/live', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/health', async (_request, reply) => {
    const ping = await runDatabasePing(false);

    if (!ping.ok) {
      return reply.status(503).send({
        status: 'down',
        timestamp: ping.timestamp,
      });
    }

    const status = ping.pingMs > 500 ? 'degraded' : 'ok';
    return {
      status,
      timestamp: ping.timestamp,
    };
  });

  app.get(
    '/api/status/metrics',
    { preHandler: [requireAdminMonitorAccess] },
    async (request) => {
      const query = statusMetricsQuerySchema.parse(request.query);
      const forceFresh = query.fresh === '1';
      const ping = await runDatabasePing(forceFresh);
      const snapshot = metricsStore.getSnapshot();

      const status = !ping.ok
        ? 'down'
        : ping.pingMs > 500 || snapshot.summary.p95Ms > 1500
          ? 'degraded'
          : 'ok';

      return {
        status,
        timestamp: new Date().toISOString(),
        health: {
          db: {
            ok: ping.ok,
            pingMs: ping.pingMs,
            coldStartSuspected: ping.coldStartSuspected,
            ...connDiagnostics,
          },
          firebaseAdmin: isFirebaseAdminConfigured(),
          corsMaxAgeSeconds: 86400,
          compressionEnabled: true,
        },
        ...snapshot,
      };
    },
  );
}
