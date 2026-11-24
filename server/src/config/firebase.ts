import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { serviceUnavailable } from '../utils/errors.js';
import { getEnv } from './env.js';

let cachedApp: App | null = null;
let initializedChecked = false;

function resolveServiceAccountFromFile(filePath: string): ServiceAccount | null {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!existsSync(resolved)) {
    return null;
  }

  const raw = readFileSync(resolved, 'utf8');
  return JSON.parse(raw) as ServiceAccount;
}

function initFirebaseApp(): App | null {
  if (cachedApp) {
    return cachedApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    cachedApp = existingApps[0]!;
    return cachedApp;
  }

  if (initializedChecked) {
    return null;
  }
  initializedChecked = true;

  const env = getEnv();

  // 1. Credenciales explícitas por variables de entorno
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    cachedApp = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    });
    return cachedApp;
  }

  // 2. Ruta configurada en FIREBASE_SERVICE_ACCOUNT_PATH
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccount = resolveServiceAccountFromFile(env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (serviceAccount) {
      cachedApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId ?? env.FIREBASE_PROJECT_ID,
      });
      return cachedApp;
    }
  }

  // 3. Archivo local por defecto en server/serviceAccountKey.json
  const defaultLocalAccount = resolveServiceAccountFromFile('./serviceAccountKey.json');
  if (defaultLocalAccount) {
    cachedApp = initializeApp({
      credential: cert(defaultLocalAccount),
      projectId: defaultLocalAccount.projectId ?? env.FIREBASE_PROJECT_ID,
    });
    return cachedApp;
  }

  // 4. GOOGLE_APPLICATION_CREDENTIALS estándar (entornos Cloud / GCP)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    cachedApp = initializeApp({
      credential: applicationDefault(),
      projectId: env.FIREBASE_PROJECT_ID,
    });
    return cachedApp;
  }

  return null;
}

export function isFirebaseAdminConfigured(): boolean {
  return initFirebaseApp() !== null;
}

export function getFirebaseAuth(): Auth {
  const app = initFirebaseApp();
  if (!app) {
    throw serviceUnavailable(
      'Firebase Admin no está configurado. Colocá serviceAccountKey.json en server/ o definí FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en server/.env',
      'FIREBASE_NOT_CONFIGURED',
    );
  }
  return getAuth(app);
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const auth = getFirebaseAuth();
  return auth.verifyIdToken(idToken, true);
}
