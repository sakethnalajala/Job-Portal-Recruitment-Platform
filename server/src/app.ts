import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { AppError } from './utils/AppError';
import { authRouter } from './modules/auth/auth.routes';
import { healthRouter } from './modules/health/health.routes';
import { userRouter } from './modules/users/user.routes';
import { candidateRouter } from './modules/candidates/candidate.routes';
import { recruiterRouter } from './modules/recruiters/recruiter.routes';
import { jobRouter } from './modules/jobs/job.routes';
import { applicationRouter } from './modules/applications/application.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { statsRouter } from './modules/stats/stats.routes';
import { interviewRouter } from './modules/interviews/interview.routes';
import { talentRouter } from './modules/talent/talent.routes';
import { teamRouter } from './modules/team/team.routes';
import { getPublicSettings } from './modules/admin/admin.platform';
import { asyncHandler } from './utils/asyncHandler';
import { sendSuccess } from './utils/ApiResponse';

export function createApp() {
  const app = express();

  // Render/Vercel sit behind proxies; needed for correct req.ip and secure cookies.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      // API only serves JSON; a strict CSP keeps any accidental HTML inert.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // ── CORS: explicit allow-list, credentials for the refresh cookie ─────────
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / server-to-server requests have no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        callback(AppError.forbidden('Origin not allowed', 'CORS_BLOCKED'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  // ── Parsing & hygiene ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(hpp());

  // ── Logging ───────────────────────────────────────────────────────────────
  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  const api = express.Router();
  api.use(globalLimiter);
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);
  api.use('/users', userRouter);
  api.use('/candidates', candidateRouter);
  api.use('/recruiters', recruiterRouter);
  api.use('/jobs', jobRouter);
  api.use('/applications', applicationRouter);
  api.use('/notifications', notificationRouter);
  api.use('/admin', adminRouter);
  api.use('/stats', statsRouter);
  api.use('/interviews', interviewRouter);
  api.use('/talent-pool', talentRouter);
  api.use('/team', teamRouter);
  // Public platform switches (announcement banner, registration open/closed, maintenance).
  api.get('/settings/public', asyncHandler(async (_req, res) => { sendSuccess(res, await getPublicSettings()); }));

  app.use(env.API_PREFIX, api);

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Job Portal API', docs: `${env.API_PREFIX}/health` });
  });

  // ── Errors ────────────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
