import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { server, BASE, ok, fail, candidateUser, recruiterUser } from '@/test/server';
import { renderWithRouter } from '@/test/utils';
import { tokenStore } from '@/lib/auth-token';
import { GuestOnly } from '@/app/guards';
import { LoginPage } from './pages/LoginPage';
import { RegisterCandidatePage } from './pages/RegisterPages';

const routes = [
  { element: <GuestOnly />, children: [{ path: '/login', element: <LoginPage /> }, { path: '/register/candidate', element: <RegisterCandidatePage /> }] },
  { path: '/candidate', element: <div>Candidate dashboard</div> },
  { path: '/recruiter', element: <div>Recruiter dashboard</div> },
  { path: '/jobs/42', element: <div>Job 42</div> },
];

describe('LoginPage', () => {
  it('shows client-side validation errors without hitting the API', async () => {
    renderWithRouter(routes, { initialEntries: ['/login'], user: null });
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('logs in and redirects by role (recruiter)', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => ok({ user: recruiterUser, accessToken: 'tok-r' })));
    renderWithRouter(routes, { initialEntries: ['/login'], user: null });
    await userEvent.type(screen.getByLabelText(/email/i), 'hr@zyntra.example');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Passw0rd123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('Recruiter dashboard')).toBeInTheDocument();
    expect(tokenStore.get()).toBe('tok-r');
  });

  it('returns to the page the user was trying to reach', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => ok({ user: candidateUser, accessToken: 'tok-c' })));
    renderWithRouter(routes, { initialEntries: [{ pathname: '/login', state: { from: { pathname: '/jobs/42' } } }], user: null });
    await userEvent.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Passw0rd123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('Job 42')).toBeInTheDocument();
  });

  it('surfaces server errors (invalid credentials, suspended)', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password')));
    renderWithRouter(routes, { initialEntries: ['/login'], user: null });
    await userEvent.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
    expect(tokenStore.get()).toBeNull();
  });
});

describe('RegisterCandidatePage', () => {
  it('validates password rules, confirmation and terms', async () => {
    renderWithRouter(routes, { initialEntries: ['/register/candidate'], user: null });
    await userEvent.type(screen.getByLabelText(/full name/i), 'A');
    await userEvent.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'different1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
    expect(screen.getByText(/include at least one number/i)).toBeInTheDocument();
    expect(screen.getByText(/accept the terms/i)).toBeInTheDocument();

    // Cross-field check runs once field-level rules pass.
    await userEvent.type(screen.getByLabelText(/full name/i), 'sha Verma');
    await userEvent.clear(screen.getByLabelText(/^password/i));
    await userEvent.type(screen.getByLabelText(/^password/i), 'Passw0rd123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('maps a 409 EMAIL_TAKEN to a form error and field-level details to fields', async () => {
    server.use(http.post(`${BASE}/auth/register/candidate`, () => fail(409, 'EMAIL_TAKEN', 'An account with this email already exists')));
    renderWithRouter(routes, { initialEntries: ['/register/candidate'], user: null });
    await userEvent.type(screen.getByLabelText(/full name/i), 'Asha Verma');
    await userEvent.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Passw0rd123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Passw0rd123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);

    server.use(http.post(`${BASE}/auth/register/candidate`, () => fail(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'body.email', message: 'Enter a valid email address' }])));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(screen.getByText('Enter a valid email address')).toBeInTheDocument());
  });

  it('registers and lands on the candidate dashboard', async () => {
    server.use(http.post(`${BASE}/auth/register/candidate`, () => ok({ user: candidateUser, accessToken: 'new-token' })));
    renderWithRouter(routes, { initialEntries: ['/register/candidate'], user: null });
    await userEvent.type(screen.getByLabelText(/full name/i), 'Asha Verma');
    await userEvent.type(screen.getByLabelText(/email/i), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Passw0rd123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Passw0rd123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Candidate dashboard')).toBeInTheDocument();
  });
});
