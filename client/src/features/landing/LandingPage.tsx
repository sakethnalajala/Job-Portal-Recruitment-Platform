import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Bell, Building2, CheckCircle2, FileSearch, Search, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Card, CardSkeleton } from '@/components/ui';
import { JobCard } from '@/features/jobs/JobCard';
import { jobKeys, jobsApi } from '@/features/jobs/jobs.api';
import { DemoAccounts } from './DemoAccounts';

const POPULAR = ['React', 'Node.js', 'Python', 'Java', 'Data Engineer', 'DevOps', 'Bengaluru'];

const features = [
  { icon: FileSearch, title: 'Search that understands skills', text: 'Filter by stack, city, work type, experience and salary — results come from real, open postings.' },
  { icon: Sparkles, title: 'Recommendations from your profile', text: 'Add your skills once and get roles ranked by how well they match you.' },
  { icon: Bell, title: 'Track every application', text: 'Applied, shortlisted, interview, offer — see each move the moment a recruiter makes it.' },
  { icon: ShieldCheck, title: 'Verified employers', text: 'Companies go through verification so you can apply with confidence.' },
];

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const } });

/** Decorative aurora backdrop: blurred gradient blobs + faint grid. Pure CSS, GPU-composited. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-mesh" aria-hidden>
      <div className="glow-blob -left-24 top-10 h-[420px] w-[420px] bg-primary-500 animate-float" />
      <div className="glow-blob right-[-120px] top-24 h-[380px] w-[380px] bg-violet-500 animate-float-slow" />
      <div className="glow-blob bottom-[-160px] left-1/3 h-[460px] w-[460px] bg-sky-400 opacity-40 animate-float" style={{ animationDelay: '-6s' }} />
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const featured = useQuery({ queryKey: [...jobKeys.all, 'featured'], queryFn: () => jobsApi.search({ limit: 6, sort: 'newest' }) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/jobs?q=${encodeURIComponent(q.trim())}` : '/jobs');
  };

  return (
    <div className="relative">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <Backdrop />
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <motion.span {...fadeUp(0)} className="inline-flex items-center gap-1.5 rounded-full border border-primary-200/70 bg-primary-50/80 px-3 py-1 text-xs font-medium text-primary-700 backdrop-blur dark:border-primary-800 dark:bg-primary-950/60 dark:text-primary-300">
            <BadgeCheck className="h-3.5 w-3.5" /> Built for India's tech job market
          </motion.span>
          <motion.h1 {...fadeUp(0.08)} className="mt-6 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Find work that <span className={reduce ? 'gradient-text' : 'gradient-text-animated'}>moves your career</span> forward.
          </motion.h1>
          <motion.p {...fadeUp(0.16)} className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            Search thousands of openings from verified companies, apply with a single profile, and track every application in one dashboard.
          </motion.p>

          <motion.form
            {...fadeUp(0.24)}
            onSubmit={submit}
            role="search"
            className={`glass-card mx-auto mt-9 flex max-w-2xl flex-col gap-2 rounded-2xl p-2 transition-shadow duration-300 sm:flex-row ${focused ? 'shadow-glow ring-1 ring-primary-400/60' : ''}`}
          >
            <label className="flex flex-1 items-center gap-2 px-3">
              <Search className={`h-5 w-5 shrink-0 transition-colors ${focused ? 'text-primary-600 dark:text-primary-400' : 'text-muted'}`} aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Try “React”, “Data Engineer” or “Pune”"
                aria-label="Search jobs"
                className="h-11 w-full bg-transparent text-base outline-none placeholder:text-faint"
              />
            </label>
            <button type="submit" className="btn-gradient inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
              Search jobs <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>

          <motion.div {...fadeUp(0.32)} className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-muted">Popular:</span>
            {POPULAR.map((p) => (
              <Link key={p} to={`/jobs?q=${encodeURIComponent(p)}`} className="rounded-full border border-border bg-surface/70 px-3 py-1 text-text-secondary backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-400">{p}</Link>
            ))}
          </motion.div>

          <motion.p {...fadeUp(0.4)} className="mt-10 text-sm text-muted">
            {featured.data?.meta ? <><span className="font-semibold text-text">{featured.data.meta.total}</span> open roles right now · </> : null}
            free for candidates · verified employers
          </motion.p>
        </div>
      </section>

      {/* ── Featured jobs ── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Latest openings</h2>
            <p className="mt-1 text-sm text-muted">Fresh from verified and growing teams.</p>
          </div>
          <Link to="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">View all <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {featured.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        ) : featured.isError ? (
          <Card className="p-8 text-center text-sm text-muted">Jobs are loading slowly right now — the API may be waking up. <Link to="/jobs" className="text-primary-600 hover:underline">Open the job board</Link>.</Card>
        ) : featured.data.data.jobs.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">No openings yet. Check back soon.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured.data.data.jobs.map((job, i) => (
              <motion.div key={job.id} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.35, delay: (i % 3) * 0.07 }}>
                <JobCard job={job} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ── Demo accounts ── */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh opacity-70" aria-hidden />
        <DemoAccounts />
      </div>

      {/* ── Features ── */}
      <section className="border-y border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Everything between “open to work” and “offer accepted”</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.35, delay: i * 0.06 }} className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-1 hover:shadow-card-hover">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-violet-600 text-white shadow-md transition-transform group-hover:scale-105"><f.icon className="h-5 w-5" /></div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Recruiter CTA ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-indigo-700 to-violet-800 px-6 py-12 text-white shadow-glow sm:px-12">
          <div className="glow-blob -right-20 -top-20 h-72 w-72 bg-white/40 opacity-30 animate-float-slow" aria-hidden />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-200"><Users className="h-4 w-4" /> For recruiters</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Post a job in minutes. Review applicants in one pipeline.</h2>
              <p className="mt-2 max-w-xl text-primary-100">Custom screening questions, shortlist → interview → offer workflow, resume access and hiring analytics — free while we grow.</p>
            </div>
            <Link to="/register/recruiter" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-primary-700 shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.98]"><Building2 className="h-4 w-4" /> Start hiring</Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

