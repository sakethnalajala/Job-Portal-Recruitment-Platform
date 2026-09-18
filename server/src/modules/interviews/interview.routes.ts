import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/ApiResponse';
import { idParamSchema } from '../../utils/validation';
import * as s from './interview.service';

export const interviewRouter = Router();
interviewRouter.use(authenticate);

// Candidate: own upcoming/past interviews (no recruiter feedback).
interviewRouter.get('/me', authorize('candidate'), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { interviews: await s.listForCandidate(req.user!.id) });
}));

const r = Router();
r.use(authorize('recruiter'));
r.get('/', validate({ query: s.listSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { meta, ...data } = await s.list(req.user!.id, req.validatedQuery as s.ListQuery);
  sendSuccess(res, data, { meta });
}));
r.post('/', validate({ body: s.scheduleSchema }), asyncHandler(async (req: Request, res: Response) => {
  sendCreated(res, { interview: await s.schedule(req.user!, req.body) }, 'Interview scheduled');
}));
r.get('/application/:id', validate({ params: idParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { interviews: await s.historyForApplication(req.user!.id, req.params.id!) });
}));
r.patch('/:id', validate({ params: idParamSchema, body: s.rescheduleSchema }), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { interview: await s.reschedule(req.user!, req.params.id!, req.body) }, { message: 'Interview updated' });
}));
r.patch('/:id/status', validate({ params: idParamSchema, body: s.statusSchema }), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { interview: await s.setStatus(req.user!, req.params.id!, req.body) }, { message: `Interview ${req.body.status.replace('_', ' ')}` });
}));
r.patch('/:id/feedback', validate({ params: idParamSchema, body: s.feedbackSchema }), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { interview: await s.saveFeedback(req.user!, req.params.id!, req.body) }, { message: 'Feedback saved' });
}));
r.post('/:id/remind', validate({ params: idParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await s.sendReminder(req.user!, req.params.id!), { message: 'Reminder sent to the candidate' });
}));
interviewRouter.use('/', r);
