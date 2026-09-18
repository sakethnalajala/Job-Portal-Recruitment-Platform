import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Application } from '../src/models/Application';
import { Interview } from '../src/models/Interview';
import { Notification } from '../src/models/Notification';
import { runReminderSweep } from '../src/modules/interviews/interview.service';
import { API, getApp, login } from './helpers';
import { apply, auth, candidate, postJob, recruiter, uploadResume, PNG } from './factories';

const app = () => getApp();
const settle = () => new Promise((r) => setTimeout(r, 120));
const inTwoDays = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

async function pipeline() {
  const r = await recruiter({ company: 'Zyntra Labs' });
  const c = await candidate({ name: 'Asha Verma' });
  const job = await postJob(r);
  await uploadResume(c);
  const created = await apply(c, job.id);
  return { r, c, job, appId: created.body.data.application.id as string };
}

describe('interview management', () => {
  it('schedules, moves the application to interview, notifies the candidate, mirrors onto the application', async () => {
    const { r, c, appId } = await pipeline();
    const res = await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'video', meetingLink: 'https://meet.example/abc', notes: 'Tech round' });
    expect(res.status).toBe(201);
    expect(res.body.data.interview).toMatchObject({ status: 'scheduled', round: 1, mode: 'video', isUpcoming: true, candidate: { fullName: 'Asha Verma' } });
    const appDoc = await Application.findById(appId).lean();
    expect(appDoc?.status).toBe('interview');
    expect(appDoc?.interview?.meetingLink).toBe('https://meet.example/abc');
    await settle();
    expect(await Notification.countDocuments({ user: c.userId, type: 'interview_scheduled' })).toBe(1);
    const mine = await request(app()).get(`${API}/interviews/me`).set(auth(c));
    expect(mine.body.data.interviews).toHaveLength(1);
    expect(mine.body.data.interviews[0]).not.toHaveProperty('feedback');
  });

  it('lists upcoming/past/all with summary; reschedule, remind, complete with feedback, cancel', async () => {
    const { r, c, appId } = await pipeline();
    const created = await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'phone' });
    const id = created.body.data.interview.id;

    const list = await request(app()).get(`${API}/interviews?range=upcoming`).set(auth(r));
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data.summary.upcoming).toBe(1);

    const newTime = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const moved = await request(app()).patch(`${API}/interviews/${id}`).set(auth(r)).send({ scheduledAt: newTime, reason: 'Panel unavailable' });
    expect(moved.body.data.interview.status).toBe('rescheduled');
    await settle();
    expect(await Notification.countDocuments({ user: c.userId, type: 'interview_scheduled' })).toBe(2);

    const remind = await request(app()).post(`${API}/interviews/${id}/remind`).set(auth(r));
    expect(remind.status).toBe(200);
    expect(remind.body.data.reminderSentAt).toBeTruthy();

    const done = await request(app()).patch(`${API}/interviews/${id}/status`).set(auth(r)).send({ status: 'completed', outcome: 'advance', feedback: 'Strong on system design' });
    expect(done.body.data.interview).toMatchObject({ status: 'completed', outcome: 'advance', feedback: 'Strong on system design' });
    expect((await Application.findById(appId).lean())?.interview).toBeUndefined();
    expect((await request(app()).patch(`${API}/interviews/${id}/status`).set(auth(r)).send({ status: 'cancelled' })).status).toBe(400);

    // second round + cancel
    const r2 = await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'onsite', location: 'Bengaluru office' });
    expect(r2.body.data.interview.round).toBe(2);
    const cancel = await request(app()).patch(`${API}/interviews/${r2.body.data.interview.id}/status`).set(auth(r)).send({ status: 'cancelled', reason: 'Position on hold' });
    expect(cancel.body.data.interview.cancelledReason).toBe('Position on hold');
    const history = await request(app()).get(`${API}/interviews/application/${appId}`).set(auth(r));
    expect(history.body.data.interviews).toHaveLength(2);
    const past = await request(app()).get(`${API}/interviews?range=all`).set(auth(r));
    expect(past.body.meta.total).toBe(2);
  });

  it('enforces ownership and refuses closed applications / past times', async () => {
    const { r, c, appId } = await pipeline();
    const other = await recruiter();
    expect((await request(app()).post(`${API}/interviews`).set(auth(other)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'video' })).status).toBe(403);
    expect((await request(app()).post(`${API}/interviews`).set(auth(c)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'video' })).status).toBe(403);
    expect((await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: '2020-01-01T10:00:00Z', mode: 'video' })).status).toBe(400);
    await request(app()).patch(`${API}/applications/${appId}/status`).set(auth(r)).send({ status: 'rejected' });
    const res = await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'video' });
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('reminder sweep sends 24h reminders once', async () => {
    const { r, c, appId } = await pipeline();
    const soon = new Date(Date.now() + 5 * 3_600_000).toISOString();
    await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: soon, mode: 'video' });
    await settle();
    const before = await Notification.countDocuments({ user: c.userId, type: 'interview_scheduled' });
    expect(await runReminderSweep()).toBe(1);
    await settle();
    expect(await Notification.countDocuments({ user: c.userId, type: 'interview_scheduled' })).toBe(before + 1);
    expect(await Notification.countDocuments({ user: r.userId, type: 'interview_scheduled' })).toBe(1);
    expect(await runReminderSweep()).toBe(0);
    expect((await Interview.findOne({ application: appId }))?.reminderSentAt).toBeInstanceOf(Date);
  });
});

