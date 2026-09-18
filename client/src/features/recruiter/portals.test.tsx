import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server, BASE, ok, fail, recruiterUser } from '@/test/server';
import { renderWithRouter } from '@/test/utils';
import { InterviewsPage } from './InterviewsPage';
import { TalentPoolPage } from './TalentPoolPage';
import { CompanyTeamPage } from './CompanyTeamPage';
import { RecruiterAnalyticsPage } from './RecruiterAnalyticsPage';
import { RecruiterProfilePage } from './RecruiterProfilePage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import type { Interview, TalentEntry, TeamView, RecruiterAnalytics } from './portals.api';

const future = new Date(Date.now() + 2 * 24 * 3600e3).toISOString();
const interview: Interview = {
  id: 'i1', applicationId: 'a1', jobId: 'j1', candidateId: 'c1', round: 1, title: 'Technical round', scheduledAt: future, endsAt: future, durationMinutes: 60, mode: 'video',
  location: null, meetingLink: 'https://meet.example/abc', notes: null, status: 'scheduled', outcome: 'pending', cancelledReason: null, isUpcoming: true, createdAt: future,
  candidate: { fullName: 'Asha Verma', photoUrl: null, headline: 'Backend engineer' }, job: { title: 'Node.js Developer', companyName: 'Zyntra Labs' },
};
const entry: TalentEntry = {
  id: 't1', candidateId: 'c1', category: 'backend', tags: ['node.js'], notes: 'Strong fundamentals', rating: 4, savedAt: future, updatedAt: future,
  candidate: { fullName: 'Asha Verma', email: 'asha@example.com', headline: 'Backend engineer', photoUrl: null, skills: ['Node.js', 'MongoDB'], totalExperienceYears: 3, location: { city: 'Bengaluru' }, isActive: true },
  latestApplication: { id: 'a1', status: 'shortlisted', jobTitle: 'Node.js Developer' },
};
const team: TeamView = {
  owner: { id: 'u2', name: 'Rohan Mehta', companyName: 'Zyntra Labs', email: 'hr@zyntra.example', lastLoginAt: null, isYou: true },
  yourRole: 'owner',
  members: [{ id: 'm1', email: 'priya@zyntra.example', name: 'Priya Nair', title: 'Talent partner', role: 'recruiter', status: 'active', linked: true, joinedAt: future, invitedAt: future }],
  permissions: { admin: ['Everything'], recruiter: ['Review applicants'], viewer: ['Read-only'] },
  memberOf: 0,
};
const analytics: RecruiterAnalytics = {
  rangeDays: 30,
  totals: { jobs: 4, openJobs: 3, applications: 27, applicationsInRange: 9, views: 540, viewToApplyRate: 5, upcomingInterviews: 2, interviewsHeld: 5 },
  funnel: { allTime: { applications: 27, shortlisted: 10, interview: 6, selected: 2, rejected: 8, withdrawn: 1, shortlistRate: 37, interviewRate: 22, offerRate: 7 }, inRange: { applications: 9, shortlisted: 3, interview: 2, selected: 1, rejected: 2, withdrawn: 0, shortlistRate: 33, interviewRate: 22, offerRate: 11 } },
  trends: { applications: [{ date: '2026-09-01', count: 2 }, { date: '2026-09-02', count: 4 }], jobsPosted: [{ date: '2026-09-01', count: 1 }] },
  breakdowns: { jobsByStatus: { open: 3, closed: 1 }, applicationsByStatus: { applied: 10, shortlisted: 10, interview: 5, selected: 2 }, openJobsByWorkType: { remote: 2, hybrid: 1 }, openJobsByLevel: { mid: 3 }, interviewsByStatus: { scheduled: 2, completed: 5 } },
  jobs: [{ id: 'j1', title: 'Node.js Developer', status: 'open', publishedAt: future, views: 300, applications: 15, shortlisted: 6, interview: 3, selected: 1, rejected: 4, conversion: 5 }],
} as RecruiterAnalytics;

