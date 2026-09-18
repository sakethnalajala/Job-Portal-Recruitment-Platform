import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { User } from '../src/models/User';
import { RefreshToken } from '../src/models/RefreshToken';
import { CandidateProfile } from '../src/models/CandidateProfile';
import { RecruiterProfile } from '../src/models/RecruiterProfile';
import {
  API,
  candidateInput,
  extractRefreshCookie,
  forceResetToken,
  forceVerificationToken,
  getApp,
  login,
  recruiterInput,
  registerCandidate,
  registerRecruiter,
} from './helpers';

const app = () => getApp();

describe('health', () => {
  it('reports healthy with db up', async () => {
    const res = await request(app()).get(`${API}/health`);
    expect(res.status).toBe(200);
    expect(res.body.data.services.database).toBe('up');
  });
});

describe('registration', () => {
  it('registers a candidate, creates profile, returns session', async () => {
    const res = await registerCandidate();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      email: candidateInput.email,
      role: 'candidate',
      isEmailVerified: false,
      profile: { fullName: candidateInput.fullName, completion: expect.any(Number) },
    });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(extractRefreshCookie(res)).toMatch(/^jp_refresh=/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);

    expect(await CandidateProfile.countDocuments()).toBe(1);
    expect(await RefreshToken.countDocuments()).toBe(1);
  });

  it('registers a recruiter with a company profile', async () => {
    const res = await registerRecruiter();
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('recruiter');
    expect(res.body.data.user.profile).toMatchObject({
      companyName: recruiterInput.companyName,
      isVerified: false,
    });
    expect(await RecruiterProfile.countDocuments()).toBe(1);
  });

  it('rejects duplicate email across roles with 409', async () => {
    await registerCandidate();
    const res = await registerRecruiter({ email: candidateInput.email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(await User.countDocuments()).toBe(1);
  });

  it('normalises email case', async () => {
    await registerCandidate({ email: 'Asha.Verma@Example.com' });
    const res = await registerCandidate();
    expect(res.status).toBe(409);
  });

  it('ignores a role field in the body (no privilege escalation)', async () => {
    const res = await request(app())
      .post(`${API}/auth/register/candidate`)
      .send({ ...candidateInput, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('candidate');
    const user = await User.findOne({ email: candidateInput.email });
    expect(user?.role).toBe('candidate');
  });

  it('validates input and returns field-level details', async () => {
    const res = await request(app())
      .post(`${API}/auth/register/candidate`)
      .send({ fullName: 'A', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['body.fullName', 'body.email', 'body.password']),
    );
    expect(res.body.error).not.toHaveProperty('stack');
  });

  it('rejects malformed JSON with a safe error', async () => {
    const res = await request(app())
      .post(`${API}/auth/register/candidate`)
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('login', () => {
  it('logs in with valid credentials and records lastLoginAt', async () => {
    await registerCandidate();
    const res = await login(candidateInput.email, candidateInput.password);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const user = await User.findOne({ email: candidateInput.email });
    expect(user?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('returns the same generic error for unknown email and wrong password', async () => {
    await registerCandidate();
    const unknown = await login('nobody@example.com', 'Passw0rd123');
    const wrong = await login(candidateInput.email, 'WrongPass123');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toEqual(wrong.body.error);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('blocks suspended accounts', async () => {
    await registerCandidate();
    await User.updateOne({ email: candidateInput.email }, { status: 'suspended' });
    const res = await login(candidateInput.email, candidateInput.password);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('treats soft-deleted accounts as non-existent', async () => {
    await registerCandidate();
    await User.updateOne({ email: candidateInput.email }, { status: 'deleted', deletedAt: new Date() });
    const res = await login(candidateInput.email, candidateInput.password);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('protected routes & tokens', () => {
  it('GET /auth/me requires a token', async () => {
    const res = await request(app()).get(`${API}/auth/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('GET /auth/me returns the current user with a valid token', async () => {
    const reg = await registerCandidate();
    const res = await request(app())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(candidateInput.email);
  });

  it('rejects tampered tokens', async () => {
    const reg = await registerCandidate();
    const token = `${reg.body.data.accessToken.slice(0, -2)}xx`;
    const res = await request(app()).get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('access token stops working once the user is suspended', async () => {
    const reg = await registerCandidate();
    await User.updateOne({ email: candidateInput.email }, { status: 'suspended' });
    const res = await request(app())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and revokes the previous one', async () => {
    const reg = await registerCandidate();
    const cookie1 = extractRefreshCookie(reg);

    const r1 = await request(app()).post(`${API}/auth/refresh`).set('Cookie', cookie1);
    expect(r1.status).toBe(200);
    expect(r1.body.data.accessToken).toEqual(expect.any(String));
    const cookie2 = extractRefreshCookie(r1);
    expect(cookie2).not.toBe(cookie1);

    const tokens = await RefreshToken.find().sort({ createdAt: 1 });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.revokedAt).toBeInstanceOf(Date);
    expect(tokens[1]!.revokedAt).toBeUndefined();
    expect(tokens[0]!.family).toBe(tokens[1]!.family);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const reg = await registerCandidate();
    const cookie1 = extractRefreshCookie(reg);

    const r1 = await request(app()).post(`${API}/auth/refresh`).set('Cookie', cookie1);
    const cookie2 = extractRefreshCookie(r1);

    // Replay the old token → theft signal
    const replay = await request(app()).post(`${API}/auth/refresh`).set('Cookie', cookie1);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate newest token is now dead too
    const r2 = await request(app()).post(`${API}/auth/refresh`).set('Cookie', cookie2);
    expect(r2.status).toBe(401);

    const live = await RefreshToken.countDocuments({ revokedAt: null });
    expect(live).toBe(0);
  });

  it('refresh without a cookie is rejected', async () => {
    const res = await request(app()).post(`${API}/auth/refresh`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const reg = await registerCandidate();
    const cookie = extractRefreshCookie(reg);

    const out = await request(app()).post(`${API}/auth/logout`).set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie']?.[0]).toMatch(/jp_refresh=;/);

    const again = await request(app()).post(`${API}/auth/refresh`).set('Cookie', cookie);
    expect(again.status).toBe(401);
  });

  it('logout-all revokes every session for the user', async () => {
    const reg = await registerCandidate();
    await login(candidateInput.email, candidateInput.password);
    await login(candidateInput.email, candidateInput.password);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(3);

    const res = await request(app())
      .post(`${API}/auth/logout-all`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });
});

describe('password management', () => {
  it('changes password, invalidates old sessions/tokens, issues a new session', async () => {
    const reg = await registerCandidate();
    const oldAccess = reg.body.data.accessToken;
    const otherDevice = await login(candidateInput.email, candidateInput.password);
    const otherCookie = extractRefreshCookie(otherDevice);

    // Cross a JWT second boundary so the pre-change token is provably older.
    await new Promise((r) => setTimeout(r, 1100));
    const res = await request(app())
      .patch(`${API}/auth/change-password`)
      .set('Authorization', `Bearer ${oldAccess}`)
      .send({ currentPassword: candidateInput.password, newPassword: 'NewPassw0rd456' });
    expect(res.status).toBe(200);
    const newAccess = res.body.data.accessToken;

    // Old access token is stale (issued before passwordChangedAt)
    const stale = await request(app()).get(`${API}/auth/me`).set('Authorization', `Bearer ${oldAccess}`);
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('TOKEN_STALE');

    // The other device's refresh token is revoked
    const other = await request(app()).post(`${API}/auth/refresh`).set('Cookie', otherCookie);
    expect(other.status).toBe(401);

    // New session works, old password does not
    const me = await request(app()).get(`${API}/auth/me`).set('Authorization', `Bearer ${newAccess}`);
    expect(me.status).toBe(200);
    expect((await login(candidateInput.email, candidateInput.password)).status).toBe(401);
    expect((await login(candidateInput.email, 'NewPassw0rd456')).status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const reg = await registerCandidate();
    const res = await request(app())
      .patch(`${API}/auth/change-password`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ currentPassword: 'Nope12345', newPassword: 'NewPassw0rd456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
  });

  it('forgot-password always returns 200 (no enumeration)', async () => {
    const res = await request(app())
      .post(`${API}/auth/forgot-password`)
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
  });

  it('resets the password with a valid token and revokes sessions', async () => {
    await registerCandidate();
    const raw = 'a'.repeat(64);
    await forceResetToken(candidateInput.email, raw);

    const res = await request(app())
      .post(`${API}/auth/reset-password`)
      .send({ token: raw, password: 'Reset1234567' });
    expect(res.status).toBe(200);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
    expect((await login(candidateInput.email, 'Reset1234567')).status).toBe(200);

    // Token is single-use
    const again = await request(app())
      .post(`${API}/auth/reset-password`)
      .send({ token: raw, password: 'Reset7654321' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects an expired reset token', async () => {
    await registerCandidate();
    const raw = 'b'.repeat(64);
    await forceResetToken(candidateInput.email, raw, -1000);
    const res = await request(app())
      .post(`${API}/auth/reset-password`)
      .send({ token: raw, password: 'Reset1234567' });
    expect(res.status).toBe(400);
  });
});

describe('email verification', () => {
  it('verifies email with a valid token', async () => {
    const reg = await registerCandidate();
    const raw = 'c'.repeat(64);
    await forceVerificationToken(candidateInput.email, raw);

    const res = await request(app()).post(`${API}/auth/verify-email`).send({ token: raw });
    expect(res.status).toBe(200);

    const me = await request(app())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(me.body.data.user.isEmailVerified).toBe(true);

    const again = await request(app()).post(`${API}/auth/verify-email`).send({ token: raw });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
  });

  it('resend-verification is silent for unknown emails', async () => {
    const res = await request(app())
      .post(`${API}/auth/resend-verification`)
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
  });
});

describe('error envelope', () => {
  it('unknown routes return a consistent 404 body', async () => {
    const res = await request(app()).get(`${API}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) },
    });
  });

  it('blocks disallowed CORS origins', async () => {
    const res = await request(app()).get(`${API}/health`).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_BLOCKED');
  });

  it('allows the configured client origin', async () => {
    const res = await request(app()).get(`${API}/health`).set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sets security headers', async () => {
    const res = await request(app()).get(`${API}/health`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
