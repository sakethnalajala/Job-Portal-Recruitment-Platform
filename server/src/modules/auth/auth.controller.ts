import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/ApiResponse';
import { AppError } from '../../utils/AppError';
import * as authService from './auth.service';
import {
  clearRefreshCookie,
  readRefreshCookie,
  requestMeta,
  setRefreshCookie,
} from './token.service';
import { sha256 } from '../../utils/crypto';

function respondWithSession(
  res: Response,
  result: authService.AuthResult,
  statusCode: 200 | 201,
  message: string,
) {
  setRefreshCookie(res, result.refreshToken);
  const payload = { user: result.user, accessToken: result.accessToken };
  return statusCode === 201
    ? sendCreated(res, payload, message)
    : sendSuccess(res, payload, { message });
}

export const registerCandidate = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerCandidate(req.body, requestMeta(req));
  respondWithSession(res, result, 201, 'Account created. Please verify your email.');
});

export const registerRecruiter = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerRecruiter(req.body, requestMeta(req));
  respondWithSession(res, result, 201, 'Account created. Please verify your email.');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, requestMeta(req));
  respondWithSession(res, result, 200, 'Logged in');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const raw = readRefreshCookie(req);
  if (!raw) throw AppError.unauthorized('No active session', 'NO_REFRESH_TOKEN');
  try {
    const result = await authService.refreshSession(raw, requestMeta(req));
    respondWithSession(res, result, 200, 'Session refreshed');
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, null, { message: 'Logged out' });
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.id);
  clearRefreshCookie(res);
  sendSuccess(res, null, { message: 'Signed out of all devices' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getCurrentUser(req.user!.id);
  sendSuccess(res, { user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.changePassword(req.user!.id, req.body, requestMeta(req));
  respondWithSession(res, result, 200, 'Password changed');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, null, {
    message: 'If an account exists for that email, a reset link has been sent.',
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);
  sendSuccess(res, null, { message: 'Password reset successfully. Please log in.' });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  await authService.verifyEmail(req.body.token);
  sendSuccess(res, null, { message: 'Email verified' });
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  await authService.resendVerification(req.body.email);
  sendSuccess(res, null, {
    message: 'If that email needs verification, a new link has been sent.',
  });
});

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.adminLogin(req.body, requestMeta(req));
  respondWithSession(res, result, 200, 'Logged in');
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const raw = readRefreshCookie(req);
  const sessions = await authService.listSessions(req.user!.id, raw ? sha256(raw) : undefined);
  sendSuccess(res, { sessions });
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  await authService.revokeSession(req.user!.id, req.params.id!);
  sendSuccess(res, null, { message: 'Session signed out' });
});

export const updateDisplayName = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateDisplayName(req.user!.id, req.body.displayName);
  sendSuccess(res, { user }, { message: 'Profile updated' });
});
