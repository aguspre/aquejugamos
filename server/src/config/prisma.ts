import { PrismaClient } from '@prisma/client';
import { metricsStore } from '../telemetry/metricsStore.js';
import { recordDbOperation } from '../telemetry/requestContext.js';

const slowQueryThresholdMs = Math.max(
  10,
  Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 120,
);

function createInstrumentedPrismaClient(): PrismaClient {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  const extended = baseClient.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const startedAt = performance.now();
        try {
          const result = await query(args);
          metricsStore.touchDbActivity();
          return result;
        } finally {
          const durationMs = performance.now() - startedAt;
          const target = model ? `${model}.${operation}` : operation;
          recordDbOperation(target, durationMs, slowQueryThresholdMs);
        }
      },
    },
  });

  return extended as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createInstrumentedPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
