/**
 * Creates (or updates) the single platform admin from ADMIN_EMAIL / ADMIN_PASSWORD.
 * This is the ONLY way an admin account comes into existence — there is no
 * admin registration endpoint.
 *
 *   npm run seed:admin
 */
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { User } from '../src/models/User';

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    logger.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment');
    process.exit(1);
  }

  await connectDatabase();

  const existing = await User.findOne({ email: env.ADMIN_EMAIL }).select('+passwordHash');
  if (existing && existing.role !== 'admin') {
    logger.error(`${env.ADMIN_EMAIL} already exists with role "${existing.role}" — refusing to escalate`);
    await disconnectDatabase();
    process.exit(1);
  }

  const passwordHash = await User.hashPassword(env.ADMIN_PASSWORD);

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.status = 'active';
    existing.isEmailVerified = true;
    await existing.save();
    logger.info(`Admin ${env.ADMIN_EMAIL} updated`);
  } else {
    await User.create({
      email: env.ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
      status: 'active',
      isEmailVerified: true,
    });
    logger.info(`Admin ${env.ADMIN_EMAIL} created`);
  }

  await disconnectDatabase();
}

main().catch((err) => {
  logger.error({ err }, 'seed:admin failed');
  process.exit(1);
});
