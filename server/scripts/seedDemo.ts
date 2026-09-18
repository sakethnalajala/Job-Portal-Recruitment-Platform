/**
 * Demo data for portfolio presentation — Indian tech job market.
 *
 *   npm run seed:demo            # (re)creates demo accounts, jobs, applications
 *   npm run seed:demo -- --wipe  # removes demo data only
 *
 * Idempotent: everything created here uses the `@demo.jobportal.in` email
 * domain and is deleted before re-seeding. Refuses to run in production unless
 * ALLOW_DEMO_SEED=true. All demo accounts use the password  Demo@1234
 */
import { Types } from 'mongoose';
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import {
  Application,
  AuditLog,
  CandidateProfile,
  Job,
  Notification,
  RecruiterProfile,
  RefreshToken,
  Report,
  Resume,
  SavedJob,
  User,
} from '../src/models';
import { storageService } from '../src/services/storage.service';
import type { ApplicationStatus } from '../src/utils/constants';

const DEMO_DOMAIN = 'demo.jobportal.in';
const DEMO_PASSWORD = 'Demo@1234';

const daysAgo = (d: number, hourJitter = true) =>
  new Date(Date.now() - d * 86_400_000 - (hourJitter ? Math.floor(Math.random() * 36_000_000) : 0));
const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]!;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ─── companies ─────────────────────────────────────────────────────────────

const COMPANIES = [
  { name: 'Zyntra Labs', hr: 'Rohan Mehta', city: 'Bengaluru', industry: 'SaaS', size: '201-500', verified: true, desc: 'Zyntra builds observability tooling used by 400+ engineering teams across India and Southeast Asia.' },
  { name: 'Meridian Fintech', hr: 'Priya Nair', city: 'Mumbai', industry: 'Financial Services', size: '501-1000', verified: true, desc: 'UPI-first payments infrastructure powering merchants from Kirana stores to enterprise retail.' },
  { name: 'Nimbus Analytics', hr: 'Arjun Reddy', city: 'Hyderabad', industry: 'Data & AI', size: '51-200', verified: true, desc: 'Applied ML consultancy delivering forecasting and NLP solutions for BFSI and logistics.' },
  { name: 'Kaveri Health Tech', hr: 'Divya Krishnan', city: 'Chennai', industry: 'Healthcare', size: '51-200', verified: false, desc: 'Digital health records and tele-consultation platform serving 1,200 clinics in Tamil Nadu and Kerala.' },
  { name: 'Saffron Commerce', hr: 'Karan Malhotra', city: 'Gurugram', industry: 'E-commerce', size: '1000+', verified: true, desc: 'D2C marketplace for Indian artisans with same-day delivery in 14 metros.' },
  { name: 'Indigo Cloud Systems', hr: 'Sneha Kulkarni', city: 'Pune', industry: 'Cloud Infrastructure', size: '201-500', verified: false, desc: 'Managed Kubernetes and DevOps services for mid-market enterprises.' },
  { name: 'Lumen EdTech', hr: 'Vikram Singh', city: 'Noida', industry: 'Education', size: '51-200', verified: true, desc: 'Vernacular upskilling platform with 2M learners across Hindi, Tamil and Telugu.' },
  { name: 'Arka Robotics', hr: 'Meera Iyer', city: 'Bengaluru', industry: 'Robotics', size: '11-50', verified: false, desc: 'Warehouse automation robots designed and manufactured in Peenya.' },
] as const;

// ─── jobs ──────────────────────────────────────────────────────────────────

type WorkType = 'remote' | 'hybrid' | 'onsite';
type EmpType = 'full-time' | 'part-time' | 'internship' | 'contract';
type Level = 'entry' | 'junior' | 'mid' | 'senior' | 'lead';

interface JobSeed {
  company: string;
  title: string;
  skills: string[];
  preferred?: string[];
  workType: WorkType;
  emp: EmpType;
  level: Level;
  years: [number, number];
  salary: [number, number];
  city?: string;
  status?: 'open' | 'paused' | 'closed' | 'draft';
  questions?: { question: string; type: 'text' | 'textarea' | 'boolean' | 'select'; options?: string[]; required?: boolean }[];
}

