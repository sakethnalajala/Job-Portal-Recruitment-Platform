import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Application } from '../src/models/Application';
import { Job } from '../src/models/Job';
import { Notification } from '../src/models/Notification';
import { API, getApp } from './helpers';
import { apply, auth, candidate, postJob, recruiter, uploadResume } from './factories';

const app = () => getApp();
const settle = () => new Promise((r) => setTimeout(r, 120));

const questions = [
  { question: 'What is your notice period?', type: 'select', options: ['Immediate', '30 days', '60 days'], required: true },
  { question: 'Are you open to relocating to Bengaluru?', type: 'boolean', required: true },
  { question: 'Tell us about a system you scaled', type: 'textarea', required: false },
];

describe('applying', () => {
  it('applies with the active resume; increments applicationCount; notifies both parties', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);

    const res = await apply(c, job.id, { coverLetter: 'I would love to join.' });
    expect(res.status).toBe(201);
    expect(res.body.data.application).toMatchObject({
      status: 'applied',
      statusLabel: 'Applied',
      coverLetter: 'I would love to join.',
      canWithdraw: true,
      job: { id: job.id },
    });
    expect(res.body.data.application.resume.id).toBeTruthy();
    expect(res.body.data.application).not.toHaveProperty('recruiterNotes');

    expect((await Job.findById(job.id))?.applicationCount).toBe(1);
    await settle();
    expect(await Notification.countDocuments({ user: c.userId, type: 'application_submitted' })).toBe(1);
    expect(await Notification.countDocuments({ user: r.userId, type: 'new_applicant' })).toBe(1);
  });

  it('applies with an uploaded PDF (multipart) and JSON answers', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r, { customQuestions: questions });
    const [q1, q2] = job.customQuestions;

    const res = await apply(
      c,
      job.id,
      { coverLetter: 'Hi', answers: JSON.stringify([{ questionId: q1!.id, answer: '30 days' }, { questionId: q2!.id, answer: 'yes' }]) },
      true,
    );
    expect(res.status).toBe(201);
    expect(res.body.data.application.answers).toEqual([
      { questionId: q1!.id, question: q1!.question, answer: '30 days' },
      { questionId: q2!.id, question: q2!.question, answer: 'yes' },
    ]);
  });

  it('validates custom question answers', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r, { customQuestions: questions });
    const [q1, q2] = job.customQuestions;
    await uploadResume(c);

    const missing = await apply(c, job.id, {});
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.map((d: { field: string }) => d.field)).toEqual([`answers.${q1!.id}`, `answers.${q2!.id}`]);

    const badOption = await apply(c, job.id, { answers: JSON.stringify([{ questionId: q1!.id, answer: '90 days' }, { questionId: q2!.id, answer: 'maybe' }]) });
    expect(badOption.status).toBe(400);
    expect(badOption.body.error.details).toHaveLength(2);

    const badJson = await apply(c, job.id, { answers: '{not json' });
    expect(badJson.status).toBe(400);
  });

  it('enforces: verified email, resume required, no duplicates, not closed/expired/draft', async () => {
    const r = await recruiter();
    const job = await postJob(r);

    const unverified = await candidate({ verified: false });
    const v = await apply(unverified, job.id);
    expect(v.status).toBe(403);
    expect(v.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const c = await candidate();
    const noResume = await apply(c, job.id);
    expect(noResume.body.error.code).toBe('RESUME_REQUIRED');

    await uploadResume(c);
    expect((await apply(c, job.id)).status).toBe(201);
    const dup = await apply(c, job.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_APPLIED');

    await request(app()).patch(`${API}/jobs/${job.id}/status`).set(auth(r)).send({ status: 'closed' });
    const c2 = await candidate();
    await uploadResume(c2);
    expect((await apply(c2, job.id)).body.error.code).toBe('JOB_NOT_ACCEPTING');

    const expired = await postJob(r, { deadline: new Date(Date.now() + 60_000).toISOString() });
    await Job.updateOne({ _id: expired.id }, { deadline: new Date(Date.now() - 1000) });
    expect((await apply(c2, expired.id)).body.error.code).toBe('JOB_NOT_ACCEPTING');

    const draft = await postJob(r, { status: 'draft' });
    expect((await apply(c2, draft.id)).status).toBe(404);

    expect((await request(app()).post(`${API}/jobs/${job.id}/applications`).set(auth(r)).send({})).status).toBe(403);
  });

  it('cannot apply with someone else’s resume id', async () => {
    const r = await recruiter();
    const a = await candidate();
    const b = await candidate();
    const job = await postJob(r);
    const theirs = await uploadResume(a);
    const res = await apply(b, job.id, { resumeId: theirs.id });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESUME_NOT_FOUND');
  });
});

