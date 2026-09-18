import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Job } from '../src/models/Job';
import { Notification } from '../src/models/Notification';
import { API, getApp } from './helpers';
import { apply, auth, candidate, jobPayload, postJob, recruiter, uploadResume } from './factories';

const app = () => getApp();

describe('job creation & ownership', () => {
  it('creates an open job with company snapshot from the recruiter profile', async () => {
    const r = await recruiter({ company: 'Zyntra Labs' });
    const res = await request(app()).post(`${API}/jobs`).set(auth(r)).send(jobPayload());
    expect(res.status).toBe(201);
    expect(res.body.data.job).toMatchObject({
      companyName: 'Zyntra Labs',
      status: 'open',
      requiredSkills: ['node.js', 'typescript', 'mongodb'],
      isExpired: false,
      viewCount: 0,
    });
    expect(res.body.data.job.publishedAt).toBeTruthy();
  });

  it('unverified recruiters can draft but not publish', async () => {
    const r = await recruiter({ verified: false });
    const draft = await request(app()).post(`${API}/jobs`).set(auth(r)).send(jobPayload({ status: 'draft' }));
    expect(draft.status).toBe(201);
    const open = await request(app()).post(`${API}/jobs`).set(auth(r)).send(jobPayload());
    expect(open.status).toBe(403);
    expect(open.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    const publish = await request(app()).patch(`${API}/jobs/${draft.body.data.job.id}/status`).set(auth(r)).send({ status: 'open' });
    expect(publish.status).toBe(403);
  });

  it('validates job fields (salary range, deadline in future, select options)', async () => {
    const r = await recruiter();
    const res = await request(app())
      .post(`${API}/jobs`)
      .set(auth(r))
      .send(
        jobPayload({
          salary: { min: 200, max: 100 },
          deadline: '2000-01-01',
          customQuestions: [{ question: 'Notice period?', type: 'select', options: ['only-one'] }],
        }),
      );
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.salary.max', 'body.deadline', 'body.customQuestions.0.options']));
  });

  it('candidates cannot create jobs; non-owners cannot edit or delete', async () => {
    const c = await candidate();
    expect((await request(app()).post(`${API}/jobs`).set(auth(c)).send(jobPayload())).status).toBe(403);

    const owner = await recruiter();
    const intruder = await recruiter();
    const job = await postJob(owner);
    const edit = await request(app()).patch(`${API}/jobs/${job.id}`).set(auth(intruder)).send({ title: 'Hijacked' });
    expect(edit.status).toBe(403);
    expect((await request(app()).delete(`${API}/jobs/${job.id}`).set(auth(intruder))).status).toBe(403);
    expect((await request(app()).patch(`${API}/jobs/${job.id}/status`).set(auth(intruder)).send({ status: 'closed' })).status).toBe(403);
  });

  it('owner can edit; strict schema rejects protected fields', async () => {
    const r = await recruiter();
    const job = await postJob(r);
    const ok = await request(app()).patch(`${API}/jobs/${job.id}`).set(auth(r)).send({ title: 'Staff Backend Engineer', deadline: null });
    expect(ok.status).toBe(200);
    expect(ok.body.data.job.title).toBe('Staff Backend Engineer');
    const bad = await request(app()).patch(`${API}/jobs/${job.id}`).set(auth(r)).send({ applicationCount: 999 });
    expect(bad.status).toBe(400);
  });
});

describe('job lifecycle', () => {
  it('enforces draft → open → paused/closed → open transitions', async () => {
    const r = await recruiter();
    const draft = await postJob(r, { status: 'draft' });
    const set = (status: string) => request(app()).patch(`${API}/jobs/${draft.id}/status`).set(auth(r)).send({ status });

    expect((await set('closed')).body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await set('open')).body.data.job.status).toBe('open');
    expect((await set('paused')).body.data.job.status).toBe('paused');
    expect((await set('open')).body.data.job.status).toBe('open');
    expect((await set('closed')).body.data.job.status).toBe('closed');
    expect((await set('paused')).status).toBe(400);
    expect((await set('open')).body.data.job.status).toBe('open');
  });

  it('closing notifies candidates with active applications', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await uploadResume(c);
    await apply(c, job.id);
    await request(app()).patch(`${API}/jobs/${job.id}/status`).set(auth(r)).send({ status: 'closed' });
    await new Promise((res) => setTimeout(res, 100));
    expect(await Notification.countDocuments({ user: c.userId, type: 'job_closed' })).toBe(1);
  });

  it('cannot reopen an expired job', async () => {
    const r = await recruiter();
    const job = await postJob(r, { deadline: new Date(Date.now() + 60_000).toISOString() });
    await Job.updateOne({ _id: job.id }, { deadline: new Date(Date.now() - 1000), status: 'closed' });
    const res = await request(app()).patch(`${API}/jobs/${job.id}/status`).set(auth(r)).send({ status: 'open' });
    expect(res.body.error.code).toBe('JOB_EXPIRED');
  });

  it('delete: drafts and jobs without applications delete; jobs with applications must be closed', async () => {
    const r = await recruiter();
    const c = await candidate();
    const empty = await postJob(r);
    expect((await request(app()).delete(`${API}/jobs/${empty.id}`).set(auth(r))).status).toBe(204);

    const withApps = await postJob(r);
    await uploadResume(c);
    await apply(c, withApps.id);
    const res = await request(app()).delete(`${API}/jobs/${withApps.id}`).set(auth(r));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_HAS_APPLICATIONS');
  });
});

