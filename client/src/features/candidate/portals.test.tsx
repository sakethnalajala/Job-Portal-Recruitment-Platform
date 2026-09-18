import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server, BASE, ok, candidateUser } from '@/test/server';
import { renderWithRouter } from '@/test/utils';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { CandidateDashboard } from './CandidateDashboard';
import { ApplicationsPage, SavedJobsPage } from './ApplicationsPages';
import type { JobCard } from '@/types/api';

const now = Date.now();
const iso = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString();
const job = (id: string, title: string, publishedDaysAgo: number): JobCard => ({
  id, title, companyName: 'Zyntra Labs', companyLogoUrl: null, companyVerified: true, recruiterProfileId: 'r1', location: { city: 'Bengaluru' }, workType: 'hybrid', employmentType: 'full-time', experienceLevel: 'mid',
  experienceYears: { min: 2, max: 5 }, salary: { min: 1200000, max: 1800000, currency: 'INR', period: 'year' }, requiredSkills: ['node.js'], status: 'open', isExpired: false, deadline: null, publishedAt: iso(-publishedDaysAgo), applicationCount: 3, createdAt: iso(-publishedDaysAgo),
});
const interview = { id: 'i1', applicationId: 'a1', jobId: 'j1', candidateId: 'u1', round: 1, title: 'Technical round', scheduledAt: iso(2), endsAt: iso(2), durationMinutes: 45, mode: 'video', location: null, meetingLink: 'https://meet.example/x', notes: null, status: 'scheduled', outcome: 'pending', cancelledReason: null, isUpcoming: true, createdAt: iso(-1), job: { title: 'Node.js Developer', companyName: 'Zyntra Labs' } };
const stats = { applications: { byStatus: { applied: 2, under_review: 1, shortlisted: 1, interview: 1, selected: 0, rejected: 1, withdrawn: 0 }, total: 6 }, savedJobs: 3, unreadNotifications: 4, profile: { completion: 64, skills: 5, hasResume: true }, recentApplications: [] };

describe('homepage navigation', () => {
  it('shows Find jobs, For Candidates, For Recruiters and Admin, and marks the active one', async () => {
    renderWithRouter([{ element: <PublicLayout />, children: [{ path: '/for-candidates', element: <div>Candidates page</div> }, { path: '/jobs', element: <div>Jobs page</div> }] }], { initialEntries: ['/for-candidates'], user: null });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent?.trim())).toEqual(['Find jobs', 'For Candidates', 'For Recruiters', 'Admin']);
    expect(within(nav).getByRole('link', { name: /for candidates/i })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin/login');
    await userEvent.click(within(nav).getByRole('link', { name: /find jobs/i }));
    expect(await screen.findByText('Jobs page')).toBeInTheDocument();
  });

  it('exposes the same four items in the mobile menu', async () => {
    renderWithRouter([{ element: <PublicLayout />, children: [{ path: '/', element: <div>Home</div> }] }], { initialEntries: ['/'], user: null });
    await userEvent.click(await screen.findByRole('button', { name: /open menu/i }));
    const mobile = await screen.findByRole('navigation', { name: 'Mobile' });
    expect(within(mobile).getByRole('link', { name: /for candidates/i })).toHaveAttribute('href', '/for-candidates');
    expect(within(mobile).getByRole('link', { name: /for recruiters/i })).toHaveAttribute('href', '/for-recruiters');
  });
});

describe('candidate dashboard portals', () => {
  it('links the four portals with live counts', async () => {
    server.use(
      http.get(`${BASE}/stats/candidate`, () => ok(stats)),
      http.get(`${BASE}/jobs/recommended`, () => ok({ jobs: [], basis: { skills: [], city: null } }, { page: 1, limit: 3, total: 0, totalPages: 1 })),
      http.get(`${BASE}/interviews/me`, () => ok({ interviews: [interview] })),
    );
    renderWithRouter([{ path: '/candidate', element: <CandidateDashboard /> }], { initialEntries: ['/candidate'], user: candidateUser });
    const portals = await screen.findByRole('region', { name: /your portals/i });
    expect(within(portals).getByRole('link', { name: /notifications/i })).toHaveAttribute('href', '/candidate/notifications');
    expect(within(portals).getByRole('link', { name: /saved jobs & alerts/i })).toHaveAttribute('href', '/candidate/saved');
    expect(within(portals).getByRole('link', { name: /application tracking/i })).toHaveAttribute('href', '/candidate/applications');
    expect(within(portals).getByRole('link', { name: /profile & resume/i })).toHaveAttribute('href', '/candidate/profile');
    await waitFor(() => expect(within(portals).getByText('64%')).toBeInTheDocument());
    expect(await screen.findByText(/Technical round · Round 1/)).toBeInTheDocument();
  });
});

