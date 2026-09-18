import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const common: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Tests exercise rate limiting explicitly; otherwise disable so suites stay deterministic.
  skip: () => env.isTest && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
  handler: (_req, _res, next) => next(AppError.tooMany()),
};

const emailKey = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  return `${req.ip}:${email}`;
};

export const globalLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 300,
});

export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: emailKey,
  handler: (_req, _res, next) =>
    next(AppError.tooMany('Too many login attempts. Please try again in 15 minutes.')),
});

export const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

/** Forgot-password / resend-verification: prevents email bombing. */
export const emailActionLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: emailKey,
});

export const uploadLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 30,
});