const JOBS: JobSeed[] = [
  { company: 'Zyntra Labs', title: 'Senior Backend Engineer (Node.js)', skills: ['node.js', 'typescript', 'mongodb', 'redis'], preferred: ['kubernetes', 'grpc'], workType: 'hybrid', emp: 'full-time', level: 'senior', years: [5, 9], salary: [2800000, 4200000], questions: [{ question: 'What is your notice period?', type: 'select', options: ['Immediate', '15 days', '30 days', '60+ days'] }, { question: 'Describe a production incident you led the response for.', type: 'textarea', required: false }] },
  { company: 'Zyntra Labs', title: 'Frontend Engineer (React)', skills: ['react', 'typescript', 'tailwind css'], preferred: ['vite', 'storybook'], workType: 'remote', emp: 'full-time', level: 'mid', years: [3, 6], salary: [1800000, 2600000] },
  { company: 'Zyntra Labs', title: 'Site Reliability Engineer', skills: ['kubernetes', 'aws', 'terraform', 'prometheus'], workType: 'hybrid', emp: 'full-time', level: 'senior', years: [4, 8], salary: [3000000, 4500000] },
  { company: 'Zyntra Labs', title: 'Engineering Intern — Platform', skills: ['javascript', 'git', 'linux'], workType: 'onsite', emp: 'internship', level: 'entry', years: [0, 1], salary: [40000, 60000], questions: [{ question: 'Are you available for a 6-month full-time internship?', type: 'boolean' }] },
  { company: 'Meridian Fintech', title: 'Java Backend Developer — Payments', skills: ['java', 'spring boot', 'postgresql', 'kafka'], preferred: ['upi', 'iso 8583'], workType: 'onsite', emp: 'full-time', level: 'mid', years: [3, 6], salary: [2000000, 3000000] },
  { company: 'Meridian Fintech', title: 'Staff Engineer — Ledger Systems', skills: ['java', 'distributed systems', 'postgresql'], preferred: ['go', 'event sourcing'], workType: 'hybrid', emp: 'full-time', level: 'lead', years: [9, 15], salary: [5500000, 8000000] },
  { company: 'Meridian Fintech', title: 'Android Developer', skills: ['kotlin', 'android', 'jetpack compose'], workType: 'hybrid', emp: 'full-time', level: 'mid', years: [3, 6], salary: [1800000, 2800000] },
  { company: 'Meridian Fintech', title: 'QA Automation Engineer', skills: ['selenium', 'java', 'testng', 'rest assured'], workType: 'onsite', emp: 'full-time', level: 'junior', years: [1, 3], salary: [900000, 1400000] },
  { company: 'Meridian Fintech', title: 'Risk Data Analyst', skills: ['sql', 'python', 'tableau'], workType: 'onsite', emp: 'full-time', level: 'junior', years: [1, 3], salary: [1000000, 1500000], status: 'closed' },
  { company: 'Nimbus Analytics', title: 'Machine Learning Engineer', skills: ['python', 'pytorch', 'mlops', 'sql'], preferred: ['aws sagemaker', 'llms'], workType: 'hybrid', emp: 'full-time', level: 'mid', years: [3, 6], salary: [2200000, 3400000], questions: [{ question: 'Link to a model you have shipped to production (GitHub/blog).', type: 'text', required: false }] },
  { company: 'Nimbus Analytics', title: 'Data Engineer (Spark)', skills: ['python', 'spark', 'airflow', 'sql'], preferred: ['databricks', 'delta lake'], workType: 'remote', emp: 'full-time', level: 'mid', years: [3, 7], salary: [2000000, 3200000] },
  { company: 'Nimbus Analytics', title: 'NLP Research Intern', skills: ['python', 'transformers', 'nlp'], workType: 'remote', emp: 'internship', level: 'entry', years: [0, 1], salary: [35000, 50000] },
  { company: 'Nimbus Analytics', title: 'Analytics Consultant (Contract)', skills: ['sql', 'power bi', 'excel'], workType: 'remote', emp: 'contract', level: 'mid', years: [3, 8], salary: [1500000, 2200000] },
  { company: 'Kaveri Health Tech', title: 'Full-Stack Developer (MERN)', skills: ['react', 'node.js', 'mongodb', 'express'], preferred: ['fhir', 'hl7'], workType: 'onsite', emp: 'full-time', level: 'junior', years: [1, 3], salary: [800000, 1300000], questions: [{ question: 'Have you worked with healthcare data standards (FHIR/HL7)?', type: 'boolean', required: false }] },
  { company: 'Kaveri Health Tech', title: 'Flutter Mobile Developer', skills: ['flutter', 'dart', 'firebase'], workType: 'hybrid', emp: 'full-time', level: 'mid', years: [2, 5], salary: [1200000, 1900000] },
  { company: 'Kaveri Health Tech', title: 'Product Designer (UI/UX)', skills: ['figma', 'ui design', 'user research'], workType: 'onsite', emp: 'full-time', level: 'mid', years: [3, 6], salary: [1400000, 2200000] },
  { company: 'Saffron Commerce', title: 'Go Backend Engineer — Order Management', skills: ['go', 'postgresql', 'grpc', 'kafka'], preferred: ['kubernetes'], workType: 'hybrid', emp: 'full-time', level: 'senior', years: [5, 9], salary: [3200000, 4800000] },
  { company: 'Saffron Commerce', title: 'React Native Developer', skills: ['react native', 'typescript', 'redux'], workType: 'remote', emp: 'full-time', level: 'mid', years: [3, 6], salary: [1800000, 2700000] },
  { company: 'Saffron Commerce', title: 'Search Engineer (Elasticsearch)', skills: ['elasticsearch', 'java', 'python'], workType: 'hybrid', emp: 'full-time', level: 'senior', years: [4, 8], salary: [3000000, 4200000] },
  { company: 'Saffron Commerce', title: 'Engineering Manager — Checkout', skills: ['people management', 'system design', 'java'], workType: 'onsite', emp: 'full-time', level: 'lead', years: [8, 14], salary: [5000000, 7000000], status: 'paused' },
  { company: 'Saffron Commerce', title: 'Customer Support Engineer (Part-time)', skills: ['sql', 'communication', 'zendesk'], workType: 'remote', emp: 'part-time', level: 'entry', years: [0, 2], salary: [300000, 450000] },
  { company: 'Indigo Cloud Systems', title: 'DevOps Engineer', skills: ['aws', 'docker', 'kubernetes', 'terraform', 'ci/cd'], workType: 'hybrid', emp: 'full-time', level: 'mid', years: [2, 5], salary: [1500000, 2400000] },
  { company: 'Indigo Cloud Systems', title: 'Cloud Security Engineer', skills: ['aws', 'security', 'iam', 'python'], workType: 'onsite', emp: 'full-time', level: 'senior', years: [5, 9], salary: [2800000, 4000000] },
  { company: 'Indigo Cloud Systems', title: 'Python Automation Developer', skills: ['python', 'ansible', 'linux', 'bash'], workType: 'remote', emp: 'contract', level: 'junior', years: [1, 4], salary: [900000, 1400000] },
  { company: 'Lumen EdTech', title: 'Full-Stack Engineer (Next.js)', skills: ['next.js', 'react', 'node.js', 'postgresql'], preferred: ['prisma', 'trpc'], workType: 'remote', emp: 'full-time', level: 'mid', years: [2, 5], salary: [1600000, 2400000] },
  { company: 'Lumen EdTech', title: 'Video Streaming Engineer', skills: ['node.js', 'ffmpeg', 'hls', 'aws'], workType: 'hybrid', emp: 'full-time', level: 'senior', years: [4, 8], salary: [2600000, 3800000] },
  { company: 'Lumen EdTech', title: 'Junior Frontend Developer', skills: ['html', 'css', 'javascript', 'react'], workType: 'onsite', emp: 'full-time', level: 'entry', years: [0, 2], salary: [500000, 800000], questions: [{ question: 'Share a link to your portfolio or GitHub.', type: 'text' }] },
  { company: 'Lumen EdTech', title: 'Content Platform Intern', skills: ['javascript', 'react'], workType: 'remote', emp: 'internship', level: 'entry', years: [0, 1], salary: [20000, 30000], status: 'draft' },
  { company: 'Arka Robotics', title: 'Embedded Software Engineer', skills: ['c++', 'ros', 'linux', 'embedded'], preferred: ['rust'], workType: 'onsite', emp: 'full-time', level: 'mid', years: [3, 6], salary: [1800000, 2800000] },
  { company: 'Arka Robotics', title: 'Computer Vision Engineer', skills: ['python', 'opencv', 'pytorch', 'c++'], workType: 'onsite', emp: 'full-time', level: 'senior', years: [4, 8], salary: [2800000, 4200000] },
  { company: 'Arka Robotics', title: 'Robotics Intern', skills: ['python', 'ros', 'c++'], workType: 'onsite', emp: 'internship', level: 'entry', years: [0, 1], salary: [25000, 40000] },
];

