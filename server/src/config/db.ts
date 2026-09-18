import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

let listenersAttached = false;

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  if (!listenersAttached) {
    mongoose.connection.on('connected', () => logger.info('[db] connected'));
    mongoose.connection.on('disconnected', () => logger.warn('[db] disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('[db] reconnected'));
    mongoose.connection.on('error', (err) => logger.error({ err }, '[db] connection error'));
    listenersAttached = true;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    // Mongoose builds indexes on model compile in dev/test; in production we run
    // `syncIndexes()` explicitly at boot (see server.ts) so misses are logged, not silent.
    autoIndex: !env.isProd,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
