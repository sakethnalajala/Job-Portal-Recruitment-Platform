import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageLoader } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { GuestOnly, RequireAuth } from './guards';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from './ErrorPages';
import { LandingPage, ForCandidatesPage, ForRecruitersPage } from '@/features/landing/LandingPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { AdminLoginPage } from '@/features/auth/pages/AdminLoginPage';
import { RegisterCandidatePage, RegisterRecruiterPage } from '@/features/auth/pages/RegisterPages';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from '@/features/auth/pages/PasswordPages';

// Heavier pages are code-split per feature.
const lazyPage = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) => lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })));

const JobsPage = lazy(() => import('@/features/jobs/pages/JobsPage').then((m) => ({ default: m.JobsPage })));
const JobDetailsPage = lazy(() => import('@/features/jobs/pages/JobDetailsPage').then((m) => ({ default: m.JobDetailsPage })));
const CompanyPage = lazyPage(() => import('@/features/jobs/pages/CompanyPage'), 'CompanyPage');
const NotificationsPage = lazyPage(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage');
const SettingsPage = lazyPage(() => import('@/features/auth/pages/SettingsPage'), 'SettingsPage');

const CandidateDashboard = lazyPage(() => import('@/features/candidate/CandidateDashboard'), 'CandidateDashboard');
const ProfilePage = lazyPage(() => import('@/features/candidate/ProfilePage'), 'ProfilePage');
const ApplicationsPage = lazyPage(() => import('@/features/candidate/ApplicationsPages'), 'ApplicationsPage');
const ApplicationDetailPage = lazyPage(() => import('@/features/candidate/ApplicationsPages'), 'ApplicationDetailPage');
const SavedJobsPage = lazyPage(() => import('@/features/candidate/ApplicationsPages'), 'SavedJobsPage');
const ApplyPage = lazyPage(() => import('@/features/candidate/ApplyPage'), 'ApplyPage');

const RecruiterDashboard = lazyPage(() => import('@/features/recruiter/RecruiterDashboard'), 'RecruiterDashboard');
const JobsManagePage = lazyPage(() => import('@/features/recruiter/JobsManagePage'), 'JobsManagePage');
const JobFormPage = lazyPage(() => import('@/features/recruiter/JobFormPage'), 'JobFormPage');
const ApplicantsPage = lazyPage(() => import('@/features/recruiter/ApplicantsPage'), 'ApplicantsPage');
const ApplicationReviewPage = lazyPage(() => import('@/features/recruiter/ApplicationReviewPage'), 'ApplicationReviewPage');
const CompanyProfilePage = lazyPage(() => import('@/features/recruiter/CompanyProfilePage'), 'CompanyProfilePage');
const CandidateProfileView = lazyPage(() => import('@/features/recruiter/CompanyProfilePage'), 'CandidateProfileView');
const RecruiterProfilePage = lazyPage(() => import('@/features/recruiter/RecruiterProfilePage'), 'RecruiterProfilePage');
const CompanyTeamPage = lazyPage(() => import('@/features/recruiter/CompanyTeamPage'), 'CompanyTeamPage');
const RecruiterAnalyticsPage = lazyPage(() => import('@/features/recruiter/RecruiterAnalyticsPage'), 'RecruiterAnalyticsPage');
const InterviewsPage = lazyPage(() => import('@/features/recruiter/InterviewsPage'), 'InterviewsPage');
const TalentPoolPage = lazyPage(() => import('@/features/recruiter/TalentPoolPage'), 'TalentPoolPage');

const AdminDashboard = lazyPage(() => import('@/features/admin/AdminDashboard'), 'AdminDashboard');
const UsersPage = lazyPage(() => import('@/features/admin/UsersPage'), 'UsersPage');
const AdminJobsPage = lazyPage(() => import('@/features/admin/JobsPage'), 'AdminJobsPage');
const ReportsPage = lazyPage(() => import('@/features/admin/ReportsPage'), 'ReportsPage');
const AuditLogsPage = lazyPage(() => import('@/features/admin/AuditLogsPage'), 'AuditLogsPage');
const AnalyticsPage = lazyPage(() => import('@/features/admin/AnalyticsPage'), 'AnalyticsPage');
const PlatformSettingsPage = lazyPage(() => import('@/features/admin/PlatformSettingsPage'), 'PlatformSettingsPage');
const SystemHealthPage = lazyPage(() => import('@/features/admin/SystemHealthPage'), 'SystemHealthPage');
const SecurityPage = lazyPage(() => import('@/features/admin/SecurityPage'), 'SecurityPage');
const AdminProfilePage = lazyPage(() => import('@/features/admin/AdminProfilePage'), 'AdminProfilePage');

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </>
  );
}

/**
 * Public job pages: a signed-in candidate is sent to the same page inside
 * their dashboard so the sidebar stays visible; everyone else sees the public view.
 */