describe('application tracking', () => {
  it('shows status counts on the filter pills and the upcoming interview strip', async () => {
    server.use(
      http.get(`${BASE}/stats/candidate`, () => ok(stats)),
      http.get(`${BASE}/interviews/me`, () => ok({ interviews: [interview] })),
      http.get(`${BASE}/applications/me`, () => ok({ applications: [{ id: 'a1', jobId: 'j1', status: 'interview', statusLabel: 'Interview', coverLetter: null, answers: [], statusHistory: [{ status: 'applied', changedAt: iso(-5), note: null }, { status: 'interview', changedAt: iso(-1), note: null }], interview: { scheduledAt: iso(2), mode: 'video' }, withdrawnAt: null, appliedAt: iso(-5), job: job('j1', 'Node.js Developer', 6), resume: null, canWithdraw: true }] }, { page: 1, limit: 10, total: 1, totalPages: 1 })),
    );
    renderWithRouter([{ path: '/candidate/applications', element: <ApplicationsPage /> }], { initialEntries: ['/candidate/applications'], user: candidateUser });
    expect(await screen.findByText('Node.js Developer')).toBeInTheDocument();
    const tabs = screen.getByRole('tablist');
    await waitFor(() => expect(within(tabs).getByRole('tab', { name: /^All\s*6$/ })).toBeInTheDocument());
    expect(within(tabs).getByRole('tab', { name: /^Interview\s*1$/ })).toBeInTheDocument();
    expect(screen.getByText(/Technical round · Round 1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join link/i })).toHaveAttribute('href', 'https://meet.example/x');
  });
});

describe('saved jobs & job alerts', () => {
  it('lists saved jobs and switches to alerts built from fresh recommendations', async () => {
    server.use(
      http.get(`${BASE}/jobs/saved`, () => ok({ jobs: [job('j2', 'Platform Engineer', 3)] }, { page: 1, limit: 12, total: 1, totalPages: 1 })),
      http.get(`${BASE}/jobs/recommended`, () => ok({ jobs: [job('j3', 'Backend Developer', 2), job('j4', 'Senior Node Engineer', 20)], basis: { skills: ['node.js', 'mongodb'], city: 'Bengaluru' } }, { page: 1, limit: 24, total: 2, totalPages: 1 })),
    );
    renderWithRouter([{ path: '/candidate/saved', element: <SavedJobsPage /> }], { initialEntries: ['/candidate/saved'], user: candidateUser });
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /job alerts/i }));
    expect(await screen.findByText('Backend Developer')).toBeInTheDocument();
    expect(screen.getByText(/new this week/i).parentElement).toHaveTextContent('1');
    expect(screen.getByText(/earlier matches/i)).toBeInTheDocument();
    expect(screen.getByText('Senior Node Engineer')).toBeInTheDocument();
    expect(screen.getByText(/node\.js, mongodb/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /alert emails/i })).toHaveAttribute('href', '/candidate/notifications?tab=preferences');
  });
});

describe('candidate notifications', () => {
  it('shows candidate categories only and marks a notification read', async () => {
    let read = '';
    server.use(
      http.get(`${BASE}/notifications`, () => ok({ notifications: [{ id: 'n1', type: 'application_status', title: 'You were shortlisted', message: 'Zyntra Labs moved you forward', isRead: false, createdAt: iso(-1), link: '/candidate/applications/a1' }] }, { page: 1, limit: 15, total: 1, totalPages: 1, unreadCount: 1 })),
      http.patch(`${BASE}/notifications/n1/read`, () => { read = 'n1'; return ok({ id: 'n1', isRead: true }); }),
    );
    renderWithRouter([{ path: '/candidate/notifications', element: <NotificationsPage /> }], { initialEntries: ['/candidate/notifications'], user: candidateUser });
    expect(await screen.findByText('You were shortlisted')).toBeInTheDocument();
    const pills = screen.getAllByRole('tablist')[1]!;
    expect(within(pills).getByRole('tab', { name: /job alerts/i })).toBeInTheDocument();
    expect(within(pills).queryByRole('tab', { name: /new applicants/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /mark read/i }));
    await waitFor(() => expect(read).toBe('n1'));
  });
});
