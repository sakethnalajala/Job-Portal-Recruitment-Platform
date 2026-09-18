import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('job_portal_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-0000';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-000';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.EMAIL_PROVIDER = 'console';
  process.env.COOKIE_SECURE = 'false';
}

export async function teardown() {
  await mongod?.stop();
}
