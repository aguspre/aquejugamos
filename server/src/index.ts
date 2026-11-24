import { buildApp } from './app.js';
import { getEnv } from './config/env.js';
import { isFirebaseAdminConfigured } from './config/firebase.js';
import { prisma } from './config/prisma.js';

async function start(): Promise<void> {
  const env = getEnv();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Recibida señal ${signal}, cerrando servidor...`);
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      app.log.error(error, 'Error durante el cierre del servidor');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Servidor escuchando en http://localhost:${env.PORT}`);

    // Precalentar Firebase Admin y el pool de Prisma en segundo plano para reducir
    // la latencia del primer request luego de un cold start.
    try {
      isFirebaseAdminConfigured();
    } catch (error) {
      app.log.warn(error, 'No se pudo precalentar Firebase Admin al iniciar');
    }
    void prisma.$connect().catch((error: unknown) => {
      app.log.warn(error, 'No se pudo precalentar la conexión a PostgreSQL al iniciar');
    });
  } catch (error) {
    app.log.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void start();