// ─── candidates ────────────────────────────────────────────────────────────

interface CandidateSeed {
  name: string;
  city: string;
  headline: string;
  years: number;
  skills: string[];
  bio: string;
  degree: string;
  college: string;
  gradYear: number;
  lastCompany: string;
  lastTitle: string;
  workTypes: WorkType[];
}

const CANDIDATES: CandidateSeed[] = [
  { name: 'Asha Verma', city: 'Bengaluru', headline: 'Backend Engineer · Node.js & TypeScript', years: 5, skills: ['node.js', 'typescript', 'mongodb', 'redis', 'docker', 'aws'], bio: 'Backend engineer with five years building payment and logistics APIs. Comfortable owning services end to end — from schema design to on-call.', degree: 'B.Tech Computer Science', college: 'NIT Surathkal', gradYear: 2019, lastCompany: 'Razorpay', lastTitle: 'SDE II', workTypes: ['hybrid', 'remote'] },
  { name: 'Rahul Deshmukh', city: 'Pune', headline: 'Frontend Developer · React', years: 3, skills: ['react', 'typescript', 'tailwind css', 'next.js', 'vite'], bio: 'Frontend developer focused on accessible, fast UIs. Built design systems used by three product teams.', degree: 'B.E. Information Technology', college: 'COEP Pune', gradYear: 2021, lastCompany: 'Persistent Systems', lastTitle: 'Software Engineer', workTypes: ['remote'] },
  { name: 'Sneha Pillai', city: 'Hyderabad', headline: 'Machine Learning Engineer', years: 4, skills: ['python', 'pytorch', 'mlops', 'sql', 'spark', 'airflow'], bio: 'ML engineer who has shipped demand-forecasting and document-classification models to production for logistics clients.', degree: 'M.Tech Data Science', college: 'IIIT Hyderabad', gradYear: 2020, lastCompany: 'Fractal Analytics', lastTitle: 'ML Engineer', workTypes: ['hybrid', 'remote'] },
  { name: 'Aditya Sharma', city: 'Gurugram', headline: 'Java Developer · Spring Boot', years: 4, skills: ['java', 'spring boot', 'postgresql', 'kafka', 'docker'], bio: 'Java backend developer with experience in high-throughput transaction processing and event-driven services.', degree: 'B.Tech CSE', college: 'DTU Delhi', gradYear: 2020, lastCompany: 'Paytm', lastTitle: 'Software Engineer', workTypes: ['onsite', 'hybrid'] },
  { name: 'Kavya Menon', city: 'Chennai', headline: 'Full-Stack Developer · MERN', years: 2, skills: ['react', 'node.js', 'mongodb', 'express', 'javascript'], bio: 'Full-stack developer who enjoys turning ambiguous product ideas into working features quickly.', degree: 'B.E. Computer Science', college: 'Anna University', gradYear: 2022, lastCompany: 'Freshworks', lastTitle: 'Associate Engineer', workTypes: ['onsite', 'hybrid'] },
  { name: 'Mohammed Faisal', city: 'Bengaluru', headline: 'DevOps / SRE', years: 6, skills: ['kubernetes', 'aws', 'terraform', 'docker', 'ci/cd', 'prometheus', 'linux'], bio: 'SRE with a track record of cutting cloud spend and MTTR. Ran infra for a 40-service platform on EKS.', degree: 'B.Tech ECE', college: 'RV College of Engineering', gradYear: 2018, lastCompany: 'Swiggy', lastTitle: 'Senior SRE', workTypes: ['hybrid'] },
  { name: 'Ananya Bose', city: 'Kolkata', headline: 'Data Engineer', years: 3, skills: ['python', 'spark', 'sql', 'airflow', 'aws'], bio: 'Data engineer building reliable pipelines on Spark and Airflow; strong on data modelling and cost-aware design.', degree: 'B.Tech IT', college: 'Jadavpur University', gradYear: 2021, lastCompany: 'Tredence', lastTitle: 'Data Engineer', workTypes: ['remote'] },
  { name: 'Vishal Patel', city: 'Ahmedabad', headline: 'Android Developer · Kotlin', years: 4, skills: ['kotlin', 'android', 'jetpack compose', 'firebase'], bio: 'Android developer with apps at 5M+ installs. Passionate about smooth animations and offline-first design.', degree: 'B.E. Computer Engineering', college: 'Nirma University', gradYear: 2020, lastCompany: 'Meesho', lastTitle: 'Android Engineer', workTypes: ['hybrid', 'remote'] },
  { name: 'Ritika Agarwal', city: 'Noida', headline: 'Fresher · Frontend enthusiast', years: 0, skills: ['html', 'css', 'javascript', 'react', 'git'], bio: 'Recent graduate with internship experience building React dashboards. Looking for a first full-time frontend role.', degree: 'B.Tech CSE', college: 'JIIT Noida', gradYear: 2025, lastCompany: 'Lumen EdTech (Intern)', lastTitle: 'Frontend Intern', workTypes: ['onsite', 'hybrid', 'remote'] },
  { name: 'Suresh Kumar', city: 'Bengaluru', headline: 'Embedded & Robotics Engineer', years: 5, skills: ['c++', 'ros', 'linux', 'embedded', 'python'], bio: 'Embedded engineer who has shipped firmware for AGVs and drones; comfortable across ROS, RTOS and Linux drivers.', degree: 'M.Tech Robotics', college: 'IISc Bangalore', gradYear: 2019, lastCompany: 'Ather Energy', lastTitle: 'Embedded Software Engineer', workTypes: ['onsite'] },
  { name: 'Neha Joshi', city: 'Mumbai', headline: 'QA Automation Engineer', years: 2, skills: ['selenium', 'java', 'testng', 'rest assured', 'sql'], bio: 'Automation engineer with experience setting up CI test suites for fintech apps.', degree: 'B.Sc. IT', college: 'Mumbai University', gradYear: 2022, lastCompany: 'Zeta', lastTitle: 'QA Engineer', workTypes: ['onsite', 'hybrid'] },
  { name: 'Arvind Nair', city: 'Kochi', headline: 'Go Engineer · Distributed Systems', years: 7, skills: ['go', 'postgresql', 'grpc', 'kafka', 'kubernetes', 'distributed systems'], bio: 'Backend engineer specialising in Go microservices and consistency-sensitive systems like inventory and ledgers.', degree: 'B.Tech CSE', college: 'NIT Calicut', gradYear: 2017, lastCompany: 'Flipkart', lastTitle: 'Senior Software Engineer', workTypes: ['remote', 'hybrid'] },
];

