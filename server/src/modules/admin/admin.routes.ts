import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import { idParamSchema } from '../../utils/validation';
import * as service from './admin.service';
import * as platform from './admin.platform';
import {
  adminJobsQuerySchema,
  adminReportsQuerySchema,
  adminUsersQuerySchema,
  auditQuerySchema,
  deleteUserSchema,
  moderateJobSchema,
  resolveReportSchema,
  userStatusSchema,
  verifyRecruiterSchema,
  type AdminJobsQuery,
  type AdminReportsQuery,
  type AdminUsersQuery,
  type AuditQuery,
} from './admin.validation';

export const adminRouter = Router();
adminRouter.use(authenticate, authorize('admin'));

const actor = (req: Request) => ({ id: req.user!.id, ip: req.ip });

adminRouter.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await service.platformStats());
  }),
);

adminRouter.get(
  '/analytics',
  validate({ query: platform.analyticsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.validatedQuery as { days: number };
    sendSuccess(res, await platform.analytics(days));
  }),
);

adminRouter.get(
  '/system',
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await platform.systemHealth());
  }),
);

adminRouter.get(
  '/settings',
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { settings: await platform.getSettings() });
  }),
);
adminRouter.patch(
  '/settings',
  validate({ body: platform.settingsUpdateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, { settings: await platform.updateSettings(actor(req), req.body) }, { message: 'Settings saved' });
  }),
);

// ── users ───────────────────────────────────────────────────────────────────
adminRouter.get(
  '/users',
  validate({ query: adminUsersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { users, meta } = await service.listUsers(req.validatedQuery as AdminUsersQuery);
    sendSuccess(res, { users }, { meta });
  }),
);
adminRouter.get(
  '/users/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.getUser(req.params.id!));
  }),
);
adminRouter.patch(
  '/users/:id/status',
  validate({ params: idParamSchema, body: userStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.setUserStatus(actor(req), req.params.id!, req.body.status, req.body.reason);
    sendSuccess(res, result, { message: `User ${req.body.status}` });
  }),
);
adminRouter.delete(
  '/users/:id',
  validate({ params: idParamSchema, body: deleteUserSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await service.softDeleteUser(actor(req), req.params.id!, req.body.reason);
    sendNoContent(res);
  }),
);

// ── recruiter verification (by recruiter profile id) ────────────────────────
adminRouter.patch(
  '/recruiters/:id/verify',
  validate({ params: idParamSchema, body: verifyRecruiterSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.setRecruiterVerification(actor(req), req.params.id!, req.body.isVerified, req.body.reason);
    sendSuccess(res, result, { message: req.body.isVerified ? 'Recruiter verified' : 'Verification removed' });
  }),
);

// ── jobs ────────────────────────────────────────────────────────────────────
adminRouter.get(
  '/jobs',
  validate({ query: adminJobsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { jobs, meta } = await service.listJobs(req.validatedQuery as AdminJobsQuery);
    sendSuccess(res, { jobs }, { meta });
  }),
);
adminRouter.patch(
  '/jobs/:id/moderate',
  validate({ params: idParamSchema, body: moderateJobSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const job = await service.moderateJob(actor(req), req.params.id!, req.body.action, req.body.reason);
    sendSuccess(res, { job }, { message: req.body.action === 'remove' ? 'Job removed' : 'Job restored' });
  }),
);

// ── reports ─────────────────────────────────────────────────────────────────
adminRouter.get(
  '/reports',
  validate({ query: adminReportsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { reports, meta } = await service.listReports(req.validatedQuery as AdminReportsQuery);
    sendSuccess(res, { reports }, { meta });
  }),
);
adminRouter.patch(
  '/reports/:id',
  validate({ params: idParamSchema, body: resolveReportSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const report = await service.resolveReport(actor(req), req.params.id!, req.body.status, req.body.resolutionNote);
    sendSuccess(res, { report }, { message: 'Report updated' });
  }),
);

// ── audit log ───────────────────────────────────────────────────────────────
adminRouter.get(
  '/audit-logs',
  validate({ query: auditQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { logs, meta } = await service.listAuditLogs(req.validatedQuery as AuditQuery);
    sendSuccess(res, { logs }, { meta });
  }),
);
