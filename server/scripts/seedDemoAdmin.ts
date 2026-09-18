/**
 * Creates the dedicated DEMO administrator account used by the public
 * "Demo accounts" section of the homepage. Insert-only: if the account already
 * exists it is left untouched; nothing else in the database is read or changed.
 *
 *   npm run seed:demo-admin
 *
 * The real platform admin (ADMIN_EMAIL) is never exposed in the UI.
 */
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { User } from '../src/models/User';

export const DEMO_ADMIN_EMAIL = 'demo.admin@demo.jobportal.in';
export const DEMO_PASSWORD = 'Demo@1234';

async function main() {
  if (env.isProd && process.env.ALLOW_DEMO_SEED !== 'true') {
    logger.error('Refusing to create a demo admin in production. Set ALLOW_DEMO_SEED=true to override.');
    process.exit(1);
  }
  await connectDatabase();

  const existing = await User.findOne({ email: DEMO_ADMIN_EMAIL }).select('role status').lean();
  if (existing) {
    logger.info(`Demo admin already exists (${DEMO_ADMIN_EMAIL}, role=${existing.role}, status=${existing.status}) — no changes made`);
  } else {
    await User.create({
      email: DEMO_ADMIN_EMAIL,
      passwordHash: await User.hashPassword(DEMO_PASSWORD),
      role: 'admin',
      status: 'active',
      isEmailVerified: true,
    });
    logger.info(`Demo admin created: ${DEMO_ADMIN_EMAIL}`);
  }
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error({ err }, 'seed:demo-admin failed');
  process.exit(1);
});
