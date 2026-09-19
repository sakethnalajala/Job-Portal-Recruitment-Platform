import { Router } from 'express';
import { isDatabaseConnected } from '../../config/db';
import { env } from '../../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const dbUp = isDatabaseConnected();
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    message: dbUp ? 'OK' : 'Database unavailable',
    data: {
      status: dbUp ? 'healthy' : 'degraded',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      // Render injects RENDER_GIT_COMMIT; lets operators confirm which build is live.
      commit: (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7),
      corsOrigins: env.corsOrigins,
      services: {
        database: dbUp ? 'up' : 'down',
        storage: env.cloudinaryConfigured ? 'configured' : 'not_configured',
        email: env.EMAIL_PROVIDER,
      },
    },
  });
});