describe('candidate application views', () => {
  it('lists own applications with job cards and status filter', async () => {
    const r = await recruiter();
    const c = await candidate();
    const other = await candidate();
    await uploadResume(c);
    await uploadResume(other);
    const j1 = await postJob(r, { title: 'Role One' });
    const j2 = await postJob(r, { title: 'Role Two' });
    await apply(c, j1.id);
    await apply(c, j2.id);
    await apply(other, j1.id);

    const res = await request(app()).get(`${API}/applications/me`).set(auth(c));
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.applications[0].job.title).toBe('Role Two');

    const filtered = await request(app()).get(`${API}/applications/me?status=withdrawn`).set(auth(c));
    expect(filtered.body.meta.total).toBe(0);
  });

  it('withdraws only from active stages; recruiter is notified; count decrements', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    const created = await apply(c, job.id);
    const id = created.body.data.application.id;

    const res = await request(app()).patch(`${API}/applications/${id}/withdraw`).set(auth(c));
    expect(res.status).toBe(200);
    expect(res.body.data.application.status).toBe('withdrawn');
    expect((await Job.findById(job.id))?.applicationCount).toBe(0);
    await settle();
    expect(await Notification.countDocuments({ user: r.userId, type: 'application_withdrawn' })).toBe(1);

    const again = await request(app()).patch(`${API}/applications/${id}/withdraw`).set(auth(c));
    expect(again.body.error.code).toBe('NOT_WITHDRAWABLE');

    const stranger = await candidate();
    expect((await request(app()).patch(`${API}/applications/${id}/withdraw`).set(auth(stranger))).status).toBe(403);
  });
});

