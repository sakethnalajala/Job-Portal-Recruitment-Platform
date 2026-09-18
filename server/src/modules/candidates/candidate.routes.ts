import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { uploadImage, uploadResume } from '../../middleware/upload';
import { uploadLimiter } from '../../middleware/rateLimit';
import { idParamSchema } from '../../utils/validation';
import * as ctrl from './candidate.controller';
import { updateCandidateProfileSchema, uploadResumeBodySchema } from './candidate.validation';

export const candidateRouter = Router();

candidateRouter.use(authenticate);

// ── own profile ──────────────────────────────────────────────────────────────
const own = Router();
own.use(authorize('candidate'));
own.get('/', ctrl.getMe);
own.patch('/', validate({ body: updateCandidateProfileSchema }), ctrl.updateMe);
own.post('/photo', uploadLimiter, ...uploadImage('photo'), ctrl.uploadPhoto);
own.delete('/photo', ctrl.deletePhoto);

own.get('/resumes', ctrl.listResumes);
own.post(
  '/resumes',
  uploadLimiter,
  ...uploadResume('resume'),
  validate({ body: uploadResumeBodySchema }),
  ctrl.uploadResume,
);
own.patch('/resumes/:id/activate', validate({ params: idParamSchema }), ctrl.activateResume);
own.get('/resumes/:id/download', validate({ params: idParamSchema }), ctrl.downloadResume);
own.delete('/resumes/:id', validate({ params: idParamSchema }), ctrl.deleteResume);

candidateRouter.use('/me', own);

// ── viewing a candidate (recruiter with applicant relationship, or admin) ────
candidateRouter.get(
  '/:id',
  authorize('recruiter', 'admin'),
  validate({ params: idParamSchema }),
  ctrl.getCandidate,
);
