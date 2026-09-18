import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/ApiResponse';
import { idParamSchema } from '../../utils/validation';
import * as service from './application.service';
import {
  myApplicationsQuerySchema,
  recruiterApplicationsQuerySchema,
  recruiterNotesSchema,
  updateStatusSchema,
  type MyApplicationsQuery,
  type RecruiterApplicationsQuery,
} from './application.validation';

export const applicationRouter = Router();
applicationRouter.use(authenticate);

applicationRouter.get(
  '/me',
  authorize('candidate'),
  validate({ query: myApplicationsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.listMyApplications(req.user!.id, req.validatedQuery as MyApplicationsQuery);
    sendSuccess(res, { applications: result.applications }, { meta: result.meta });
  }),
);

applicationRouter.get(
  '/recruiter',
  authorize('recruiter'),
  validate({ query: recruiterApplicationsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { meta, ...data } = await service.listRecruiterApplications(req.user!.id, req.validatedQuery as RecruiterApplicationsQuery);
    sendSuccess(res, data, { meta });
  }),
);

applicationRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.getApplication(req.params.id!, req.user!));
  }),
);

applicationRouter.patch(
  '/:id/status',
  authorize('recruiter'),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.updateStatus(req.params.id!, req.user!, req.body);
    sendSuccess(res, result, { message: 'Application status updated' });
  }),
);

applicationRouter.patch(
  '/:id/notes',
  authorize('recruiter'),
  validate({ params: idParamSchema, body: recruiterNotesSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.updateRecruiterNotes(req.params.id!, req.user!, req.body), { message: 'Notes saved' });
  }),
);

applicationRouter.patch(
  '/:id/withdraw',
  authorize('candidate'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.withdraw(req.params.id!, req.user!), { message: 'Application withdrawn' });
  }),
);