describe('job visibility', () => {
  it('drafts/paused are 404 to the public but visible to the owner; closed is visible', async () => {
    const r = await recruiter();
    const draft = await postJob(r, { status: 'draft' });
    expect((await request(app()).get(`${API}/jobs/${draft.id}`)).status).toBe(404);
    expect((await request(app()).get(`${API}/jobs/${draft.id}`).set(auth(r))).status).toBe(200);

    const closed = await postJob(r);
    await request(app()).patch(`${API}/jobs/${closed.id}/status`).set(auth(r)).send({ status: 'closed' });
    const res = await request(app()).get(`${API}/jobs/${closed.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('closed');
    expect(res.body.data.company).toBeTruthy();
  });

  it('public views increment viewCount; owner views do not; hasApplied/isSaved for candidates', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    await request(app()).get(`${API}/jobs/${job.id}`);
    await request(app()).get(`${API}/jobs/${job.id}`).set(auth(r));
    await new Promise((res) => setTimeout(res, 50));
    expect((await Job.findById(job.id))?.viewCount).toBe(1);

    await request(app()).post(`${API}/jobs/${job.id}/save`).set(auth(c));
    const view = await request(app()).get(`${API}/jobs/${job.id}`).set(auth(c));
    expect(view.body.data.job).toMatchObject({ isSaved: true });
    expect(view.body.data.job.hasApplied).toBeUndefined();
  });

  it('hides salary when not visible (except to owner)', async () => {
    const r = await recruiter();
    const job = await postJob(r, { salary: { min: 100, max: 200, isVisible: false } });
    const pub = await request(app()).get(`${API}/jobs/${job.id}`);
    expect(pub.body.data.job.salary).toEqual({ isVisible: false, currency: 'INR', period: 'year' });
    const own = await request(app()).get(`${API}/jobs/${job.id}`).set(auth(r));
    expect(own.body.data.job.salary.max).toBe(200);
  });
});

describe('job search', () => {
  async function seed() {
    const r1 = await recruiter({ company: 'Zyntra Labs' });
    const r2 = await recruiter({ company: 'Meridian Fintech' });
    await postJob(r1, { title: 'React Frontend Developer', requiredSkills: ['react', 'javascript'], location: { city: 'Pune', country: 'India' }, workType: 'remote', employmentType: 'full-time', experienceLevel: 'mid', salary: { min: 900000, max: 1500000 } });
    await postJob(r1, { title: 'Data Engineer', requiredSkills: ['python', 'spark', 'sql'], location: { city: 'Bengaluru', country: 'India' }, workType: 'onsite', employmentType: 'full-time', experienceLevel: 'senior', salary: { min: 2000000, max: 3000000 } });
    await postJob(r2, { title: 'Backend Intern', requiredSkills: ['node.js'], location: { city: 'Mumbai', country: 'India' }, workType: 'hybrid', employmentType: 'internship', experienceLevel: 'entry', salary: { min: 300000, max: 400000 } });
    await postJob(r2, { title: 'Old Node.js role', requiredSkills: ['node.js'], status: 'draft' });
    const expired = await postJob(r2, { title: 'Expired DevOps role', requiredSkills: ['aws'], deadline: new Date(Date.now() + 60_000).toISOString() });
    await Job.updateOne({ _id: expired.id }, { deadline: new Date(Date.now() - 1000) });
    return { r1, r2 };
  }

  it('lists only open, non-expired jobs by default with pagination meta', async () => {
    await seed();
    const res = await request(app()).get(`${API}/jobs?limit=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    const withExpired = await request(app()).get(`${API}/jobs?includeExpired=true`);
    expect(withExpired.body.meta.total).toBe(4);
  });

  it('keyword search hits title, skills and company', async () => {
    await seed();
    const byTitle = await request(app()).get(`${API}/jobs?q=react`);
    expect(byTitle.body.data.jobs.map((j: { title: string }) => j.title)).toEqual(['React Frontend Developer']);
    const bySkill = await request(app()).get(`${API}/jobs?q=spark`);
    expect(bySkill.body.data.jobs[0].title).toBe('Data Engineer');
    const byCompany = await request(app()).get(`${API}/jobs?q=meridian`);
    expect(byCompany.body.data.jobs.map((j: { title: string }) => j.title)).toEqual(['Backend Intern']);
  });

  it('combines filters: location, workType, employmentType, skills, salary, experience', async () => {
    await seed();
    const titles = async (qs: string) =>
      (await request(app()).get(`${API}/jobs?${qs}`)).body.data.jobs.map((j: { title: string }) => j.title);

    expect(await titles('location=pune')).toEqual(['React Frontend Developer']);
    expect(await titles('workType=remote,hybrid')).toHaveLength(2);
    expect(await titles('employmentType=internship')).toEqual(['Backend Intern']);
    expect(await titles('skills=python,react')).toHaveLength(2);
    expect(await titles('salaryMin=1800000')).toEqual(['Data Engineer']);
    expect(await titles('salaryMax=500000')).toEqual(['Backend Intern']);
    expect(await titles('experienceLevel=entry,mid&sort=salary_desc')).toEqual(['React Frontend Developer', 'Backend Intern']);
    expect(await titles('company=zyntra&experienceLevel=senior')).toEqual(['Data Engineer']);
  });

  it('rejects invalid query values', async () => {
    const res = await request(app()).get(`${API}/jobs?workType=moon&limit=500`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recruiter /mine lists own jobs in every status', async () => {
    const { r1 } = await seed();
    const res = await request(app()).get(`${API}/jobs/mine`).set(auth(r1));
    expect(res.body.meta.total).toBe(2);
    const drafts = await request(app()).get(`${API}/jobs/mine?status=draft`).set(auth(r1));
    expect(drafts.body.meta.total).toBe(0);
  });
});

describe('saved jobs & recommendations', () => {
  it('save is idempotent, listed newest first, unsave removes', async () => {
    const r = await recruiter();
    const c = await candidate();
    const a = await postJob(r, { title: 'Job A' });
    const b = await postJob(r, { title: 'Job B' });
    await request(app()).post(`${API}/jobs/${a.id}/save`).set(auth(c));
    await request(app()).post(`${API}/jobs/${a.id}/save`).set(auth(c));
    await request(app()).post(`${API}/jobs/${b.id}/save`).set(auth(c));

    const list = await request(app()).get(`${API}/jobs/saved`).set(auth(c));
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data.jobs[0]).toMatchObject({ title: 'Job B', isSaved: true });

    await request(app()).delete(`${API}/jobs/${a.id}/save`).set(auth(c));
    expect((await request(app()).get(`${API}/jobs/saved`).set(auth(c))).body.meta.total).toBe(1);
  });

  it('recommends by skill overlap, location and level, excluding applied jobs', async () => {
    const r = await recruiter();
    const c = await candidate();
    await request(app()).patch(`${API}/candidates/me`).set(auth(c)).send({
      skills: ['react', 'typescript', 'node.js'],
      location: { city: 'Pune' },
      totalExperienceYears: 4,
    });
    const strong = await postJob(r, { title: 'Strong match', requiredSkills: ['react', 'typescript'], preferredSkills: ['node.js'], location: { city: 'Pune' }, experienceLevel: 'mid' });
    const weak = await postJob(r, { title: 'Weak match', requiredSkills: ['java'], preferredSkills: ['node.js'], location: { city: 'Delhi' } });
    await postJob(r, { title: 'No match', requiredSkills: ['golang'], location: { city: 'Chennai' }, workType: 'onsite' });
    const applied = await postJob(r, { title: 'Already applied', requiredSkills: ['react'] });
    await uploadResume(c);
    await apply(c, applied.id);

    const res = await request(app()).get(`${API}/jobs/recommended`).set(auth(c));
    expect(res.status).toBe(200);
    const titles = res.body.data.jobs.map((j: { title: string }) => j.title);
    expect(titles).toEqual(['Strong match', 'Weak match']);
    expect(res.body.data.jobs[0].matchedSkills).toEqual(['react', 'typescript', 'node.js']);
    expect(res.body.data.jobs[0].matchScore).toBeGreaterThan(res.body.data.jobs[1].matchScore);
    expect(res.body.data.basis).toEqual({ skills: ['react', 'typescript', 'node.js'], city: 'Pune', experienceLevel: 'mid' });
    void strong;
    void weak;
  });
});

describe('reporting a job', () => {
  it('candidates can report once per job', async () => {
    const r = await recruiter();
    const c = await candidate();
    const job = await postJob(r);
    const first = await request(app()).post(`${API}/jobs/${job.id}/report`).set(auth(c)).send({ reason: 'scam', details: 'Asks for a registration fee' });
    expect(first.status).toBe(201);
    const again = await request(app()).post(`${API}/jobs/${job.id}/report`).set(auth(c)).send({ reason: 'spam' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REPORTED');
    expect((await request(app()).post(`${API}/jobs/${job.id}/report`).set(auth(r)).send({ reason: 'spam' })).status).toBe(403);
  });
});
