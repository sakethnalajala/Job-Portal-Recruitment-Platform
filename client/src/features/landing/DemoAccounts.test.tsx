import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server, BASE, ok, fail, candidateUser, recruiterUser } from '@/test/server';
import { renderWithRouter } from '@/test/utils';
import { tokenStore } from '@/lib/auth-token';
import { DemoAccounts } from './DemoAccounts';

const routes = [
  { path: '/', element: <DemoAccounts /> },
  { path: '/candidate', element: <div>Candidate dashboard</div> },
  { path: '/recruiter', element: <div>Recruiter dashboard</div> },
  { path: '/admin', element: <div>Admin dashboard</div> },
];

describe('DemoAccounts', () => {
  it('renders three role cards with masked passwords and the warning', () => {
    renderWithRouter(routes, { user: null });
    expect(screen.getByText(/demo credentials are for testing purposes only/i)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('asha.verma@demo.jobportal.in')).toBeInTheDocument();
    expect(screen.queryByText('Demo@1234')).not.toBeInTheDocument();
    expect(screen.getAllByText('•'.repeat(9))).toHaveLength(3);
  });

  it('show/hide toggles the password and copy buttons write to the clipboard', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    renderWithRouter(routes, { user: null });
    const card = screen.getAllByRole('article')[0]!;
    await userEvent.click(within(card).getByRole('button', { name: /show password/i }));
    expect(within(card).getByText('Demo@1234')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /hide password/i }));
    expect(within(card).queryByText('Demo@1234')).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /copy email/i }));
    expect(write).toHaveBeenCalledWith('asha.verma@demo.jobportal.in');
    await userEvent.click(within(card).getByRole('button', { name: /copy password/i }));
    expect(write).toHaveBeenCalledWith('Demo@1234');
  });

  it('"Login as" posts the demo credentials and routes to the role dashboard', async () => {
    let body: unknown;
    server.use(http.post(`${BASE}/auth/login`, async ({ request }) => { body = await request.json(); return ok({ user: recruiterUser, accessToken: 'demo-token' }); }));
    renderWithRouter(routes, { user: null });
    await userEvent.click(screen.getByRole('button', { name: /login as recruiter/i }));
    expect(await screen.findByText('Recruiter dashboard')).toBeInTheDocument();
    expect(body).toEqual({ email: 'hr.zyntra-labs@demo.jobportal.in', password: 'Demo@1234' });
    expect(tokenStore.get()).toBe('demo-token');
  });

  it('shows a helpful error when the demo account is missing', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password')));
    renderWithRouter(routes, { user: null });
    await userEvent.click(screen.getByRole('button', { name: /login as admin/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /login as admin/i })).not.toBeDisabled());
    expect(tokenStore.get()).toBeNull();
  });

  it('switches accounts when already logged in as someone else', async () => {
    let logouts = 0;
    server.use(
      http.post(`${BASE}/auth/logout`, () => { logouts++; return ok(null); }),
      http.post(`${BASE}/auth/login`, () => ok({ user: candidateUser, accessToken: 'c-token' })),
    );
    renderWithRouter(routes, { user: recruiterUser });
    await userEvent.click(screen.getByRole('button', { name: /login as candidate/i }));
    expect(await screen.findByText('Candidate dashboard')).toBeInTheDocument();
    expect(logouts).toBe(1);
  });
});