function PublicJobs({ detail }: { detail?: boolean }) {
  const { status, user } = useAuth();
  const { id } = useParams();
  const { search } = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (user?.role === 'candidate') return <Navigate to={detail ? `/candidate/jobs/${id}` : `/candidate/jobs${search}`} replace />;
  return detail ? <JobDetailsPage /> : <JobsPage />;
}

const Legal = ({ title }: { title: string }) => (
  <div className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-3 text-muted">Placeholder {title.toLowerCase()} for the portfolio build.</p></div>
);

export const routes = [
  {
    element: <Root />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <LandingPage /> },
          { path: '/jobs', element: <PublicJobs /> },
          { path: '/jobs/:id', element: <PublicJobs detail /> },
          { path: '/companies/:id', element: <CompanyPage /> },
          { path: '/for-candidates', element: <ForCandidatesPage /> },
          { path: '/for-recruiters', element: <ForRecruitersPage /> },
          { path: '/terms', element: <Legal title="Terms of Service" /> },
          { path: '/privacy', element: <Legal title="Privacy Policy" /> },
        ],
      },
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/login/:role', element: <LoginPage /> },
              { path: '/register', element: <Navigate to="/register/candidate" replace /> },
              { path: '/register/candidate', element: <RegisterCandidatePage /> },
              { path: '/register/recruiter', element: <RegisterRecruiterPage /> },
              { path: '/forgot-password', element: <ForgotPasswordPage /> },
              { path: '/reset-password', element: <ResetPasswordPage /> },
            ],
          },
        ],
      },
      // Admin console sign-in: full-page layout, no registration path; handles its own session state.
      { path: '/admin/login', element: <AdminLoginPage /> },
      { element: <AuthLayout />, children: [{ path: '/verify-email', element: <VerifyEmailPage /> }] },

      {
        element: <RequireAuth roles={['candidate']} />,
        children: [{
          element: <DashboardLayout />,
          children: [
            { path: '/candidate', element: <CandidateDashboard /> },
            { path: '/candidate/jobs', element: <JobsPage embedded /> },
            { path: '/candidate/jobs/:id', element: <JobDetailsPage embedded /> },
            { path: '/candidate/profile', element: <ProfilePage /> },
            { path: '/candidate/applications', element: <ApplicationsPage /> },
            { path: '/candidate/applications/:id', element: <ApplicationDetailPage /> },
            { path: '/candidate/saved', element: <SavedJobsPage /> },
            { path: '/candidate/apply/:id', element: <ApplyPage /> },
            { path: '/candidate/notifications', element: <NotificationsPage /> },
          ],
        }],
      },
      {
        element: <RequireAuth roles={['recruiter']} />,
        children: [{
          element: <DashboardLayout />,
          children: [
            { path: '/recruiter', element: <RecruiterDashboard /> },
            { path: '/recruiter/jobs', element: <JobsManagePage /> },
            { path: '/recruiter/jobs/new', element: <JobFormPage /> },
            { path: '/recruiter/jobs/:id/edit', element: <JobFormPage /> },
            { path: '/recruiter/jobs/:id/applicants', element: <ApplicantsPage /> },
            { path: '/recruiter/applicants', element: <ApplicantsPage /> },
            { path: '/recruiter/applications/:id', element: <ApplicationReviewPage /> },
            { path: '/recruiter/candidates/:id', element: <CandidateProfileView /> },
            { path: '/recruiter/profile', element: <RecruiterProfilePage /> },
            { path: '/recruiter/company', element: <CompanyTeamPage /> },
            { path: '/recruiter/company/profile', element: <CompanyProfilePage /> },
            { path: '/recruiter/analytics', element: <RecruiterAnalyticsPage /> },
            { path: '/recruiter/interviews', element: <InterviewsPage /> },
            { path: '/recruiter/talent-pool', element: <TalentPoolPage /> },
            { path: '/recruiter/notifications', element: <NotificationsPage /> },
          ],
        }],
      },
      {
        element: <RequireAuth roles={['admin']} />,
        children: [{
          element: <DashboardLayout />,
          children: [
            { path: '/admin', element: <AdminDashboard /> },
            { path: '/admin/analytics', element: <AnalyticsPage /> },
            { path: '/admin/users', element: <UsersPage /> },
            { path: '/admin/jobs', element: <AdminJobsPage /> },
            { path: '/admin/reports', element: <ReportsPage /> },
            { path: '/admin/notifications', element: <NotificationsPage /> },
            { path: '/admin/settings', element: <PlatformSettingsPage /> },
            { path: '/admin/system', element: <SystemHealthPage /> },
            { path: '/admin/security', element: <SecurityPage /> },
            { path: '/admin/audit-logs', element: <AuditLogsPage /> },
            { path: '/admin/profile', element: <AdminProfilePage /> },
          ],
        }],
      },
      {
        element: <RequireAuth />,
        children: [{ element: <DashboardLayout />, children: [{ path: '/notifications', element: <NotificationsPage /> }, { path: '/settings', element: <SettingsPage /> }] }],
      },

      { path: '/403', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