const routes = (el: JSX.Element, path: string) => [{ path, element: el }, { path: '/recruiter/applicants', element: <div>Applicants list</div> }];

describe('Interviews portal', () => {
  it('lists upcoming interviews with summary counts and sends a reminder', async () => {
    let reminded = '';
    server.use(
      http.get(`${BASE}/interviews`, () => ok({ interviews: [interview], summary: { upcoming: 1, today: 0, byStatus: { scheduled: 1 } } }, { page: 1, limit: 20, total: 1, totalPages: 1 })),
      http.post(`${BASE}/interviews/:id/remind`, ({ params }) => { reminded = String(params.id); return ok({ reminderSentAt: future }); }),
    );
    renderWithRouter(routes(<InterviewsPage />, '/recruiter/interviews'), { initialEntries: ['/recruiter/interviews'], user: recruiterUser });
    expect(await screen.findByText(/Technical round · Round 1/)).toBeInTheDocument();
    expect(screen.getByText('Asha Verma')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remind/i }));
    await waitFor(() => expect(reminded).toBe('i1'));
  });

  it('reschedules through the edit dialog and PATCHes the new time', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`${BASE}/interviews`, () => ok({ interviews: [interview], summary: { upcoming: 1, today: 0, byStatus: {} } }, { page: 1, limit: 20, total: 1, totalPages: 1 })),
      http.patch(`${BASE}/interviews/i1`, async ({ request }) => { body = (await request.json()) as Record<string, unknown>; return ok({ interview: { ...interview, status: 'rescheduled' } }); }),
    );
    renderWithRouter(routes(<InterviewsPage />, '/recruiter/interviews'), { initialEntries: ['/recruiter/interviews'], user: recruiterUser });
    await screen.findByText(/Technical round · Round 1/);
    await userEvent.click(screen.getByRole('button', { name: /interview actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /reschedule/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/format/i), 'onsite');
    await userEvent.type(within(dialog).getByLabelText(/location/i), 'Bengaluru office, 4F');
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(body.mode).toBe('onsite'));
    expect(body.location).toBe('Bengaluru office, 4F');
    expect(body.meetingLink).toBeUndefined();
  });
});

describe('Talent pool portal', () => {
  it('shows saved candidates by category and removes one after confirmation', async () => {
    let deleted = '';
    server.use(
      http.get(`${BASE}/talent-pool`, () => ok({ candidates: [entry], categories: [{ name: 'backend', count: 1 }] }, { page: 1, limit: 20, total: 1, totalPages: 1 })),
      http.delete(`${BASE}/talent-pool/:id`, ({ params }) => { deleted = String(params.id); return ok(null); }),
    );
    renderWithRouter(routes(<TalentPoolPage />, '/recruiter/talent-pool'), { initialEntries: ['/recruiter/talent-pool'], user: recruiterUser });
    expect(await screen.findByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByText('Strong fundamentals')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /backend/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove from pool/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(deleted).toBe('t1'));
  });

  it('edits notes and rating through the entry dialog', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`${BASE}/talent-pool`, () => ok({ candidates: [entry], categories: [{ name: 'backend', count: 1 }] }, { page: 1, limit: 20, total: 1, totalPages: 1 })),
      http.patch(`${BASE}/talent-pool/t1`, async ({ request }) => { body = (await request.json()) as Record<string, unknown>; return ok({ entry: { ...entry, ...body } }); }),
    );
    renderWithRouter(routes(<TalentPoolPage />, '/recruiter/talent-pool'), { initialEntries: ['/recruiter/talent-pool'], user: recruiterUser });
    await screen.findByText('Asha Verma');
    await userEvent.click(screen.getByRole('button', { name: /edit entry/i }));
    const dialog = await screen.findByRole('dialog');
    const notes = within(dialog).getByLabelText(/private notes/i);
    await userEvent.clear(notes);
    await userEvent.type(notes, 'Great for the platform team');
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(body.notes).toBe('Great for the platform team'));
  });
});

