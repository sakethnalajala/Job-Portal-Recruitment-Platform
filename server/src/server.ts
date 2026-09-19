import http from 'node:http';
import mongoose from 'mongoose';
import { clientUrlWarning, env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/db';
import { createApp } from './app';
import './models'; // register all schemas before syncing indexes
import { startReminderScheduler } from './modules/interviews/interview.service';

async function syncIndexesInProduction(): Promise<void> {
  if (!env.isProd) return;
  for (const model of Object.values(mongoose.models)) {
    try {
      await model.syncIndexes();
    } catch (err) {
      logger.error({ err, model: model.modelName }, '[db] index sync failed');
    }
  }
  logger.info('[db] indexes synced');
}

async function main(): Promise<void> {
  await connectDatabase();
  await syncIndexesInProduction();

  const app = createApp();
  const server = http.createServer(app);

  startReminderScheduler();
  server.listen(env.PORT, () => {
    logger.info(`[server] ${env.NODE_ENV} API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
    logger.info(`[cors] allowed origins: ${env.corsOrigins.join(', ')} (CLIENT_URL=${env.CLIENT_URL})`);
    if (clientUrlWarning) logger.warn(`[cors] ${clientUrlWarning}`);
    if (!env.cloudinaryConfigured) {
      logger.warn('[storage] Cloudinary is not configured — file uploads will return 503');
    }
  });

  const shutdown = (signal: string) => {
    logger.info(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('[server] closed');
      process.exit(0);
    });
    // Force exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '[process] unhandled rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '[process] uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, '[server] failed to start');
  process.exit(1);
});