export function ForCandidatesPage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh" aria-hidden />
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary-200/70 bg-primary-50/80 px-3 py-1 text-xs font-medium text-primary-700 backdrop-blur dark:border-primary-800 dark:bg-primary-950/60 dark:text-primary-300"><Sparkles className="h-3.5 w-3.5" /> Free for candidates</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">One profile. Every application. Zero guesswork.</h1>
        <p className="mt-4 text-lg text-muted">Build a profile once, apply to verified companies in a click, and follow each application from “applied” to “offer” — with alerts the moment anything changes.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {['Search by skills, city, work type, experience and salary', 'Recommendations ranked by how well a role matches your profile', 'Track applications: applied → shortlisted → interview → selected', 'Interview invites with date, format and meeting link', 'Save jobs and get alerts for new matches', 'Resume, education, experience and certifications in one place'].map((t) => (
            <li key={t} className="glass-card flex gap-3 rounded-xl p-4 text-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary-600" />{t}</li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/register/candidate" className="btn-gradient inline-flex h-12 items-center rounded-xl px-6 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">Create candidate account</Link>
          <Link to="/login/candidate" className="inline-flex h-12 items-center rounded-xl border border-border-strong bg-surface px-6 text-sm font-medium transition-colors hover:bg-surface-2">Candidate login</Link>
          <Link to="/jobs" className="inline-flex h-12 items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">Browse jobs <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </div>
  );
}

export function ForRecruitersPage() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-mesh" aria-hidden />
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Hire faster with a pipeline that works the way you do</h1>
        <p className="mt-4 text-lg text-muted">TalentBridge gives recruiting teams structured profiles, screening questions and a clear status workflow — without the enterprise price tag.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {['Unlimited job postings with custom screening questions', 'Applicant pipeline: applied → review → shortlist → interview → offer', 'Secure, time-limited resume access', 'Interview scheduling with automatic candidate notifications', 'Verified company badge after a quick review', 'Dashboard analytics: views, applications, conversion'].map((t) => (
            <li key={t} className="glass-card flex gap-3 rounded-xl p-4 text-sm"><ShieldCheck className="h-5 w-5 shrink-0 text-primary-600" />{t}</li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/register/recruiter" className="btn-gradient inline-flex h-12 items-center rounded-xl px-6 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">Create recruiter account</Link>
          <Link to="/login/recruiter" className="inline-flex h-12 items-center rounded-xl border border-border-strong bg-surface px-6 text-sm font-medium transition-colors hover:bg-surface-2">Recruiter login</Link>
        </div>
      </div>
    </div>
  );
}
