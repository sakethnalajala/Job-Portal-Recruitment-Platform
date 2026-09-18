import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { uploadImage } from '../../middleware/upload';
import { uploadLimiter } from '../../middleware/rateLimit';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import { idParamSchema } from '../../utils/validation';
import * as service from './recruiter.service';
import { updateRecruiterProfileSchema } from './recruiter.validation';

export const recruiterRouter = Router();

const own = Router();
own.use(authenticate, authorize('recruiter'));

own.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, { profile: await service.getOwnProfile(req.user!.id) });
  }),
);

own.patch(
  '/',
  validate({ body: updateRecruiterProfileSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await service.updateOwnProfile(req.user!.id, req.body);
    sendSuccess(res, { profile }, { message: 'Profile updated' });
  }),
);

own.post(
  '/logo',
  uploadLimiter,
  ...uploadImage('logo'),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.uploadLogo(req.user!.id, req.file!.buffer), { message: 'Logo updated' });
  }),
);

own.post(
  '/photo',
  uploadLimiter,
  ...uploadImage('photo'),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await service.uploadPhoto(req.user!.id, req.file!.buffer), { message: 'Photo updated' });
  }),
);

own.delete(
  '/photo',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deletePhoto(req.user!.id);
    sendNoContent(res);
  }),
);

own.delete(
  '/logo',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteLogo(req.user!.id);
    sendNoContent(res);
  }),
);

recruiterRouter.use('/me', own);

// Public company card (no auth)
recruiterRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, { company: await service.getPublicCompany(req.params.id!) });
  }),
);
