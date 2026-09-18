import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { API, getApp } from './helpers';

// Rate limiting is skipped in tests unless explicitly enabled — this file opts in.
beforeAll(() => {
  process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true';
});

describe('rate limiting', () => {
  it('limits repeated login attempts per ip+email', async () => {
    const app = getApp();
    const body = { email: 'brute@example.com', password: 'Passw0rd123' };
    let last: request.Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await request(app).post(`${API}/auth/login`).send(body);
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe('RATE_LIMITED');
    expect(last!.headers['ratelimit']).toBeDefined();

    // A different email from the same IP is unaffected.
    const other = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'someone.else@example.com', password: 'Passw0rd123' });
    expect(other.status).toBe(401);
  });
});