describe('input hardening', () => {
  it('on-site interviews require a location (schedule and reschedule); unknown preference keys and duplicate invites are rejected', async () => {
    const { r, appId } = await pipeline();
    const noLoc = await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'onsite' });
    expect(noLoc.status).toBe(400);
    expect(noLoc.body.error.details.some((d: { field: string }) => d.field.endsWith('location'))).toBe(true);
    const ok = await request(app()).post(`${API}/interviews`).set(auth(r)).send({ applicationId: appId, scheduledAt: inTwoDays(), mode: 'video', meetingLink: 'https://meet.example/x' });
    expect(ok.status).toBe(201);
    const switched = await request(app()).patch(`${API}/interviews/${ok.body.data.interview.id}`).set(auth(r)).send({ mode: 'onsite' });
    expect(switched.status).toBe(400);
    const withLoc = await request(app()).patch(`${API}/interviews/${ok.body.data.interview.id}`).set(auth(r)).send({ mode: 'onsite', location: 'HQ, 4th floor' });
    expect(withLoc.status).toBe(200);
    expect(withLoc.body.data.interview.location).toBe('HQ, 4th floor');

    const badPref = await request(app()).patch(`${API}/notifications/preferences`).set(auth(r)).send({ email: { bogus: true } });
    expect(badPref.status).toBe(400);

    const first = await request(app()).post(`${API}/team`).set(auth(r)).send({ email: 'sourcer@example.com', role: 'viewer' });
    expect(first.status).toBe(201);
    const dup = await request(app()).post(`${API}/team`).set(auth(r)).send({ email: 'sourcer@example.com', role: 'admin' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_MEMBER');
    await request(app()).delete(`${API}/team/${first.body.data.member.id}`).set(auth(r)).expect(204);
    const again = await request(app()).post(`${API}/team`).set(auth(r)).send({ email: 'sourcer@example.com', role: 'recruiter' });
    expect(again.status).toBe(201);
    expect(again.body.data.member.role).toBe('recruiter');
  });
});