// ─── helpers ───────────────────────────────────────────────────────────────

function minimalPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function describeJob(j: JobSeed, company: (typeof COMPANIES)[number]) {
  return `${company.name} is hiring a ${j.title} to join our ${company.industry.toLowerCase()} team in ${j.city ?? company.city}.

About the role
You will work closely with product and design to ship features that reach real users every week. We value ownership, clear communication and pragmatic engineering.

What you'll do
• Build and maintain systems using ${j.skills.slice(0, 3).join(', ')}
• Collaborate in a ${j.workType} setup with a tight-knit team
• Participate in code reviews, design discussions and incident retrospectives

What we offer
Competitive compensation, learning budget, flexible hours and a culture that takes craft seriously.`;
}

async function wipe() {
  const demoUsers = await User.find({ email: { $regex: `@${DEMO_DOMAIN}$` } }).select('_id').lean();
  const ids = demoUsers.map((u) => u._id);
  if (ids.length === 0) return 0;
  const jobs = await Job.find({ recruiter: { $in: ids } }).select('_id').lean();
  const jobIds = jobs.map((j) => j._id);
  await Promise.all([
    Application.deleteMany({ $or: [{ candidate: { $in: ids } }, { job: { $in: jobIds } }] }),
    SavedJob.deleteMany({ $or: [{ candidate: { $in: ids } }, { job: { $in: jobIds } }] }),
    Report.deleteMany({ $or: [{ reporter: { $in: ids } }, { targetId: { $in: jobIds } }] }),
    Notification.deleteMany({ user: { $in: ids } }),
    Resume.deleteMany({ user: { $in: ids } }),
    RefreshToken.deleteMany({ user: { $in: ids } }),
    AuditLog.deleteMany({ $or: [{ targetId: { $in: ids } }, { targetId: { $in: jobIds } }] }),
    Job.deleteMany({ _id: { $in: jobIds } }),
    CandidateProfile.deleteMany({ user: { $in: ids } }),
    RecruiterProfile.deleteMany({ user: { $in: ids } }),
  ]);
  await User.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  if (env.isProd && process.env.ALLOW_DEMO_SEED !== 'true') {
    logger.error('Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to override.');
    process.exit(1);
  }
  await connectDatabase();

  const removed = await wipe();
  if (removed) logger.info(`Removed ${removed} previous demo users and their data`);
  if (process.argv.includes('--wipe')) {
    await disconnectDatabase();
    return;
  }

  const passwordHash = await User.hashPassword(DEMO_PASSWORD);
  const admin = env.ADMIN_EMAIL ? await User.findOne({ email: env.ADMIN_EMAIL, role: 'admin' }).lean() : null;
  const adminId = admin?._id ?? new Types.ObjectId();

  // ── dedicated demo administrator (the real ADMIN_EMAIL is never shown in the UI) ──
  await User.create({ email: `demo.admin@${DEMO_DOMAIN}`, passwordHash, role: 'admin', status: 'active', isEmailVerified: true, createdAt: daysAgo(60) });

  // ── recruiters ──
  const recruiters = new Map<string, { userId: Types.ObjectId; profileId: Types.ObjectId; verified: boolean; city: string }>();
  for (const c of COMPANIES) {
    const user = await User.create({ email: `hr.${slug(c.name)}@${DEMO_DOMAIN}`, passwordHash, role: 'recruiter', isEmailVerified: true, lastLoginAt: daysAgo(pick([0, 1, 2, 5])), createdAt: daysAgo(60) });
    const profile = await RecruiterProfile.create({
      user: user._id,
      fullName: c.hr,
      companyName: c.name,
      companyDescription: c.desc,
      industry: c.industry,
      companySize: c.size,
      website: `https://${slug(c.name)}.example.com`,
      location: { city: c.city, country: 'India' },
      phone: `+91 98${Math.floor(10000000 + Math.random() * 89999999)}`,
      isVerified: c.verified,
      verifiedAt: c.verified ? daysAgo(20) : undefined,
      verifiedBy: c.verified ? adminId : undefined,
    });
    if (c.verified) await AuditLog.create({ actor: adminId, action: 'recruiter.verify', targetType: 'recruiterProfile', targetId: profile._id, reason: 'GST + website verified', createdAt: daysAgo(20) });
    recruiters.set(c.name, { userId: user._id, profileId: profile._id, verified: c.verified, city: c.city });
  }

  // ── jobs ──
  const jobDocs: Array<{ _id: Types.ObjectId; seed: JobSeed; recruiter: Types.ObjectId; companyName: string; questions: { _id: Types.ObjectId; question: string; type: string; options: string[]; required: boolean }[] }> = [];
  for (const [i, j] of JOBS.entries()) {
    const company = COMPANIES.find((c) => c.name === j.company)!;
    const rec = recruiters.get(j.company)!;
    const status = j.status ?? 'open';
    const published = daysAgo(Math.floor((i / JOBS.length) * 28));
    const doc = await Job.create({
      recruiter: rec.userId,
      recruiterProfile: rec.profileId,
      companyName: company.name,
      companyVerified: rec.verified,
      title: j.title,
      description: describeJob(j, company),
      responsibilities: ['Ship well-tested, production-quality code', 'Own features from design through rollout', 'Mentor peers through reviews and pairing'],
      requiredSkills: j.skills,
      preferredSkills: j.preferred ?? [],
      location: { city: j.city ?? company.city, country: 'India' },
      workType: j.workType,
      employmentType: j.emp,
      salary: { min: j.salary[0], max: j.salary[1], currency: 'INR', period: j.emp === 'internship' ? 'month' : 'year', isVisible: i % 7 !== 3 },
      experienceLevel: j.level,
      experienceYears: { min: j.years[0], max: j.years[1] },
      educationRequirement: j.level === 'entry' ? "Bachelor's degree in CS/IT or equivalent" : undefined,
      benefits: pick([['Health insurance', 'Learning budget', 'Flexible hours'], ['ESOPs', 'Health insurance', 'Relocation support'], ['Remote stipend', 'Annual offsite', 'Health insurance']]),
      openings: pick([1, 1, 2, 3]),
      deadline: status === 'open' ? new Date(Date.now() + pick([10, 20, 30, 45]) * 86_400_000) : undefined,
      status,
      publishedAt: status === 'draft' ? undefined : published,
      closedAt: status === 'closed' ? daysAgo(2) : undefined,
      customQuestions: j.questions?.map((q) => ({ question: q.question, type: q.type, options: q.options ?? [], required: q.required ?? true })) ?? [],
      viewCount: status === 'open' ? Math.floor(40 + Math.random() * 400) : Math.floor(Math.random() * 60),
      createdAt: published,
    });
    jobDocs.push({ _id: doc._id, seed: j, recruiter: rec.userId, companyName: company.name, questions: doc.customQuestions.map((q) => ({ _id: q._id, question: q.question, type: q.type, options: q.options, required: q.required })) });
  }

  // ── candidates + resumes ──
  const candidateDocs: Array<{ userId: Types.ObjectId; resumeId: Types.ObjectId; seed: CandidateSeed; email: string }> = [];
  for (const c of CANDIDATES) {
    const [first, last] = c.name.split(' ');
    const email = `${first!.toLowerCase()}.${last!.toLowerCase()}@${DEMO_DOMAIN}`;
    const user = await User.create({ email, passwordHash, role: 'candidate', isEmailVerified: true, lastLoginAt: daysAgo(pick([0, 0, 1, 3, 7])), createdAt: daysAgo(45) });

    let publicId = `job-portal/resumes/${user._id}/demo-placeholder.pdf`;
    if (env.cloudinaryConfigured) {
      publicId = (await storageService.uploadResume(minimalPdf(`${c.name} - Resume (demo)`), user._id.toString())).publicId;
    }
    const resume = await Resume.create({ user: user._id, publicId, originalName: `${first}_${last}_Resume.pdf`, size: 48_213, mimeType: 'application/pdf', createdAt: daysAgo(30) });

    const start = new Date(`${c.gradYear}-07-01`);
    await CandidateProfile.create({
      user: user._id,
      fullName: c.name,
      phone: `+91 9${Math.floor(100000000 + Math.random() * 899999999)}`,
      headline: c.headline,
      bio: c.bio,
      location: { city: c.city, country: 'India' },
      skills: c.skills,
      education: [{ institution: c.college, degree: c.degree, field: 'Computer Science', startDate: new Date(`${c.gradYear - 4}-08-01`), endDate: new Date(`${c.gradYear}-05-31`), grade: pick(['8.2 CGPA', '8.7 CGPA', '9.1 CGPA', 'First Class']) }],
      experience: c.years > 0 ? [{ company: c.lastCompany, title: c.lastTitle, startDate: start, current: true, description: `Working on ${c.skills.slice(0, 2).join(' and ')} based systems.` }] : [{ company: c.lastCompany, title: c.lastTitle, startDate: new Date(`${c.gradYear}-01-01`), endDate: new Date(`${c.gradYear}-06-30`), description: 'Internship' }],
      certifications: c.skills.includes('aws') ? [{ name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', issueDate: daysAgo(400) }] : [],
      totalExperienceYears: c.years,
      preferredWorkTypes: c.workTypes,
      linkedinUrl: `https://www.linkedin.com/in/${slug(c.name)}`,
      githubUrl: `https://github.com/${slug(c.name)}`,
      activeResume: resume._id,
    });
    candidateDocs.push({ userId: user._id, resumeId: resume._id, seed: c, email });
  }

  // ── applications: each candidate applies to their best-matching open jobs ──
  const STATUS_MIX: ApplicationStatus[] = ['applied', 'applied', 'under_review', 'under_review', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn'];
  const FORWARD: Record<ApplicationStatus, ApplicationStatus[]> = {
    applied: ['applied'],
    under_review: ['applied', 'under_review'],
    shortlisted: ['applied', 'under_review', 'shortlisted'],
    interview: ['applied', 'under_review', 'shortlisted', 'interview'],
    selected: ['applied', 'under_review', 'shortlisted', 'interview', 'selected'],
    rejected: ['applied', 'under_review', 'rejected'],
    withdrawn: ['applied', 'withdrawn'],
  };
  const openJobs = jobDocs.filter((j) => (j.seed.status ?? 'open') === 'open');
  let applications = 0;
  const notifications: Array<Record<string, unknown>> = [];

  for (const cand of candidateDocs) {
    const skillSet = new Set(cand.seed.skills);
    const ranked = openJobs
      .map((j) => {
        const skillHits = j.seed.skills.filter((s) => skillSet.has(s)).length;
        const sameCity = (j.seed.city ?? recruiters.get(j.seed.company)!.city) === cand.seed.city ? 1 : 0;
        return { j, score: skillHits * 2 + sameCity };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2 + Math.floor(Math.random() * 3));

    for (const [k, { j }] of ranked.entries()) {
      const status = k === 0 ? pick(['shortlisted', 'interview', 'selected'] as ApplicationStatus[]) : pick(STATUS_MIX);
      const appliedAt = daysAgo(3 + Math.floor(Math.random() * 20));
      const chain = FORWARD[status];
      const history = chain.map((s, idx) => ({ status: s, changedBy: s === 'applied' || s === 'withdrawn' ? cand.userId : j.recruiter, changedAt: new Date(appliedAt.getTime() + idx * 86_400_000 * 1.5), note: s === 'shortlisted' ? 'Strong skill match' : s === 'rejected' ? 'Moving ahead with other candidates' : undefined }));
      const answers = j.questions.map((q) => ({ questionId: q._id, question: q.question, answer: q.type === 'select' ? pick(q.options) : q.type === 'boolean' ? pick(['yes', 'no']) : q.type === 'text' ? `https://github.com/${slug(cand.seed.name)}` : 'Led the migration of a monolith to services, cutting p95 latency by 40%.' }));

      await Application.create({
        job: j._id,
        candidate: cand.userId,
        recruiter: j.recruiter,
        resume: cand.resumeId,
        coverLetter: `Hello ${j.companyName} team,\n\nI am excited to apply for the ${j.seed.title} role. My experience with ${cand.seed.skills.slice(0, 3).join(', ')} maps closely to what you are looking for.\n\nRegards,\n${cand.seed.name}`,
        answers,
        status,
        statusHistory: history,
        interview: ['interview', 'selected'].includes(status) ? { scheduledAt: status === 'interview' ? new Date(Date.now() + pick([2, 4, 6]) * 86_400_000) : daysAgo(2), mode: pick(['video', 'onsite', 'phone'] as const), meetingLink: 'https://meet.google.com/demo-link', notes: 'Technical round with the hiring manager (60 min).', durationMinutes: 60 } : undefined,
        recruiterNotes: status === 'shortlisted' || status === 'interview' ? 'Good fundamentals; check system design depth.' : undefined,
        rating: ['shortlisted', 'interview', 'selected'].includes(status) ? pick([4, 4, 5]) : undefined,
        withdrawnAt: status === 'withdrawn' ? history[history.length - 1]!.changedAt : undefined,
        createdAt: appliedAt,
      });
      if (status !== 'withdrawn') await Job.updateOne({ _id: j._id }, { $inc: { applicationCount: 1 } });
      applications++;

      notifications.push({ user: cand.userId, type: 'application_submitted', title: 'Application submitted', message: `Your application for ${j.seed.title} at ${j.companyName} was received.`, link: '/candidate/applications', meta: { jobId: j._id }, isRead: true, readAt: appliedAt, createdAt: appliedAt });
      notifications.push({ user: j.recruiter, type: 'new_applicant', title: 'New applicant', message: `${cand.seed.name} applied for ${j.seed.title}.`, link: `/recruiter/jobs/${j._id}/applicants`, meta: { jobId: j._id }, isRead: Math.random() > 0.4, createdAt: appliedAt });
      const last = history[history.length - 1]!;
      if (last.status !== 'applied' && last.status !== 'withdrawn') {
        notifications.push({ user: cand.userId, type: last.status === 'interview' ? 'interview_scheduled' : 'application_status', title: last.status === 'interview' ? 'Interview scheduled' : `Application ${last.status.replace('_', ' ')}`, message: `Your application for ${j.seed.title} at ${j.companyName} is now: ${last.status.replace('_', ' ')}.`, link: '/candidate/applications', meta: { jobId: j._id }, isRead: false, createdAt: last.changedAt });
      }
    }

    // saved jobs: a few not applied to
    const appliedIds = new Set(ranked.map((r) => r.j._id.toString()));
    const toSave = openJobs.filter((j) => !appliedIds.has(j._id.toString())).sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    if (toSave.length) await SavedJob.insertMany(toSave.map((j) => ({ candidate: cand.userId, job: j._id, createdAt: daysAgo(Math.floor(Math.random() * 10)) })));
  }
  await Notification.insertMany(notifications);

  // ── reports for the admin queue ──
  const reporter = candidateDocs[4]!;
  const suspicious = jobDocs.find((j) => j.seed.title === 'Customer Support Engineer (Part-time)')!;
  await Report.create({ reporter: reporter.userId, targetType: 'job', targetId: suspicious._id, reason: 'misleading', details: 'Salary in the description does not match the listed range.', createdAt: daysAgo(1) });
  await Report.create({ reporter: candidateDocs[8]!.userId, targetType: 'job', targetId: jobDocs.find((j) => j.seed.title === 'Junior Frontend Developer')!._id, reason: 'other', details: 'Asks candidates to complete a 3-day unpaid assignment.', createdAt: daysAgo(3) });

  logger.info(
    `\nDemo data ready:\n  ${COMPANIES.length} recruiters, ${JOBS.length} jobs, ${CANDIDATES.length} candidates, ${applications} applications\n  Password for every demo account: ${DEMO_PASSWORD}\n  Recruiter login:  hr.zyntra-labs@${DEMO_DOMAIN}\n  Candidate login:  asha.verma@${DEMO_DOMAIN}\n  Demo admin login: demo.admin@${DEMO_DOMAIN}\n  ${env.cloudinaryConfigured ? 'Resume PDFs uploaded to Cloudinary.' : 'Cloudinary not configured — demo resume download links are placeholders.'}\n`,
  );
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error({ err }, 'seed:demo failed');
  process.exit(1);
});
