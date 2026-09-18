import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { server, BASE, ok, candidateUser, recruiterUser } from '@/test/server';
import { LocationEcho, renderWithRouter } from '@/test/utils';
import { GuestOnly, RequireAuth } from './guards';

const routes = [
  { path: '/login', element: <LocationEcho label="Login page" /> },
  { path: '/403', element: <div>Forbidden page</div> },
  { path: '/candidate', element: <div>Candidate home</div> },
  { path: '/recruiter', element: <div>Recruiter home</div> },
  { element: <RequireAuth roles={['candidate']} />, children: [{ path: '/candidate/secret', element: <div>Candidate secret</div> }] },
  { element: <RequireAuth />, children: [{ path: '/notifications', element: <div>Notifications</div> }] },
  { element: <GuestOnly />, children: [{ path: '/guest', element: <div>Guest only</div> }] },
];

describe('route guards', () => {
  it('anonymous → redirected to /login, remembering the origin', async () => {
    renderWithRouter(routes, { initialEntries: ['/candidate/secret'], user: null });
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('from')).toHaveTextContent('/candidate/secret');
  });

  it('wrong role → /403', async () => {
    renderWithRouter(routes, { initialEntries: ['/candidate/secret'], user: recruiterUser });
    expect(await screen.findByText('Forbidden page')).toBeInTheDocument();
  });

  it('right role → renders the page', async () => {
    renderWithRouter(routes, { initialEntries: ['/candidate/secret'], user: candidateUser });
    expect(await screen.findByText('Candidate secret')).toBeInTheDocument();
  });

  it('RequireAuth without roles accepts any authenticated user', async () => {
    renderWithRouter(routes, { initialEntries: ['/notifications'], user: recruiterUser });
    expect(await screen.findByText('Notifications')).toBeInTheDocument();
  });

  it('GuestOnly sends authenticated users to their dashboard', async () => {
    renderWithRouter(routes, { initialEntries: ['/guest'], user: recruiterUser });
    expect(await screen.findByText('Recruiter home')).toBeInTheDocument();
  });

  it('GuestOnly renders for anonymous users', async () => {
    renderWithRouter(routes, { initialEntries: ['/guest'], user: null });
    expect(await screen.findByText('Guest only')).toBeInTheDocument();
  });

  it('boot: shows loader, restores session from refresh cookie, then renders protected page', async () => {
    server.use(
      http.post(`${BASE}/auth/refresh`, () => ok({ user: candidateUser, accessToken: 'boot-token' })),
      http.get(`${BASE}/auth/me`, () => ok({ user: candidateUser })),
    );
    renderWithRouter(routes, { initialEntries: ['/candidate/secret'] });
    expect(screen.getByText(/restoring your session/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Candidate secret')).toBeInTheDocument());
  });

  it('boot without a session lands on /login', async () => {
    renderWithRouter(routes, { initialEntries: ['/candidate/secret'] });
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});
