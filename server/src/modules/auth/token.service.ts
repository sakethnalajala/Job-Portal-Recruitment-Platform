import jwt from 'jsonwebtoken';
import type { Response, Request } from 'express';
import { env } from '../../config/env';
import { RefreshToken } from '../../models/RefreshToken';
import { AppError } from '../../utils/AppError';
import { randomToken, sha256, uuid } from '../../utils/crypto';
import type { Role } from '../../utils/constants';

export const REFRESH_COOKIE = 'jp_refresh';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

// ─── Access tokens (stateless, short-lived) ────────────────────────────────

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

// ─── Refresh tokens (opaque, stored hashed, rotated) ───────────────────────

interface RequestMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function issueRefreshToken(
  userId: string,
  meta: RequestMeta,
  family: string = uuid(),
): Promise<string> {
  const raw = randomToken(48);
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(raw),
    family,
    expiresAt: refreshExpiry(),
    userAgent: meta.userAgent?.slice(0, 512),
    ip: meta.ip,
  });
  return raw;
}

/**
 * Validates + rotates a refresh token. Reuse of an already-rotated token is
 * treated as theft: the whole family is revoked and the caller must log in again.
 */
export async function rotateRefreshToken(
  raw: string,
  meta: RequestMeta,
): Promise<{ userId: string; newRaw: string }> {
  const tokenHash = sha256(raw);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');

  if (existing.revokedAt) {
    await RefreshToken.updateMany(
      { family: existing.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw AppError.unauthorized('Session is no longer valid, please log in again', 'REFRESH_TOKEN_REUSED');
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw AppError.unauthorized('Session expired, please log in again', 'REFRESH_TOKEN_EXPIRED');
  }

  const userId = existing.user.toString();
  const newRaw = await issueRefreshToken(userId, meta, existing.family);
  existing.revokedAt = new Date();
  existing.replacedByHash = sha256(newRaw);
  await existing.save();

  return { userId, newRaw };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: sha256(raw), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

// ─── Cookie helpers ────────────────────────────────────────────────────────

const cookiePath = `${env.API_PREFIX}/auth`;

export function setRefreshCookie(res: Response, raw: string): void {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: cookiePath,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: cookiePath,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function requestMeta(req: Request): RequestMeta {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}
