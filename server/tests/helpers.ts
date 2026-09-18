import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { sha256 } from '../src/utils/crypto';

export const API = '/api/v1';

let app: Express | undefined;
export function getApp(): Express {
  if (!app) app = createApp();
  return app;
}

export const candidateInput = {
  fullName: 'Asha Verma',
  email: 'asha.verma@example.com',
  password: 'Passw0rd123',
};

export const recruiterInput = {
  fullName: 'Rohan Mehta',
  email: 'rohan@acme.example.com',
  password: 'Passw0rd123',
  companyName: 'Acme Technologies',
};

export function extractRefreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((c) => c.startsWith('jp_refresh='));
  if (!match) throw new Error('refresh cookie not set');
  return match.split(';')[0]!;
}

export async function registerCandidate(overrides: Partial<typeof candidateInput> = {}) {
  const res = await request(getApp())
    .post(`${API}/auth/register/candidate`)
    .send({ ...candidateInput, ...overrides });
  return res;
}

export async function registerRecruiter(overrides: Partial<typeof recruiterInput> = {}) {
  return request(getApp())
    .post(`${API}/auth/register/recruiter`)
    .send({ ...recruiterInput, ...overrides });
}

export async function login(email: string, password: string) {
  return request(getApp()).post(`${API}/auth/login`).send({ email, password });
}

/** Reads the raw verification token by matching its hash is impossible; instead set a known token. */
export async function forceVerificationToken(email: string, raw: string) {
  await User.updateOne(
    { email },
    {
      $set: {
        emailVerificationTokenHash: sha256(raw),
        emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    },
  );
}

export async function forceResetToken(email: string, raw: string, expiresInMs = 60 * 60 * 1000) {
  await User.updateOne(
    { email },
    {
      $set: {
        passwordResetTokenHash: sha256(raw),
        passwordResetExpiresAt: new Date(Date.now() + expiresInMs),
      },
    },
  );
}
