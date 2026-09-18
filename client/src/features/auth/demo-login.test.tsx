import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server, BASE, ok, fail, candidateUser, recruiterUser } from '@/test/server';
import { renderWithRouter } from '@/test/utils';
import { tokenStore } from '@/lib/auth-token';
import { GuestOnly } from '@/app/guards';
import { LoginPage } from './pages/LoginPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import type { AuthUser } from '@/types/api';

const adminUser: AuthUser = { id: 'u9', email: 'demo.admin@demo.jobportal.in', role: 'admin', isEmailVerified: true, profile: { fullName: 'Demo Admin' } };

const routes = [
  { element: <GuestOnly />, children: [{ path: '/login', element: <LoginPage /> }, { path: '/login/:role', element: <LoginPage /> }] },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/candidate', element: <div>Candidate dashboard</div> },
  { path: '/recruiter', element: <div>Recruiter dashboard</div> },
  { path: '/admin', element: <div>Admin console home</div> },
];

describe('login pages with demo accounts', () => {
  it('candidate login page shows the candidate demo and "Fill credentials" populates the form', async () => {
    renderWithRouter(routes, { initialEntries: ['/login/candidate'], user: null });
    expect(screen.getByRole('heading', { name: /candidate login/i })).toBeInTheDocument();
    expect(screen.getByText('asha.verma@demo.jobportal.in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /fill credentials/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue('asha.verma@demo.jobportal.in');
    expect(screen.getByLabelText(/^password/i)).toHaveValue('Demo@1234');
  });

  it('"Use demo account" on the candidate page logs in via /auth/login and lands on the candidate dashboard', async () => {
    let body: unknown;
    server.use(http.post(`${BASE}/auth/login`, async ({ request }) => { body = await request.json(); return ok({ user: candidateUser, accessToken: 'cand-token' }); }));
    renderWithRouter(routes, { initialEntries: ['/login/candidate'], user: null });
    await userEvent.click(screen.getByRole('button', { name: /use demo account/i }));
    expect(await screen.findByText('Candidate dashboard')).toBeInTheDocument();
    expect(body).toEqual({ email: 'asha.verma@demo.jobportal.in', password: 'Demo@1234' });
    expect(tokenStore.get()).toBe('cand-token');
  });

  it('recruiter login page offers the recruiter demo and routes to the recruiter dashboard', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => ok({ user: recruiterUser, accessToken: 'rec-token' })));
    renderWithRouter(routes, { initialEntries: ['/login/recruiter'], user: null });
    expect(screen.getByRole('heading', { name: /recruiter login/i })).toBeInTheDocument();
    expect(screen.getByText('hr.zyntra-labs@demo.jobportal.in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /use demo account/i }));
    expect(await screen.findByText('Recruiter dashboard')).toBeInTheDocument();
  });
});

describe('admin login page', () => {
  it('has no registration link and uses the admin-only endpoint', async () => {
    let url = '';
    server.use(http.post(`${BASE}/auth/admin/login`, ({ request }) => { url = request.url; return ok({ user: adminUser, accessToken: 'adm-token' }); }));
    renderWithRouter(routes, { initialEntries: ['/admin/login'], user: null });
    expect(screen.getByRole('heading', { name: /admin console/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create|sign ?up|register/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create|sign ?up|register/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be created here/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /use demo account/i }));
    expect(await screen.findByText('Admin console home')).toBeInTheDocument();
    expect(url).toContain('/auth/admin/login');
    expect(tokenStore.get()).toBe('adm-token');
  });

  it('rejects non-admin credentials with the backend message', async () => {
    server.use(http.post(`${BASE}/auth/admin/login`, () => fail(403, 'NOT_ADMIN', 'This account is not an administrator')));
    renderWithRouter(routes, { initialEntries: ['/admin/login'], user: null });
    await userEvent.type(screen.getByLabelText(/admin email/i), 'asha.verma@demo.jobportal.in');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Demo@1234');
    await userEvent.click(screen.getByRole('button', { name: /sign in to console/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not an administrator/i));
    expect(tokenStore.get()).toBeNull();
  });

  it('a signed-in candidate is told to sign out first; a signed-in admin is redirected to the console', async () => {
    renderWithRouter(routes, { initialEntries: ['/admin/login'], user: candidateUser });
    expect(screen.getByText(/sign out first/i)).toBeInTheDocument();
    renderWithRouter(routes, { initialEntries: ['/admin/login'], user: adminUser });
    expect(await screen.findByText('Admin console home')).toBeInTheDocument();
  });
});