describe('Company & team portal', () => {
  it('lists members, invites a colleague and changes a role', async () => {
    let invited: Record<string, unknown> = {};
    let roleBody: Record<string, unknown> = {};
    server.use(
      http.get(`${BASE}/team`, () => ok(team)),
      http.get(`${BASE}/team/activity`, () => ok({ since: future, newApplications: 3, events: [{ type: 'interview', at: future, actor: 'Rohan Mehta', text: 'scheduled Technical round with Asha Verma', link: '/recruiter/interviews' }] })),
      http.post(`${BASE}/team`, async ({ request }) => { invited = (await request.json()) as Record<string, unknown>; return ok({ member: { id: 'm2', email: invited.email, name: null, title: null, role: invited.role, status: 'invited', linked: false, joinedAt: null, invitedAt: future } }, undefined); }),
      http.patch(`${BASE}/team/m1`, async ({ request }) => { roleBody = (await request.json()) as Record<string, unknown>; return ok({ member: { ...team.members[0], role: 'viewer' } }); }),
    );
    renderWithRouter(routes(<CompanyTeamPage />, '/recruiter/company'), { initialEntries: ['/recruiter/company?tab=team'], user: recruiterUser });
    expect(await screen.findByText('Priya Nair')).toBeInTheDocument();
    expect(screen.getByText(/scheduled Technical round/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^add member$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/work email/i), 'new.hire@zyntra.example');
    await userEvent.selectOptions(within(dialog).getByLabelText(/role/i), 'viewer');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add member$/i }));
    await waitFor(() => expect(invited.email).toBe('new.hire@zyntra.example'));
    expect(invited.role).toBe('viewer');

    const row = screen.getByText('Priya Nair').closest('tr')!;
    await userEvent.selectOptions(within(row).getByRole('combobox'), 'viewer');
    await waitFor(() => expect(roleBody.role).toBe('viewer'));
  });

  it('hides management controls for a viewer', async () => {
    server.use(
      http.get(`${BASE}/team`, () => ok({ ...team, yourRole: 'viewer', owner: { ...team.owner, isYou: false }, memberOf: 1 })),
      http.get(`${BASE}/team/activity`, () => ok({ since: future, newApplications: 0, events: [] })),
    );
    renderWithRouter(routes(<CompanyTeamPage />, '/recruiter/company'), { initialEntries: ['/recruiter/company?tab=team'], user: recruiterUser });
    await screen.findByText('Priya Nair');
    expect(screen.queryByRole('button', { name: /add member/i })).not.toBeInTheDocument();
  });
});

