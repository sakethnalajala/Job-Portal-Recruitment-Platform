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
      services: {
        database: dbUp ? 'up' : 'down',
        storage: env.cloudinaryConfigured ? 'configured' : 'not_configured',
        email: env.EMAIL_PROVIDER,
      },
    },
  });
});
