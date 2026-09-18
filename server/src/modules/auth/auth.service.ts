import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { CandidateProfile } from '../../models/CandidateProfile';
import { RecruiterProfile } from '../../models/RecruiterProfile';
import { User, type UserDoc } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { getPlatformSettings } from '../../models/PlatformSettings';
import { activatePendingInvitations } from '../../services/team.service';
import { sendEmail } from '../../services/email/email.service';
import { storageService } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import { TOKEN_TTL, type Role } from '../../utils/constants';
import { randomToken, sha256 } from '../../utils/crypto';
import {
  issueRefreshToken,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './token.service';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterCandidateInput,
  RegisterRecruiterInput,
} from './auth.validation';

interface RequestMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface AuthUserView {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date | undefined;
  profile: {
    fullName: string;
    photoUrl?: string | null;
    completion?: number;
    companyName?: string;
    isVerified?: boolean;
  } | null;
}

export interface AuthResult {
  user: AuthUserView;
  accessToken: string;
  refreshToken: string;
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function buildUserView(user: UserDoc): Promise<AuthUserView> {
  const base = {
    id: user._id.toString(),
    email: user.email,
    role: user.role as Role,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };

  if (user.role === 'candidate') {
    const p = await CandidateProfile.findOne({ user: user._id })
      .select('fullName photoPublicId completion')
      .lean();
    return {
      ...base,
      profile: p
        ? { fullName: p.fullName, photoUrl: storageService.getImageUrl(p.photoPublicId), completion: p.completion }
        : null,
    };
  }
  if (user.role === 'recruiter') {
    const p = await RecruiterProfile.findOne({ user: user._id })
      .select('fullName companyName logoPublicId photoPublicId isVerified')
      .lean();
    return {
      ...base,
      profile: p
        ? {
            fullName: p.fullName,
            companyName: p.companyName,
            photoUrl: storageService.getImageUrl(p.photoPublicId ?? p.logoPublicId),
            isVerified: p.isVerified,
          }
        : null,
    };
  }
  return { ...base, profile: { fullName: user.displayName || env.ADMIN_NAME } };
}

async function issueSession(user: UserDoc, meta: RequestMeta): Promise<AuthResult> {
  const [accessToken, refreshToken] = await Promise.all([
    Promise.resolve(signAccessToken(user._id.toString(), user.role as Role)),
    issueRefreshToken(user._id.toString(), meta),
  ]);
  return { user: await buildUserView(user), accessToken, refreshToken };
}

async function setEmailVerificationToken(user: UserDoc): Promise<string> {
  const raw = randomToken(32);
  user.set({
    emailVerificationTokenHash: sha256(raw),
    emailVerificationExpiresAt: new Date(
      Date.now() + TOKEN_TTL.EMAIL_VERIFICATION_HOURS * 60 * 60 * 1000,
    ),
  });
  await user.save();
  return raw;
}

function dispatchVerificationEmail(user: UserDoc, name: string, rawToken: string): void {
  const url = `${env.CLIENT_URL}/verify-email?token=${rawToken}`;
  void sendEmail('verifyEmail', user.email, {
    name,
    url,
    expiresInHours: TOKEN_TTL.EMAIL_VERIFICATION_HOURS,
  });
}

async function displayName(user: UserDoc): Promise<string> {
  if (user.role === 'candidate') {
    const p = await CandidateProfile.findOne({ user: user._id }).select('fullName').lean();
    return p?.fullName ?? 'there';
  }
  if (user.role === 'recruiter') {
    const p = await RecruiterProfile.findOne({ user: user._id }).select('fullName').lean();
    return p?.fullName ?? 'there';
  }
  return user.displayName || env.ADMIN_NAME;
}

async function assertRegistrationOpen(role: 'candidate' | 'recruiter'): Promise<void> {
  const settings = await getPlatformSettings();
  if (settings.maintenance?.enabled) {
    throw new AppError(503, 'MAINTENANCE_MODE', settings.maintenance.message ?? 'The platform is under maintenance');
  }
  if (!settings.registration?.[role]) {
    throw AppError.forbidden(`${role === 'candidate' ? 'Candidate' : 'Recruiter'} registration is currently closed`, 'REGISTRATION_CLOSED');
  }
}

// ─── registration ──────────────────────────────────────────────────────────

async function ensureEmailAvailable(email: string): Promise<void> {
  const exists = await User.exists({ email });
  if (exists) throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
}

/** Role is fixed by the calling route, never taken from the request body. */
async function createUser(email: string, password: string, role: Role): Promise<UserDoc> {
  await ensureEmailAvailable(email);
  const passwordHash = await User.hashPassword(password);
  try {
    return await User.create({ email, passwordHash, role });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function registerCandidate(
  input: RegisterCandidateInput,
  meta: RequestMeta,
): Promise<AuthResult> {
  await assertRegistrationOpen('candidate');
  const user = await createUser(input.email, input.password, 'candidate');
  try {
    await CandidateProfile.create({ user: user._id, fullName: input.fullName });
  } catch (err) {
    // Compensate: never leave an account without a profile.
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  const rawToken = await setEmailVerificationToken(user);
  dispatchVerificationEmail(user, input.fullName, rawToken);
  return issueSession(user, meta);
}

export async function registerRecruiter(
  input: RegisterRecruiterInput,
  meta: RequestMeta,
): Promise<AuthResult> {
  await assertRegistrationOpen('recruiter');
  const user = await createUser(input.email, input.password, 'recruiter');
  try {
    await RecruiterProfile.create({
      user: user._id,
      fullName: input.fullName,
      companyName: input.companyName,
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  const rawToken = await setEmailVerificationToken(user);
  dispatchVerificationEmail(user, input.fullName, rawToken);
  void activatePendingInvitations(user._id.toString(), user.email);
  return issueSession(user, meta);
}

// ─── login / session ───────────────────────────────────────────────────────

export async function login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');

  // Same message for unknown email and wrong password (no user enumeration).
  const invalid = AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user || user.status === 'deleted') throw invalid;

  const ok = await user.comparePassword(input.password);
  if (!ok) throw invalid;

  if (user.status === 'suspended') {
    throw AppError.forbidden('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  // Maintenance mode keeps administrators in and everyone else out.
  if (user.role !== 'admin') {
    const settings = await getPlatformSettings();
    if (settings.maintenance?.enabled) {
      throw new AppError(503, 'MAINTENANCE_MODE', settings.maintenance.message ?? 'The platform is under maintenance');
    }
  }

  user.lastLoginAt = new Date();
  await user.save();
  if (user.role === 'recruiter') void activatePendingInvitations(user._id.toString(), user.email);
  return issueSession(user, meta);
}

/**
 * Admin console login: identical credential check, but only administrator
 * accounts are accepted. Candidates/recruiters get a clear 403 instead of a
 * session they cannot use on admin routes.
 */
export async function adminLogin(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const invalid = AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user || user.status === 'deleted') throw invalid;
  if (!(await user.comparePassword(input.password))) throw invalid;
  if (user.role !== 'admin') throw AppError.forbidden('This account is not an administrator', 'NOT_ADMIN');
  if (user.status === 'suspended') throw AppError.forbidden('Your account has been suspended', 'ACCOUNT_SUSPENDED');
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, meta);
}

// ─── sessions (own refresh tokens) ─────────────────────────────────────────

export async function listSessions(userId: string, currentRefreshHash: string | undefined) {
  const tokens = await RefreshToken.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();
  return tokens.map((t) => ({
    id: t._id.toString(),
    userAgent: t.userAgent ?? null,
    ip: t.ip ?? null,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    current: currentRefreshHash !== undefined && t.tokenHash === currentRefreshHash,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await RefreshToken.updateOne({ _id: sessionId, user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (result.matchedCount === 0) throw AppError.notFound('Session not found', 'SESSION_NOT_FOUND');
}

export async function updateDisplayName(userId: string, displayName: string): Promise<AuthUserView> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  user.displayName = displayName;
  await user.save();
  return buildUserView(user);
}

export async function refreshSession(
  rawRefreshToken: string,
  meta: RequestMeta,
): Promise<AuthResult> {
  const { userId, newRaw } = await rotateRefreshToken(rawRefreshToken, meta);
  const user = await User.findById(userId);
  if (!user || user.status !== 'active') {
    throw AppError.unauthorized('Session is no longer valid', 'SESSION_INVALID');
  }
  const accessToken = signAccessToken(user._id.toString(), user.role as Role);
  return { user: await buildUserView(user), accessToken, refreshToken: newRaw };
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (rawRefreshToken) await revokeRefreshToken(rawRefreshToken);
}

export async function logoutAll(userId: string): Promise<void> {
  await revokeAllUserSessions(userId);
}

export async function getCurrentUser(userId: string): Promise<AuthUserView> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return buildUserView(user);
}

// ─── password management ───────────────────────────────────────────────────

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  meta: RequestMeta,
): Promise<AuthResult> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found');

  const ok = await user.comparePassword(input.currentPassword);
  if (!ok) throw AppError.badRequest('Current password is incorrect', 'INVALID_PASSWORD');

  user.passwordHash = await User.hashPassword(input.newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  // Sign out every other device, then hand this device a fresh session.
  await revokeAllUserSessions(userId);
  void sendEmail('passwordChanged', user.email, { name: await displayName(user) });
  return issueSession(user, meta);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, status: 'active' });
  // Always succeed from the caller's perspective (no enumeration).
  if (!user) {
    logger.debug({ email }, '[auth] forgot-password for unknown email');
    return;
  }
  const raw = randomToken(32);
  user.set({
    passwordResetTokenHash: sha256(raw),
    passwordResetExpiresAt: new Date(Date.now() + TOKEN_TTL.PASSWORD_RESET_MINUTES * 60 * 1000),
  });
  await user.save();

  const url = `${env.CLIENT_URL}/reset-password?token=${raw}`;
  void sendEmail('resetPassword', user.email, {
    name: await displayName(user),
    url,
    expiresInMinutes: TOKEN_TTL.PASSWORD_RESET_MINUTES,
  });
}

export async function resetPassword(rawToken: string, password: string): Promise<void> {
  const user = await User.findOne({
    passwordResetTokenHash: sha256(rawToken),
    passwordResetExpiresAt: { $gt: new Date() },
    status: 'active',
  }).select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw AppError.badRequest('This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
  }

  user.passwordHash = await User.hashPassword(password);
  user.passwordChangedAt = new Date();
  user.set({ passwordResetTokenHash: undefined, passwordResetExpiresAt: undefined });
  await user.save();

  await revokeAllUserSessions(user._id.toString());
  void sendEmail('passwordChanged', user.email, { name: await displayName(user) });
}

// ─── email verification ────────────────────────────────────────────────────

export async function verifyEmail(rawToken: string): Promise<void> {
  const user = await User.findOne({
    emailVerificationTokenHash: sha256(rawToken),
    emailVerificationExpiresAt: { $gt: new Date() },
  }).select('+emailVerificationTokenHash +emailVerificationExpiresAt');

  if (!user) {
    throw AppError.badRequest(
      'This verification link is invalid or has expired',
      'INVALID_VERIFICATION_TOKEN',
    );
  }

  user.isEmailVerified = true;
  user.set({ emailVerificationTokenHash: undefined, emailVerificationExpiresAt: undefined });
  await user.save();
}

export async function resendVerification(email: string): Promise<void> {
  const user = await User.findOne({ email, status: 'active' });
  if (!user || user.isEmailVerified) return; // silent: no enumeration
  const raw = await setEmailVerificationToken(user);
  dispatchVerificationEmail(user, await displayName(user), raw);
}
