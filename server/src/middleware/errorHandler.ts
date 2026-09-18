import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError, type ErrorDetails } from '../utils/AppError';
import { FILE_LIMITS } from '../utils/constants';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
};

/** Maps library errors to safe, consistent AppErrors. */
function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details: ErrorDetails = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return AppError.badRequest('Validation failed', 'VALIDATION_ERROR', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${err.path}`, 'INVALID_ID');
  }

  // Duplicate key (unique index)
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    const field = Object.keys(keyValue)[0] ?? 'field';
    return AppError.conflict(`A record with this ${field} already exists`, 'DUPLICATE_KEY');
  }

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(FILE_LIMITS.RESUME_MAX_BYTES / 1024 / 1024);
      return AppError.badRequest(`File is too large (max ${mb} MB)`, 'FILE_TOO_LARGE');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return AppError.badRequest('Unexpected file field', 'UNEXPECTED_FILE');
    }
    return AppError.badRequest(err.message, 'UPLOAD_ERROR');
  }

  // Malformed JSON body (body-parser)
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    return AppError.badRequest('Malformed JSON body', 'INVALID_JSON');
  }
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  return AppError.internal();
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalize(err);
  const isUnexpected = !(err instanceof AppError) && appError.statusCode === 500;

  if (isUnexpected) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  } else if (appError.statusCode >= 500) {
    logger.error({ err: appError, url: req.originalUrl }, appError.message);
  } else {
    logger.debug({ code: appError.code, url: req.originalUrl }, appError.message);
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      // Stack traces only in development, never in production responses.
      ...(env.isDev && isUnexpected && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
};
