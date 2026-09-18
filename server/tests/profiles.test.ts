import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Resume } from '../src/models/Resume';
import { Job } from '../src/models/Job';
import { API, getApp } from './helpers';
import { PDF, PNG, admin, apply, auth, candidate, postJob, recruiter, uploadResume } from './factories';

const app = () => getApp();

describe('candidate profile', () => {
  it('returns own profile with email and completion', async () => {
    const c = await candidate();
    const res = await request(app()).get(`${API}/candidates/me`).set(auth(c));
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ email: c.email, completion: expect.any(Number), skills: [] });
    expect(res.body.data.profile).not.toHaveProperty('photoPublicId');
  });

  it('updates profile, normalises skills, recomputes completion', async () => {
    const c = await candidate();
    const res = await request(app())
      .patch(`${API}/candidates/me`)
      .set(auth(c))
      .send({
        headline: 'Full-stack developer',
        bio: 'Five years building React and Node.js products for Indian fintech startups, with a focus on reliability.',
        phone: '+91 98765 43210',
        location: { city: 'Pune', country: 'India' },
        skills: ['React', 'node.js', 'REACT', 'MongoDB'],
        education: [{ institution: 'IIT Bombay', degree: 'B.Tech', field: 'CSE', startDate: '2015-07-01', endDate: '2019-05-30' }],
        experience: [{ company: 'Razorpay', title: 'SDE II', startDate: '2019-07-01', current: true }],
        linkedinUrl: 'https://linkedin.com/in/example',
        totalExperienceYears: 5,
      });
    expect(res.status).toBe(200);
    const p = res.body.data.profile;
    expect(p.skills).toEqual(['react', 'node.js', 'mongodb']);
    expect(p.completion).toBeGreaterThanOrEqual(70);
  });

  it('rejects unknown fields and invalid dates', async () => {
    const c = await candidate();
    const res = await request(app())
      .patch(`${API}/candidates/me`)
      .set(auth(c))
      .send({ completion: 100, education: [{ institution: 'X', degree: 'Y', startDate: '2020-01-01', endDate: '2019-01-01' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recruiters cannot access candidate self endpoints', async () => {
    const r = await recruiter();
    const res = await request(app()).get(`${API}/candidates/me`).set(auth(r));
    expect(res.status).toBe(403);
  });

  it('uploads a profile photo (image magic bytes enforced)', async () => {
    const c = await candidate();
    const ok = await request(app())
      .post(`${API}/candidates/me/photo`)
      .set(auth(c))
      .attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.photoUrl).toMatch(/^https:\/\/img\.test\//);

    const spoof = await request(app())
      .post(`${API}/candidates/me/photo`)
      .set(auth(c))
      .attach('photo', PDF, { filename: 'me.png', contentType: 'image/png' });
    expect(spoof.status).toBe(400);
    expect(spoof.body.error.code).toBe('INVALID_FILE_TYPE');
  });
});

describe('resumes', () => {
  it('uploads, lists, activates and provides a signed download URL', async () => {
    const c = await candidate();
    const first = await uploadResume(c);
    const second = await uploadResume(c);

    const list = await request(app()).get(`${API}/candidates/me/resumes`).set(auth(c));
    expect(list.body.data.resumes).toHaveLength(2);
    expect(list.body.data.resumes.find((r: { id: string }) => r.id === second.id).isActive).toBe(true);

    const activate = await request(app()).patch(`${API}/candidates/me/resumes/${first.id}/activate`).set(auth(c));
    expect(activate.status).toBe(200);
    expect(activate.body.data.resumes.find((r: { id: string }) => r.id === first.id).isActive).toBe(true);

    const dl = await request(app()).get(`${API}/candidates/me/resumes/${first.id}/download`).set(auth(c));
    expect(dl.status).toBe(200);
    expect(dl.body.data.resume.downloadUrl).toMatch(/^https:\/\/signed\.test\//);
  });

  it('rejects non-PDF uploads even with a PDF mimetype', async () => {
    const c = await candidate();
    const res = await request(app())
      .post(`${API}/candidates/me/resumes`)
      .set(auth(c))
      .attach('resume', Buffer.from('not a pdf at all'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('hard-deletes unreferenced resumes but soft-deletes ones used in applications', async () => {
    const c = await candidate();
    const r = await recruiter();
    const job = await postJob(r);
    const used = await uploadResume(c);
    const unused = await uploadResume(c);
    expect((await apply(c, job.id, { resumeId: used.id })).status).toBe(201);

    expect((await request(app()).delete(`${API}/candidates/me/resumes/${unused.id}`).set(auth(c))).status).toBe(204);
    expect(await Resume.findById(unused.id)).toBeNull();

    expect((await request(app()).delete(`${API}/candidates/me/resumes/${used.id}`).set(auth(c))).status).toBe(204);
    const kept = await Resume.findById(used.id);
    expect(kept?.deletedAt).toBeInstanceOf(Date);

    const list = await request(app()).get(`${API}/candidates/me/resumes`).set(auth(c));
    expect(list.body.data.resumes).toHaveLength(0);
  });

  it('cannot access another candidate resume', async () => {
    const a = await candidate();
    const b = await candidate();
    const mine = await uploadResume(a);
    const res = await request(app()).get(`${API}/candidates/me/resumes/${mine.id}/download`).set(auth(b));
    expect(res.status).toBe(404);
  });
});

describe('viewing a candidate', () => {
  it('recruiter may view only candidates who applied to their jobs; admin may view anyone', async () => {
    const c = await candidate();
    const owner = await recruiter();
    const other = await recruiter();
    const job = await postJob(owner);
    await uploadResume(c);
    expect((await apply(c, job.id)).status).toBe(201);

    expect((await request(app()).get(`${API}/candidates/${c.userId}`).set(auth(owner))).status).toBe(200);
    expect((await request(app()).get(`${API}/candidates/${c.userId}`).set(auth(other))).status).toBe(403);
    expect((await request(app()).get(`${API}/candidates/${c.userId}`).set(auth(c))).status).toBe(403);
    const adm = await admin();
    const viaAdmin = await request(app()).get(`${API}/candidates/${c.userId}`).set(auth(adm));
    expect(viaAdmin.status).toBe(200);
    expect(viaAdmin.body.data.profile.email).toBe(c.email);
  });
});

describe('recruiter profile', () => {
  it('reads and updates the company profile and syncs job snapshots', async () => {
    const r = await recruiter({ company: 'Old Name Pvt Ltd' });
    const job = await postJob(r);

    const res = await request(app())
      .patch(`${API}/recruiters/me`)
      .set(auth(r))
      .send({ companyName: 'Nimbus Analytics', industry: 'Data & AI', website: 'https://nimbus.example', companySize: '51-200', location: { city: 'Hyderabad', country: 'India' } });
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ companyName: 'Nimbus Analytics', openJobs: 1, isVerified: false, email: r.email });

    const stored = await Job.findById(job.id).lean();
    expect(stored?.companyName).toBe('Nimbus Analytics');
  });

  it('uploads a logo and exposes a public company card without contact info', async () => {
    const r = await recruiter();
    const logo = await request(app())
      .post(`${API}/recruiters/me/logo`)
      .set(auth(r))
      .attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(logo.status).toBe(200);

    const me = await request(app()).get(`${API}/recruiters/me`).set(auth(r));
    const card = await request(app()).get(`${API}/recruiters/${me.body.data.profile.id}`);
    expect(card.status).toBe(200);
    expect(card.body.data.company.logoUrl).toMatch(/^https:\/\/img\.test\//);
    expect(card.body.data.company).not.toHaveProperty('phone');
    expect(card.body.data.company).not.toHaveProperty('email');
  });

  it('candidates cannot edit recruiter profiles', async () => {
    const c = await candidate();
    const res = await request(app()).patch(`${API}/recruiters/me`).set(auth(c)).send({ companyName: 'Hack' });
    expect(res.status).toBe(403);
  });
});
