import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import type { Role } from '../utils/constants';

/** Role gate. Must run after authenticate(). */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('This action is not available for your account type'));
    }
    next();
  };
}

/** Blocks actions that require a verified email (applying, publishing jobs). */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!req.user.isEmailVerified) {
    return next(
      AppError.forbidden('Please verify your email address to continue', 'EMAIL_NOT_VERIFIED'),
    );
  }
  next();
};