describe('Analytics portal', () => {
  it('renders totals, switches the range and offers export', async () => {
    const seen: string[] = [];
    server.use(http.get(`${BASE}/stats/recruiter/analytics`, ({ request }) => { seen.push(new URL(request.url).searchParams.get('days') ?? ''); return ok(analytics); }));
    renderWithRouter(routes(<RecruiterAnalyticsPage />, '/recruiter/analytics'), { initialEntries: ['/recruiter/analytics'], user: recruiterUser });
    expect((await screen.findAllByText('27')).length).toBeGreaterThan(0);
    expect(screen.getByText('Node.js Developer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /90 days/i }));
    await waitFor(() => expect(seen).toContain('90'));
    expect(screen.getByRole('button', { name: /export/i })).toBeEnabled();
  });
});

describe('Recruiter profile portal', () => {
  it('shows the recruiter, saves personal info and uploads a photo', async () => {
    let saved: Record<string, unknown> = {};
    let uploadedField = '';
    server.use(
      http.get(`${BASE}/recruiters/me`, () => ok({ profile: { id: 'r1', user: 'u2', fullName: 'Rohan Mehta', email: 'hr@zyntra.example', phone: '', companyName: 'Zyntra Labs', photoUrl: null, logoUrl: null, isVerified: false, openJobs: 3 } })),
      http.get(`${BASE}/auth/sessions`, () => ok({ sessions: [{ id: 's1', userAgent: 'vitest', ip: '127.0.0.1', createdAt: future, current: true }] })),
      http.patch(`${BASE}/recruiters/me`, async ({ request }) => { saved = (await request.json()) as Record<string, unknown>; return ok({ profile: { fullName: saved.fullName } }); }),
      http.post(`${BASE}/recruiters/me/photo`, () => { uploadedField = 'photo'; return ok({ photoUrl: 'https://cdn.example/p.png' }); }),
      http.get(`${BASE}/auth/me`, () => ok({ user: recruiterUser })),
      http.post(`${BASE}/auth/refresh`, () => ok({ user: recruiterUser, accessToken: 'tok' })),
    );
    renderWithRouter(routes(<RecruiterProfilePage />, '/recruiter/profile'), { initialEntries: ['/recruiter/profile'], user: recruiterUser });
    expect(await screen.findByRole('heading', { name: /my profile/i })).toBeInTheDocument();
    const phone = await screen.findByLabelText(/^phone/i);
    await userEvent.type(phone, '+91 98765 43210');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(saved.phone).toBe('+91 98765 43210'));

    const file = new File(['x'], 'me.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await waitFor(() => expect(uploadedField).toBe('photo'));
  });
});

describe('Notifications portal', () => {
  it('marks a read notification unread and edits preferences on the Preferences tab', async () => {
    let unread = '';
    let prefBody: Record<string, unknown> = {};
    const prefs = { email: { applicationUpdates: true, newApplicants: true, interviews: true, jobUpdates: true, marketing: false }, inApp: { applicationUpdates: true, newApplicants: true, interviews: true, jobUpdates: true } };
    server.use(
      http.get(`${BASE}/notifications`, () => ok({ notifications: [{ id: 'n1', type: 'new_applicant', title: 'New applicant', message: 'Asha applied', isRead: true, createdAt: future, link: null }] }, { page: 1, limit: 20, total: 1, totalPages: 1, unreadCount: 0 })),
      http.patch(`${BASE}/notifications/n1/unread`, () => { unread = 'n1'; return ok({ id: 'n1', isRead: false }); }),
      http.get(`${BASE}/notifications/preferences`, () => ok({ preferences: prefs })),
      http.patch(`${BASE}/notifications/preferences`, async ({ request }) => { prefBody = (await request.json()) as Record<string, unknown>; return ok({ preferences: { ...prefs, email: { ...prefs.email, newApplicants: false } } }); }),
    );
    renderWithRouter(routes(<NotificationsPage />, '/recruiter/notifications'), { initialEntries: ['/recruiter/notifications'], user: recruiterUser });
    expect(await screen.findByText('New applicant')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /mark unread/i }));
    await waitFor(() => expect(unread).toBe('n1'));

    await userEvent.click(screen.getByRole('tab', { name: /preferences/i }));
    const toggle = await screen.findByRole('switch', { name: /email new applicants/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    await waitFor(() => expect(prefBody).toEqual({ email: { newApplicants: false } }));
  });

  it('surfaces a backend error when preferences cannot be loaded', async () => {
    server.use(
      http.get(`${BASE}/notifications`, () => ok({ notifications: [] }, { page: 1, limit: 20, total: 0, totalPages: 1, unreadCount: 0 })),
      http.get(`${BASE}/notifications/preferences`, () => fail(403, 'FORBIDDEN', 'Preferences unavailable')),
    );
    renderWithRouter(routes(<NotificationsPage />, '/recruiter/notifications'), { initialEntries: ['/recruiter/notifications?tab=preferences'], user: recruiterUser });
    expect(await screen.findByText('Preferences unavailable')).toBeInTheDocument();
  });
});
