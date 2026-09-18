import type { RequestHandler } from 'express';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../modules/auth/token.service';
import type { Role } from '../utils/constants';

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function resolveUser(token: string): Promise<Express.AuthUser> {
  const payload = verifyAccessToken(token);

  // Hit the DB on every request (indexed _id lookup) so suspension, deletion
  // and password changes take effect immediately rather than at token expiry.
  const user = await User.findById(payload.sub)
    .select('role status email isEmailVerified passwordChangedAt')
    .lean();

  if (!user || user.status === 'deleted') {
    throw AppError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND');
  }
  if (user.status === 'suspended') {
    throw AppError.forbidden('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  }
  // JWT iat has second precision: a token from a strictly earlier second than the change is stale.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw AppError.unauthorized('Password was changed, please log in again', 'TOKEN_STALE');
  }

  return {
    id: user._id.toString(),
    role: user.role as Role,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
  };
}

/** Requires a valid access token. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) throw AppError.unauthorized('Authentication required', 'NO_TOKEN');
    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
};

/** Attaches req.user when a valid token is present, but never fails. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (token) req.user = await resolveUser(token);
  } catch {
    // Invalid/expired token on an optional route is treated as anonymous.
  }
  next();
};
