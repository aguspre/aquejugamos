import { buildApp } from './app.js';
import { getEnv } from './config/env.js';
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
  } catch (error) {
    app.log.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void start();
