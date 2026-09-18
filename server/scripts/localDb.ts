/**
 * Local MongoDB for development when you don't have an Atlas cluster handy.
 * Runs a real mongod (downloaded once by mongodb-memory-server) on a fixed
 * port with data persisted under server/.data/mongo, so seeds survive restarts.
 *
 *   npm run db:local        → mongodb://127.0.0.1:27017/job_portal
 *
 * Point MONGODB_URI at that URL. For production always use MongoDB Atlas.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = Number(process.env.LOCAL_DB_PORT ?? 27017);
const dbPath = path.resolve(process.cwd(), '.data', 'mongo');

async function main() {
  mkdirSync(dbPath, { recursive: true });
  const mongod = await MongoMemoryServer.create({
    instance: { port: PORT, dbPath, storageEngine: 'wiredTiger', dbName: 'job_portal' },
  });

  console.log(`\n  Local MongoDB running at ${mongod.getUri('job_portal')}`);
  console.log(`  Data directory: ${dbPath}`);
  console.log('  Press Ctrl+C to stop.\n');

  const stop = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
