import request from 'supertest';
import { User } from '../src/models/User';
import { API, getApp } from './helpers';

let seq = 0;
const next = () => ++seq;

export interface Session {
  token: string;
  userId: string;
  email: string;
  password: string;
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

export async function candidate(opts: { verified?: boolean; name?: string } = {}): Promise<Session> {
  const n = next();
  const email = `cand${n}@example.com`;
  const password = 'Passw0rd123';
  const res = await request(getApp())
    .post(`${API}/auth/register/candidate`)
    .send({ fullName: opts.name ?? `Candidate ${n}`, email, password });
  if (res.status !== 201) throw new Error(`candidate factory failed: ${JSON.stringify(res.body)}`);
  if (opts.verified !== false) await User.updateOne({ email }, { isEmailVerified: true });
  // Re-login so the token reflects the verified flag (authenticate re-reads the user anyway).
  return { token: res.body.data.accessToken, userId: res.body.data.user.id, email, password };
}

export async function recruiter(opts: { verified?: boolean; company?: string; name?: string } = {}): Promise<Session> {
  const n = next();
  const email = `rec${n}@example.com`;
  const password = 'Passw0rd123';
  const res = await request(getApp())
    .post(`${API}/auth/register/recruiter`)
    .send({ fullName: opts.name ?? `Recruiter ${n}`, email, password, companyName: opts.company ?? `Company ${n}` });
  if (res.status !== 201) throw new Error(`recruiter factory failed: ${JSON.stringify(res.body)}`);
  if (opts.verified !== false) await User.updateOne({ email }, { isEmailVerified: true });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id, email, password };
}

export async function admin(): Promise<Session> {
  const email = `admin${next()}@example.com`;
  const password = 'AdminPassw0rd1';
  await User.create({ email, passwordHash: await User.hashPassword(password), role: 'admin', isEmailVerified: true });
  const res = await request(getApp()).post(`${API}/auth/login`).send({ email, password });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id, email, password };
}

export const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

export const jobPayload = (overrides: Record<string, unknown> = {}) => ({
  title: 'Senior Backend Engineer',
  description:
    'We are looking for a backend engineer with strong Node.js experience to build scalable APIs for our fintech platform in Bengaluru.',
  responsibilities: ['Design REST APIs', 'Own service reliability'],
  requiredSkills: ['Node.js', 'TypeScript', 'MongoDB'],
  preferredSkills: ['AWS', 'Docker'],
  location: { city: 'Bengaluru', country: 'India' },
  workType: 'hybrid',
  employmentType: 'full-time',
  salary: { min: 1800000, max: 2800000, currency: 'INR', period: 'year' },
  experienceLevel: 'senior',
  experienceYears: { min: 5, max: 9 },
  benefits: ['Health insurance', 'ESOPs'],
  status: 'open',
  ...overrides,
});

export async function postJob(rec: Session, overrides: Record<string, unknown> = {}) {
  const res = await request(getApp()).post(`${API}/jobs`).set(auth(rec)).send(jobPayload(overrides));
  if (res.status !== 201) throw new Error(`postJob failed: ${JSON.stringify(res.body)}`);
  return res.body.data.job as { id: string; customQuestions: { id: string; question: string; type: string }[] };
}

export async function uploadResume(cand: Session) {
  const res = await request(getApp())
    .post(`${API}/candidates/me/resumes`)
    .set(auth(cand))
    .attach('resume', PDF, { filename: 'resume.pdf', contentType: 'application/pdf' });
  if (res.status !== 201) throw new Error(`uploadResume failed: ${JSON.stringify(res.body)}`);
  return res.body.data.resume as { id: string };
}

export async function apply(cand: Session, jobId: string, fields: Record<string, string> = {}, withFile = false) {
  let req = request(getApp()).post(`${API}/jobs/${jobId}/applications`).set(auth(cand));
  if (withFile) {
    req = req.attach('resume', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' });
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  }
  return req.send(fields);
}
