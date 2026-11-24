import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  FIREBASE_PROJECT_ID: z.string().optional().default('aquejugamos-81425'),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),
  BGG_API_BASE_URL: z.string().url().default('https://boardgamegeek.com/xmlapi2'),
  BGG_API_TOKEN: z.string().optional().default(''),
  BGG_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BGG_MAX_SYNCS_PER_DAY: z.coerce.number().int().positive().default(2),
  BGG_SYNC_SAME_USER_COOLDOWN_MINUTES: z.coerce.number().int().min(0).default(5),
  BGG_SEARCH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(15),
  BGG_IMPORT_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  BGG_SEARCH_CACHE_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  BGG_MIN_FORCE_REFRESH_HOURS: z.coerce.number().int().positive().default(24),
  BGG_MAX_COLLECTION_ITEMS: z.coerce.number().int().positive().default(1500),
  BGG_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
