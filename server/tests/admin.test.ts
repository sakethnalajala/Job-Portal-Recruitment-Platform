import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Application } from '../src/models/Application';
import { AuditLog } from '../src/models/AuditLog';
import { Job } from '../src/models/Job';
import { RefreshToken } from '../src/models/RefreshToken';
import { Report } from '../src/models/Report';
import { User } from '../src/models/User';
import { API, getApp, login } from './helpers';
import { admin, apply, auth, candidate, postJob, recruiter, uploadResume } from './factories';

const app = () => getApp();
const settle = () => new Promise((r) => setTimeout(r, 120));

describe('admin access control', () => {
  it('every /admin route is admin-only', async () => {
    const c = await candidate();
    const r = await recruiter();
    for (const s of [c, r]) {
      expect((await request(app()).get(`${API}/admin/stats`).set(auth(s))).status).toBe(403);
      expect((await request(app()).get(`${API}/admin/users`).set(auth(s))).status).toBe(403);
      expect((await request(app()).get(`${API}/admin/reports`).set(auth(s))).status).toBe(403);
    }
    expect((await request(app()).get(`${API}/admin/stats`)).status).toBe(401);
  });
});

describe('user management', () => {
  it('lists users with role/status/search filters and profile summaries', async () => {
    const a = await admin();
    await candidate({ name: 'Asha Verma' });
    await recruiter({ company: 'Nimbus Analytics' });

    const all = await request(app()).get(`${API}/admin/users`).set(auth(a));
    expect(all.body.meta.total).toBe(3);
    const cands = await request(app()).get(`${API}/admin/users?role=candidate`).set(auth(a));
    expect(cands.body.data.users).toHaveLength(1);
    expect(cands.body.data.users[0].profile.fullName).toBe('Asha Verma');
    const search = await request(app()).get(`${API}/admin/users?q=nimbus`).set(auth(a));
    expect(search.body.data.users).toHaveLength(1);
    expect(search.body.data.users[0].profile.companyName).toBe('Nimbus Analytics');
  });

  it('suspends a user (sessions revoked, audit written) and reactivates', async () => {
    const a = await admin();
    const c = await candidate();

    const res = await request(app()).patch(`${API}/admin/users/${c.userId}/status`).set(auth(a)).send({ status: 'suspended', reason: 'Spam applications' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('suspended');
    expect(await RefreshToken.countDocuments({ user: c.userId, revokedAt: null })).toBe(0);
    expect((await request(app()).get(`${API}/auth/me`).set(auth(c))).status).toBe(403);
    expect((await login(c.email, c.password)).body.error.code).toBe('ACCOUNT_SUSPENDED');

    const log = await AuditLog.findOne({ action: 'user.suspend' }).lean();
    expect(log).toMatchObject({ actor: expect.anything(), reason: 'Spam applications' });
    expect(log?.targetId.toString()).toBe(c.userId);

    const back = await request(app()).patch(`${API}/admin/users/${c.userId}/status`).set(auth(a)).send({ status: 'active' });
    expect(back.body.data.user.status).toBe('active');
    expect((await login(c.email, c.password)).status).toBe(200);
  });

  it('cannot modify admin accounts', async () => {
    const a = await admin();
    const b = await admin();
    const res = await request(app()).patch(`${API}/admin/users/${b.userId}/status`).set(auth(a)).send({ status: 'suspended' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_PROTECTED');
  });

  it('soft-deletes a recruiter: jobs closed, login impossible, row kept', async () => {
    const a = await admin();
    const r = await recruiter();
    const job = await postJob(r);

    expect((await request(app()).delete(`${API}/admin/users/${r.userId}`).set(auth(a)).send({ reason: 'Fake company' })).status).toBe(204);
    const user = await User.findById(r.userId);
    expect(user?.status).toBe('deleted');
    expect(user?.deletedAt).toBeInstanceOf(Date);
    expect((await Job.findById(job.id))?.status).toBe('closed');
    expect((await login(r.email, r.password)).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'user.delete' })).toBe(1);
  });

  it('user detail includes stats and audit trail', async () => {
    const a = await admin();
    const c = await candidate();
    await request(app()).patch(`${API}/admin/users/${c.userId}/status`).set(auth(a)).send({ status: 'suspended' });
    const res = await request(app()).get(`${API}/admin/users/${c.userId}`).set(auth(a));
    expect(res.body.data.user.status).toBe('suspended');
    expect(res.body.data.auditTrail).toHaveLength(1);
  });
});

describe('recruiter verification', () => {
  it('verifies a recruiter, flags their jobs, notifies, audits; rejects no-op', async () => {
    const a = await admin();
    const r = await recruiter();
    const job = await postJob(r);
    const profileId = (await request(app()).get(`${API}/recruiters/me`).set(auth(r))).body.data.profile.id;

    const res = await request(app()).patch(`${API}/admin/recruiters/${profileId}/verify`).set(auth(a)).send({ isVerified: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isVerified).toBe(true);
    expect((await Job.findById(job.id))?.companyVerified).toBe(true);
    expect((await request(app()).get(`${API}/jobs/${job.id}`)).body.data.job.companyVerified).toBe(true);
    await settle();
    const notes = await request(app()).get(`${API}/notifications`).set(auth(r));
    expect(notes.body.data.notifications[0].type).toBe('recruiter_verified');

    expect((await request(app()).patch(`${API}/admin/recruiters/${profileId}/verify`).set(auth(a)).send({ isVerified: true })).body.error.code).toBe('NO_CHANGE');
    expect(await AuditLog.countDocuments({ action: 'recruiter.verify' })).toBe(1);
  });
});

describe('job moderation & reports', () => {
  it('removes a reported job: hidden from public, owner locked out, reports auto-resolved, restore → closed', async () => {
    const a = await admin();
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await request(app()).post(`${API}/jobs/${job.id}/report`).set(auth(c)).send({ reason: 'scam', details: 'Fee demanded' });

    const reported = await request(app()).get(`${API}/admin/jobs?reported=true`).set(auth(a));
    expect(reported.body.data.jobs).toHaveLength(1);
    expect(reported.body.data.jobs[0].pendingReports).toBe(1);

    const remove = await request(app()).patch(`${API}/admin/jobs/${job.id}/moderate`).set(auth(a)).send({ action: 'remove', reason: 'Confirmed scam' });
    expect(remove.status).toBe(200);
    expect(remove.body.data.job.status).toBe('removed');
    expect((await request(app()).get(`${API}/jobs/${job.id}`)).status).toBe(404);
    expect((await request(app()).patch(`${API}/jobs/${job.id}`).set(auth(r)).send({ title: 'Still here?' })).body.error.code).toBe('JOB_REMOVED');
    expect((await Report.findOne({ targetId: job.id }))?.status).toBe('action_taken');
    expect((await request(app()).get(`${API}/jobs`)).body.meta.total).toBe(0);

    const restore = await request(app()).patch(`${API}/admin/jobs/${job.id}/moderate`).set(auth(a)).send({ action: 'restore' });
    expect(restore.body.data.job.status).toBe('closed');
    expect(await AuditLog.countDocuments({ action: { $in: ['job.remove', 'job.restore'] } })).toBe(2);
  });

  it('lists and resolves reports', async () => {
    const a = await admin();
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await request(app()).post(`${API}/jobs/${job.id}/report`).set(auth(c)).send({ reason: 'misleading' });

    const list = await request(app()).get(`${API}/admin/reports?status=pending`).set(auth(a));
    expect(list.body.data.reports).toHaveLength(1);
    expect(list.body.data.reports[0]).toMatchObject({ reason: 'misleading', target: { title: 'Senior Backend Engineer' }, reporter: { email: c.email } });

    const id = list.body.data.reports[0].id;
    const resolved = await request(app()).patch(`${API}/admin/reports/${id}`).set(auth(a)).send({ status: 'dismissed', resolutionNote: 'Not misleading' });
    expect(resolved.body.data.report.status).toBe('dismissed');
    expect((await request(app()).get(`${API}/admin/reports?status=pending`).set(auth(a))).body.meta.total).toBe(0);
    const logs = await request(app()).get(`${API}/admin/audit-logs?action=report.resolve`).set(auth(a));
    expect(logs.body.data.logs).toHaveLength(1);
  });
});

describe('stats', () => {
  it('platform, recruiter and candidate stats reflect real data', async () => {
    const a = await admin();
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    await request(app()).post(`${API}/jobs/${job.id}/save`).set(auth(c));
    const created = await apply(c, job.id);
    await request(app()).patch(`${API}/applications/${created.body.data.application.id}/status`).set(auth(r)).send({ status: 'shortlisted' });

    const platform = await request(app()).get(`${API}/admin/stats`).set(auth(a));
    expect(platform.body.data.users.byRole).toEqual({ admin: 1, recruiter: 1, candidate: 1 });
    expect(platform.body.data.jobs.byStatus).toEqual({ open: 1 });
    expect(platform.body.data.applications.byStatus).toEqual({ shortlisted: 1 });
    expect(platform.body.data.timeseries.applications).toHaveLength(1);
    expect(platform.body.data.topSkills[0]).toMatchObject({ count: 1 });

    const rec = await request(app()).get(`${API}/stats/recruiter`).set(auth(r));
    expect(rec.body.data.applications.byStatus.shortlisted).toBe(1);
    expect(rec.body.data.topJobs[0].id).toBe(job.id);

    const cand = await request(app()).get(`${API}/stats/candidate`).set(auth(c));
    expect(cand.body.data).toMatchObject({ savedJobs: 1, applications: { total: 1 }, profile: { hasResume: true } });
    expect(cand.body.data.recentApplications[0].job.id).toBe(job.id);
  });
});

describe('self-service account deletion', () => {
  it('requires password + confirmation, withdraws active applications, blocks login', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    await apply(c, job.id);

    const wrong = await request(app()).delete(`${API}/users/me`).set(auth(c)).send({ password: 'nope', confirmation: 'DELETE' });
    expect(wrong.status).toBe(400);
    const noConfirm = await request(app()).delete(`${API}/users/me`).set(auth(c)).send({ password: c.password, confirmation: 'yes' });
    expect(noConfirm.status).toBe(400);

    const ok = await request(app()).delete(`${API}/users/me`).set(auth(c)).send({ password: c.password, confirmation: 'DELETE' });
    expect(ok.status).toBe(200);
    expect((await Application.findOne({ candidate: c.userId }))?.status).toBe('withdrawn');
    expect((await login(c.email, c.password)).status).toBe(401);
    expect((await request(app()).get(`${API}/auth/me`).set(auth(c))).body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