describe('talent pool', () => {
  it('saves applicants only, organises by category/tags, searches, updates notes, removes', async () => {
    const { r, c, appId } = await pipeline();
    const stranger = await candidate({ name: 'Nobody Applied' });
    const denied = await request(app()).post(`${API}/talent-pool`).set(auth(r)).send({ candidateId: stranger.userId });
    expect(denied.status).toBe(403);

    const saved = await request(app()).post(`${API}/talent-pool`).set(auth(r)).send({ candidateId: c.userId, category: 'Backend', tags: ['Node.js', 'senior'], notes: 'Great fit for platform team', rating: 5, sourceApplication: appId });
    expect(saved.status).toBe(201);
    expect(saved.body.data.entry).toMatchObject({ category: 'backend', tags: ['node.js', 'senior'], rating: 5, candidate: { fullName: 'Asha Verma' }, latestApplication: { id: appId } });
    expect((await request(app()).post(`${API}/talent-pool`).set(auth(r)).send({ candidateId: c.userId })).status).toBe(409);
    expect((await request(app()).get(`${API}/talent-pool/check/${c.userId}`).set(auth(r))).body.data.saved).toBe(true);

    const list = await request(app()).get(`${API}/talent-pool?category=backend`).set(auth(r));
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data.categories).toEqual([{ name: 'backend', count: 1 }]);
    expect((await request(app()).get(`${API}/talent-pool?q=asha`).set(auth(r))).body.meta.total).toBe(1);
    expect((await request(app()).get(`${API}/talent-pool?q=zzz`).set(auth(r))).body.meta.total).toBe(0);
    expect((await request(app()).get(`${API}/talent-pool?tag=senior`).set(auth(r))).body.meta.total).toBe(1);

    const id = saved.body.data.entry.id;
    const upd = await request(app()).patch(`${API}/talent-pool/${id}`).set(auth(r)).send({ category: 'leadership', notes: 'Consider for lead role', rating: null });
    expect(upd.body.data.entry).toMatchObject({ category: 'leadership', notes: 'Consider for lead role', rating: null });
    const other = await recruiter();
    expect((await request(app()).get(`${API}/talent-pool`).set(auth(other))).body.meta.total).toBe(0);
    expect((await request(app()).delete(`${API}/talent-pool/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app()).delete(`${API}/talent-pool/${id}`).set(auth(r))).status).toBe(204);
    expect((await request(app()).get(`${API}/talent-pool/check/${c.userId}`).set(auth(r))).body.data.saved).toBe(false);
  });
});

describe('company & team', () => {
  it('owner invites members; existing recruiters link immediately; roles gate access to the owner’s jobs', async () => {
    const { r: owner, job, appId } = await pipeline();
    const teammate = await recruiter({ name: 'Priya Nair' });
    const viewer = await recruiter({ name: 'Vik Viewer' });

    const inv = await request(app()).post(`${API}/team`).set(auth(owner)).send({ email: teammate.email, role: 'recruiter', name: 'Priya Nair', title: 'Talent partner' });
    expect(inv.status).toBe(201);
    expect(inv.body.data.member).toMatchObject({ status: 'active', linked: true, role: 'recruiter' });
    const pending = await request(app()).post(`${API}/team`).set(auth(owner)).send({ email: 'future.hire@example.com', role: 'admin' });
    expect(pending.body.data.member).toMatchObject({ status: 'invited', linked: false });
    await request(app()).post(`${API}/team`).set(auth(owner)).send({ email: viewer.email, role: 'viewer' });
    expect((await request(app()).post(`${API}/team`).set(auth(owner)).send({ email: owner.email })).status).toBe(400);

    const team = await request(app()).get(`${API}/team`).set(auth(owner));
    expect(team.body.data.members).toHaveLength(3);
    expect(team.body.data.yourRole).toBe('owner');

    // teammate (recruiter role) can see owner's jobs/applicants and change stages, but cannot edit the job
    const mine = await request(app()).get(`${API}/jobs/mine`).set(auth(teammate));
    expect(mine.body.data.jobs.map((j: { id: string }) => j.id)).toContain(job.id);
    expect((await request(app()).get(`${API}/jobs/${job.id}/applications`).set(auth(teammate))).status).toBe(200);
    expect((await request(app()).patch(`${API}/applications/${appId}/status`).set(auth(teammate)).send({ status: 'under_review' })).status).toBe(200);
    const edit = await request(app()).patch(`${API}/jobs/${job.id}`).set(auth(teammate)).send({ title: 'Renamed by teammate' });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe('TEAM_SCOPE');

    // viewer: read-only
    expect((await request(app()).get(`${API}/applications/${appId}`).set(auth(viewer))).status).toBe(200);
    expect((await request(app()).patch(`${API}/applications/${appId}/status`).set(auth(viewer)).send({ status: 'shortlisted' })).status).toBe(403);

    // promote teammate to admin → can edit jobs and manage the team
    const memberId = inv.body.data.member.id;
    await request(app()).patch(`${API}/team/${memberId}`).set(auth(owner)).send({ role: 'admin' });
    expect((await request(app()).patch(`${API}/jobs/${job.id}`).set(auth(teammate)).send({ title: 'Renamed by admin teammate' })).status).toBe(200);

    // pending invitation activates on signup with that email
    const signup = await request(app()).post(`${API}/auth/register/recruiter`).send({ fullName: 'Future Hire', email: 'future.hire@example.com', password: 'Passw0rd123', companyName: 'Zyntra Labs' });
    expect(signup.status).toBe(201);
    await settle();
    const after = await request(app()).get(`${API}/team`).set(auth(owner));
    expect(after.body.data.members.find((m: { email: string }) => m.email === 'future.hire@example.com')).toMatchObject({ status: 'active', linked: true });

    // remove
    expect((await request(app()).delete(`${API}/team/${memberId}`).set(auth(owner))).status).toBe(204);
    expect((await request(app()).get(`${API}/jobs/mine`).set(auth(teammate))).body.data.jobs).toHaveLength(0);

    const activity = await request(app()).get(`${API}/team/activity`).set(auth(owner));
    expect(activity.status).toBe(200);
    expect(activity.body.data.events.length).toBeGreaterThan(0);
  });
});

describe('notification preferences & unread', () => {
  it('opting out of a category suppresses in-app notifications; mark unread works', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    const prefs = await request(app()).patch(`${API}/notifications/preferences`).set(auth(r)).send({ inApp: { newApplicants: false } });
    expect(prefs.body.data.preferences.inApp.newApplicants).toBe(false);
    expect(prefs.body.data.preferences.email.applicationUpdates).toBe(true);
    await apply(c, job.id);
    await settle();
    expect(await Notification.countDocuments({ user: r.userId, type: 'new_applicant' })).toBe(0);
    const n = await Notification.findOne({ user: c.userId });
    await request(app()).patch(`${API}/notifications/${n!._id}/read`).set(auth(c));
    const unread = await request(app()).patch(`${API}/notifications/${n!._id}/unread`).set(auth(c));
    expect(unread.body.data.isRead).toBe(false);
    expect((await request(app()).get(`${API}/notifications/preferences`).set(auth(c))).status).toBe(200);
  });
});

describe('recruiter profile photo & analytics', () => {
  it('uploads a personal photo and exposes range-filtered analytics', async () => {
    const { r, appId } = await pipeline();
    const photo = await request(app()).post(`${API}/recruiters/me/photo`).set(auth(r)).attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(photo.status).toBe(200);
    expect(photo.body.data.photoUrl).toMatch(/^https:\/\/img\.test\//);
    expect((await request(app()).get(`${API}/recruiters/me`).set(auth(r))).body.data.profile.photoUrl).toMatch(/img\.test/);
    expect((await login(r.email, r.password)).body.data.user.profile.photoUrl).toMatch(/img\.test/);

    await request(app()).patch(`${API}/applications/${appId}/status`).set(auth(r)).send({ status: 'shortlisted' });
    const a = await request(app()).get(`${API}/stats/recruiter/analytics?days=7`).set(auth(r));
    expect(a.status).toBe(200);
    expect(a.body.data.totals).toMatchObject({ jobs: 1, openJobs: 1, applications: 1, applicationsInRange: 1 });
    expect(a.body.data.funnel.allTime).toMatchObject({ applications: 1, shortlisted: 1, shortlistRate: 100 });
    expect(a.body.data.jobs[0]).toMatchObject({ applications: 1, shortlisted: 1 });
    expect(a.body.data.trends.applications).toHaveLength(1);
    expect((await request(app()).get(`${API}/stats/recruiter/analytics?days=2`).set(auth(r))).status).toBe(400);
  });
});
