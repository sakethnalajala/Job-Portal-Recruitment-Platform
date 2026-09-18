import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog';
import { User } from '../src/models/User';
import { API, getApp, login } from './helpers';
import { admin, apply, auth, candidate, postJob, recruiter, uploadResume } from './factories';

const app = () => getApp();

describe('admin-only login', () => {
  it('accepts admins, rejects candidates/recruiters with 403 NOT_ADMIN, wrong password 401', async () => {
    const a = await admin();
    const c = await candidate();
    const ok = await request(app()).post(`${API}/auth/admin/login`).send({ email: a.email, password: a.password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.role).toBe('admin');
    const notAdmin = await request(app()).post(`${API}/auth/admin/login`).send({ email: c.email, password: c.password });
    expect(notAdmin.status).toBe(403);
    expect(notAdmin.body.error.code).toBe('NOT_ADMIN');
    const bad = await request(app()).post(`${API}/auth/admin/login`).send({ email: a.email, password: 'WrongPass123' });
    expect(bad.status).toBe(401);
  });

  it('there is no admin registration endpoint and the role cannot be escalated', async () => {
    expect((await request(app()).post(`${API}/auth/register/admin`).send({ fullName: 'X', email: 'x@example.com', password: 'Passw0rd123' })).status).toBe(404);
    const c = await request(app()).post(`${API}/auth/register/candidate`).send({ fullName: 'Mallory', email: 'mallory@example.com', password: 'Passw0rd123', role: 'admin' });
    expect(c.body.data.user.role).toBe('candidate');
    expect(await User.countDocuments({ role: 'admin' })).toBe(0);
  });
});

describe('sessions & display name', () => {
  it('lists own sessions, flags the current one, and revokes another', async () => {
    const c = await candidate();
    await login(c.email, c.password);
    const res = await request(app()).get(`${API}/auth/sessions`).set(auth(c));
    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(2);
    const other = res.body.data.sessions.find((s: { current: boolean }) => !s.current) ?? res.body.data.sessions[1];
    expect((await request(app()).delete(`${API}/auth/sessions/${other.id}`).set(auth(c))).status).toBe(200);
    expect((await request(app()).get(`${API}/auth/sessions`).set(auth(c))).body.data.sessions).toHaveLength(1);
    const stranger = await candidate();
    expect((await request(app()).delete(`${API}/auth/sessions/${other.id}`).set(auth(stranger))).status).toBe(404);
  });

  it('only admins can set a display name', async () => {
    const a = await admin();
    const c = await candidate();
    const res = await request(app()).patch(`${API}/auth/display-name`).set(auth(a)).send({ displayName: 'Ops Admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.profile.fullName).toBe('Ops Admin');
    expect((await request(app()).get(`${API}/auth/me`).set(auth(a))).body.data.user.profile.fullName).toBe('Ops Admin');
    expect((await request(app()).patch(`${API}/auth/display-name`).set(auth(c)).send({ displayName: 'Nope' })).status).toBe(403);
  });
});

describe('platform settings', () => {
  it('public settings are readable anonymously; admin settings are admin-only', async () => {
    const pub = await request(app()).get(`${API}/settings/public`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.registration).toEqual({ candidate: true, recruiter: true });
    expect(pub.body.data.announcement).toBeNull();
    const c = await candidate();
    expect((await request(app()).get(`${API}/admin/settings`).set(auth(c))).status).toBe(403);
    expect((await request(app()).patch(`${API}/admin/settings`).set(auth(c)).send({ maintenance: { enabled: true } })).status).toBe(403);
  });

  it('closing recruiter registration blocks signups; announcement shows publicly; audit written', async () => {
    const a = await admin();
    const res = await request(app()).patch(`${API}/admin/settings`).set(auth(a)).send({ registration: { recruiter: false }, announcement: { enabled: true, message: 'Hiring freeze week', tone: 'warning' } });
    expect(res.status).toBe(200);
    expect(res.body.data.settings.registration.recruiter).toBe(false);

    const blocked = await request(app()).post(`${API}/auth/register/recruiter`).send({ fullName: 'Rohit Blocked', email: 'recruiter.blocked@example.com', password: 'Passw0rd123', companyName: 'Blocked Co' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('REGISTRATION_CLOSED');
    expect((await request(app()).post(`${API}/auth/register/candidate`).send({ fullName: 'Cara Open', email: 'candidate.open@example.com', password: 'Passw0rd123' })).status).toBe(201);

    const pub = await request(app()).get(`${API}/settings/public`);
    expect(pub.body.data.announcement).toEqual({ message: 'Hiring freeze week', tone: 'warning' });
    expect(await AuditLog.countDocuments({ action: 'settings.update' })).toBe(1);
    expect((await request(app()).patch(`${API}/admin/settings`).set(auth(a)).send({ bogus: true })).status).toBe(400);
  });

  it('maintenance mode blocks non-admin login but admins still get in', async () => {
    const a = await admin();
    const c = await candidate();
    await request(app()).patch(`${API}/admin/settings`).set(auth(a)).send({ maintenance: { enabled: true, message: 'Back at 6pm IST' } });
    const blocked = await login(c.email, c.password);
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe('MAINTENANCE_MODE');
    expect((await login(a.email, a.password)).status).toBe(200);
    await request(app()).patch(`${API}/admin/settings`).set(auth(a)).send({ maintenance: { enabled: false } });
    expect((await login(c.email, c.password)).status).toBe(200);
  });

  it('requireVerifiedCompanyToPublish gates publishing', async () => {
    const a = await admin();
    const r = await recruiter();
    await request(app()).patch(`${API}/admin/settings`).set(auth(a)).send({ jobs: { requireVerifiedCompanyToPublish: true } });
    const blocked = await request(app()).post(`${API}/jobs`).set(auth(r)).send({ ...(await import('./factories')).jobPayload() });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('COMPANY_NOT_VERIFIED');
    const draft = await request(app()).post(`${API}/jobs`).set(auth(r)).send({ ...(await import('./factories')).jobPayload({ status: 'draft' }) });
    expect(draft.status).toBe(201);
  });
});

describe('analytics & system health', () => {
  it('analytics reflect real data and support a range', async () => {
    const a = await admin();
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r, { location: { city: 'Pune', country: 'India' } });
    await uploadResume(c);
    await apply(c, job.id);
    const res = await request(app()).get(`${API}/admin/analytics?days=7`).set(auth(a));
    expect(res.status).toBe(200);
    expect(res.body.data.rangeDays).toBe(7);
    expect(res.body.data.totals).toMatchObject({ users: 3, candidates: 1, recruiters: 1, admins: 1, jobs: 1, activeJobs: 1, applications: 1 });
    expect(res.body.data.breakdowns.jobsByCity).toEqual([{ key: 'Pune', count: 1 }]);
    expect(res.body.data.trends.applications).toHaveLength(1);
    expect(res.body.data.conversion.allTime.offerRate).toBe(0);
    expect((await request(app()).get(`${API}/admin/analytics?days=1`).set(auth(a))).status).toBe(400);
    expect((await request(app()).get(`${API}/admin/analytics`).set(auth(c))).status).toBe(403);
  });

  it('system health exposes status but never the connection string', async () => {
    const a = await admin();
    const res = await request(app()).get(`${API}/admin/system`).set(auth(a));
    expect(res.status).toBe(200);
    expect(res.body.data.database.status).toBe('connected');
    expect(typeof res.body.data.database.pingMs).toBe('number');
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb(\+srv)?:\/\//);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
    expect(res.body.data.database.collections.find((c: { name: string }) => c.name === 'users').count).toBeGreaterThanOrEqual(1);
  });
});

describe('notifications type filter', () => {
  it('filters by type', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    await apply(c, job.id);
    await new Promise((res) => setTimeout(res, 120));
    const all = await request(app()).get(`${API}/notifications`).set(auth(c));
    expect(all.body.meta.total).toBe(1);
    expect((await request(app()).get(`${API}/notifications?type=application_submitted`).set(auth(c))).body.meta.total).toBe(1);
    expect((await request(app()).get(`${API}/notifications?type=job_closed`).set(auth(c))).body.meta.total).toBe(0);
  });
});
