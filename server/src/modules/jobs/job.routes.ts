import { Router, type Request, type Response } from 'express';
import { authenticate, optionalAuth } from '../../middleware/authenticate';
import { authorize, requireVerifiedEmail } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { uploadResumeOptional } from '../../middleware/upload';
import { uploadLimiter } from '../../middleware/rateLimit';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import { paginationQuerySchema, type PaginationQuery } from '../../utils/pagination';
import { idParamSchema } from '../../utils/validation';
import * as applications from '../applications/application.service';
import { applicantsQuerySchema, applySchema, type ApplicantsQuery } from '../applications/application.validation';
import * as service from './job.service';
import {
  createJobSchema,
  jobSearchSchema,
  jobStatusSchema,
  myJobsQuerySchema,
  reportJobSchema,
  updateJobSchema,
  type JobSearchQuery,
  type MyJobsQuery,
} from './job.validation';

export const jobRouter = Router();

// ── public search (candidate flags attached when logged in) ─────────────────
jobRouter.get(
  '/',
  optionalAuth,
  validate({ query: jobSearchSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.searchJobs(req.validatedQuery as JobSearchQuery, req.user);
    sendSuccess(res, { jobs: result.jobs }, { meta: result.meta });
  }),
);

// ── candidate: recommendations & saved jobs (before /:id) ───────────────────
jobRouter.get(
  '/recommended',
  authenticate,
  authorize('candidate'),
  validate({ query: paginationQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.recommendedJobs(req.user!.id, req.validatedQuery as PaginationQuery);
    sendSuccess(res, { jobs: result.jobs, basis: result.basis }, { meta: result.meta });
  }),
);

jobRouter.get(
  '/saved',
  authenticate,
  authorize('candidate'),
  validate({ query: paginationQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.listSavedJobs(req.user!.id, req.validatedQuery as PaginationQuery);
    sendSuccess(res, { jobs: result.jobs }, { meta: result.meta });
  }),
);

// ── recruiter: own jobs ─────────────────────────────────────────────────────
jobRouter.get(
  '/mine',
  authenticate,
  authorize('recruiter'),
  validate({ query: myJobsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.listMyJobs(req.user!.id, req.validatedQuery as MyJobsQuery);
    sendSuccess(res, { jobs: result.jobs }, { meta: result.meta });
  }),
);

jobRouter.post(
  '/',
  authenticate,
  authorize('recruiter'),
  validate({ body: createJobSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendCreated(res, { job: await service.createJob(req.user!, req.body) }, 'Job created');
  }),
);

// ── single job ──────────────────────────────────────────────────────────────
jobRouter.get(
  '/:id',
  optionalAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.getJob(req.params.id!, req.user));
  }),
);

jobRouter.patch(
  '/:id',
  authenticate,
  authorize('recruiter'),
  validate({ params: idParamSchema, body: updateJobSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, { job: await service.updateJob(req.params.id!, req.user!.id, req.body) }, { message: 'Job updated' });
  }),
);

jobRouter.patch(
  '/:id/status',
  authenticate,
  authorize('recruiter'),
  validate({ params: idParamSchema, body: jobStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const job = await service.changeJobStatus(req.params.id!, req.user!, req.body.status);
    sendSuccess(res, { job }, { message: `Job ${req.body.status}` });
  }),
);

jobRouter.delete(
  '/:id',
  authenticate,
  authorize('recruiter'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteJob(req.params.id!, req.user!.id);
    sendNoContent(res);
  }),
);

// ── applications on a job ───────────────────────────────────────────────────
jobRouter.get(
  '/:id/applications',
  authenticate,
  authorize('recruiter'),
  validate({ params: idParamSchema, query: applicantsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await applications.listApplicants(req.params.id!, req.user!.id, req.validatedQuery as ApplicantsQuery);
    const { meta, ...data } = result;
    sendSuccess(res, data, { meta });
  }),
);

jobRouter.post(
  '/:id/applications',
  authenticate,
  authorize('candidate'),
  requireVerifiedEmail,
  uploadLimiter,
  ...uploadResumeOptional('resume'),
  validate({ params: idParamSchema, body: applySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const application = await applications.applyToJob(req.user!, req.params.id!, req.body, req.file);
    sendCreated(res, { application }, 'Application submitted');
  }),
);

// ── save / unsave ───────────────────────────────────────────────────────────
jobRouter.post(
  '/:id/save',
  authenticate,
  authorize('candidate'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await service.saveJob(req.user!.id, req.params.id!);
    sendSuccess(res, { saved: true }, { message: 'Job saved' });
  }),
);

jobRouter.delete(
  '/:id/save',
  authenticate,
  authorize('candidate'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await service.unsaveJob(req.user!.id, req.params.id!);
    sendSuccess(res, { saved: false }, { message: 'Job removed from saved' });
  }),
);

// ── report ──────────────────────────────────────────────────────────────────
jobRouter.post(
  '/:id/report',
  authenticate,
  authorize('candidate'),
  validate({ params: idParamSchema, body: reportJobSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendCreated(res, { report: await service.reportJob(req.user!.id, req.params.id!, req.body) }, 'Report submitted');
  }),
);
