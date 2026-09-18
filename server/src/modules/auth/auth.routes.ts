import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { emailActionLimiter, loginLimiter, registerLimiter } from '../../middleware/rateLimit';
import { authorize } from '../../middleware/authorize';
import { z } from 'zod';
import { idParamSchema } from '../../utils/validation';
import * as ctrl from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerCandidateSchema,
  registerRecruiterSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validation';

export const authRouter = Router();

// Registration — role is bound to the route, never read from the body.
authRouter.post(
  '/register/candidate',
  registerLimiter,
  validate({ body: registerCandidateSchema }),
  ctrl.registerCandidate,
);
authRouter.post(
  '/register/recruiter',
  registerLimiter,
  validate({ body: registerRecruiterSchema }),
  ctrl.registerRecruiter,
);

// Session
authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), ctrl.login);
// Admin console: same credential check, admin role required (403 otherwise).
authRouter.post('/admin/login', loginLimiter, validate({ body: loginSchema }), ctrl.adminLogin);
authRouter.post('/refresh', ctrl.refresh);
authRouter.post('/logout', ctrl.logout);
authRouter.post('/logout-all', authenticate, ctrl.logoutAll);
authRouter.get('/me', authenticate, ctrl.me);
authRouter.get('/sessions', authenticate, ctrl.listSessions);
authRouter.delete('/sessions/:id', authenticate, validate({ params: idParamSchema }), ctrl.revokeSession);
authRouter.patch(
  '/display-name',
  authenticate,
  authorize('admin'),
  validate({ body: z.object({ displayName: z.string().trim().min(2).max(120) }) }),
  ctrl.updateDisplayName,
);

// Password
authRouter.patch(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword,
);
authRouter.post(
  '/forgot-password',
  emailActionLimiter,
  validate({ body: forgotPasswordSchema }),
  ctrl.forgotPassword,
);
authRouter.post('/reset-password', validate({ body: resetPasswordSchema }), ctrl.resetPassword);

// Email verification
authRouter.post('/verify-email', validate({ body: verifyEmailSchema }), ctrl.verifyEmail);
authRouter.post(
  '/resend-verification',
  emailActionLimiter,
  validate({ body: resendVerificationSchema }),
  ctrl.resendVerification,
);