describe('recruiter pipeline', () => {
  async function setup() {
    const r = await recruiter();
    const c = await candidate({ name: 'Asha Verma' });
    const job = await postJob(r);
    await uploadResume(c);
    const created = await apply(c, job.id);
    return { r, c, job, appId: created.body.data.application.id as string };
  }

  it('lists applicants with candidate summaries and status counts; owner only', async () => {
    const { r, job } = await setup();
    const res = await request(app()).get(`${API}/jobs/${job.id}/applications`).set(auth(r));
    expect(res.status).toBe(200);
    expect(res.body.data.applicants[0].candidate.fullName).toBe('Asha Verma');
    expect(res.body.data.statusCounts).toEqual({ applied: 1 });
    expect(res.body.meta.total).toBe(1);

    const other = await recruiter();
    expect((await request(app()).get(`${API}/jobs/${job.id}/applications`).set(auth(other))).status).toBe(403);
  });

  it('recruiter detail view includes signed resume URL and private notes; candidate view does not', async () => {
    const { r, c, appId } = await setup();
    await request(app()).patch(`${API}/applications/${appId}/notes`).set(auth(r)).send({ recruiterNotes: 'Strong profile', rating: 4 });

    const rec = await request(app()).get(`${API}/applications/${appId}`).set(auth(r));
    expect(rec.body.data.application.resume.downloadUrl).toMatch(/^https:\/\/signed\.test\//);
    expect(rec.body.data.application).toMatchObject({ recruiterNotes: 'Strong profile', rating: 4, allowedTransitions: ['under_review', 'shortlisted', 'rejected'] });
    expect(rec.body.data.application.candidate.email).toBe(c.email);

    const cand = await request(app()).get(`${API}/applications/${appId}`).set(auth(c));
    expect(cand.body.data.application).not.toHaveProperty('recruiterNotes');
    expect(cand.body.data.application).not.toHaveProperty('rating');
    expect(cand.body.data.application.resume).not.toHaveProperty('downloadUrl');

    const stranger = await recruiter();
    expect((await request(app()).get(`${API}/applications/${appId}`).set(auth(stranger))).status).toBe(403);
  });

  it('walks the full workflow with history + notifications; blocks invalid transitions', async () => {
    const { r, c, appId } = await setup();
    const move = (body: Record<string, unknown>) => request(app()).patch(`${API}/applications/${appId}/status`).set(auth(r)).send(body);

    expect((await move({ status: 'selected' })).body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await move({ status: 'under_review' })).body.data.application.status).toBe('under_review');
    expect((await move({ status: 'shortlisted', note: 'Great portfolio' })).body.data.application.status).toBe('shortlisted');

    const noDetails = await move({ status: 'interview' });
    expect(noDetails.status).toBe(400);
    expect(noDetails.body.error.details[0].field).toBe('body.interview');

    const when = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const interview = await move({ status: 'interview', interview: { scheduledAt: when, mode: 'video', meetingLink: 'https://meet.example/abc', notes: 'Bring your laptop' } });
    expect(interview.status).toBe(200);
    expect(interview.body.data.application.interview).toMatchObject({ mode: 'video', meetingLink: 'https://meet.example/abc' });

    expect((await move({ status: 'selected' })).body.data.application.status).toBe('selected');
    expect((await move({ status: 'rejected' })).body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const stored = await Application.findById(appId).lean();
    expect(stored?.statusHistory.map((h) => h.status)).toEqual(['applied', 'under_review', 'shortlisted', 'interview', 'selected']);
    expect(stored?.statusHistory[2]?.note).toBe('Great portfolio');

    await settle();
    const notes = await Notification.find({ user: c.userId }).sort({ createdAt: 1 }).lean();
    expect(notes.map((n) => n.type)).toEqual([
      'application_submitted',
      'application_status',
      'application_status',
      'interview_scheduled',
      'application_status',
    ]);

    // Candidate cannot withdraw after a terminal state
    const withdraw = await request(app()).patch(`${API}/applications/${appId}/withdraw`).set(auth(c));
    expect(withdraw.body.error.code).toBe('NOT_WITHDRAWABLE');
  });

  it('only the owning recruiter can change status; candidates never can', async () => {
    const { c, appId } = await setup();
    const other = await recruiter();
    expect((await request(app()).patch(`${API}/applications/${appId}/status`).set(auth(other)).send({ status: 'rejected' })).status).toBe(403);
    expect((await request(app()).patch(`${API}/applications/${appId}/status`).set(auth(c)).send({ status: 'selected' })).status).toBe(403);
    expect((await Application.findById(appId))?.status).toBe('applied');
  });
});

describe('notifications API', () => {
  it('lists, counts, marks read (single + all), deletes; scoped per user', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    await apply(c, job.id);
    await settle();

    const list = await request(app()).get(`${API}/notifications`).set(auth(c));
    expect(list.status).toBe(200);
    expect(list.body.data.notifications).toHaveLength(1);
    expect(list.body.meta.unreadCount).toBe(1);
    const id = list.body.data.notifications[0].id;

    // Another user cannot mark it
    expect((await request(app()).patch(`${API}/notifications/${id}/read`).set(auth(r))).status).toBe(404);

    const read = await request(app()).patch(`${API}/notifications/${id}/read`).set(auth(c));
    expect(read.body.data.isRead).toBe(true);
    expect((await request(app()).get(`${API}/notifications/unread-count`).set(auth(c))).body.data.unreadCount).toBe(0);

    const recruiterAll = await request(app()).patch(`${API}/notifications/read-all`).set(auth(r));
    expect(recruiterAll.body.data.updated).toBe(1);

    expect((await request(app()).delete(`${API}/notifications/${id}`).set(auth(c))).status).toBe(204);
    expect((await request(app()).get(`${API}/notifications?unreadOnly=true`).set(auth(c))).body.meta.total).toBe(0);
  });
});

describe('recruiter cross-job applicants', () => {
  it('lists applications across all owned jobs with filters; other recruiters see nothing', async () => {
    const r = await recruiter();
    const other = await recruiter();
    const a = await candidate({ name: 'Priya Nair' });
    const b = await candidate({ name: 'Rahul Deshmukh' });
    const j1 = await postJob(r, { title: 'Role One' });
    const j2 = await postJob(r, { title: 'Role Two' });
    const j3 = await postJob(other, { title: 'Not mine' });
    await uploadResume(a);
    await uploadResume(b);
    await apply(a, j1.id);
    await apply(a, j2.id);
    await apply(b, j1.id);
    await apply(b, j3.id);

    const all = await request(app()).get(`${API}/applications/recruiter`).set(auth(r));
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data.statusCounts).toEqual({ applied: 3 });
    expect(all.body.data.applicants[0].job.title).toBeDefined();
    expect(all.body.data.applicants.every((x: { job: { id: string } }) => x.job.id !== j3.id)).toBe(true);

    const byJob = await request(app()).get(`${API}/applications/recruiter?job=${j2.id}`).set(auth(r));
    expect(byJob.body.meta.total).toBe(1);
    const byName = await request(app()).get(`${API}/applications/recruiter?q=rahul`).set(auth(r));
    expect(byName.body.meta.total).toBe(1);
    expect(byName.body.data.applicants[0].candidate.fullName).toBe('Rahul Deshmukh');

    expect((await request(app()).get(`${API}/applications/recruiter`).set(auth(a))).status).toBe(403);
    expect((await request(app()).get(`${API}/applications/recruiter`).set(auth(other))).body.meta.total).toBe(1);
  });
});
