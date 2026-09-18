import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { User } from '../../models/User';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/ApiResponse';
import { deactivateAccount } from '../admin/admin.service';
import { clearRefreshCookie } from '../auth/token.service';

export const userRouter = Router();
userRouter.use(authenticate);

const deleteMeSchema = z.object({
  password: z.string().min(1, 'Password is required').max(128),
  confirmation: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }),
});

/**
 * Self-service soft deletion. The row is kept (status=deleted) so applications,
 * audit logs and recruiter history remain consistent; login is impossible.
 */
userRouter.delete(
  '/me',
  validate({ body: deleteMeSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role === 'admin') throw AppError.forbidden('Administrator accounts cannot self-delete');
    const user = await User.findById(req.user!.id).select('+passwordHash');
    if (!user) throw AppError.notFound('User not found');
    if (!(await user.comparePassword(req.body.password))) {
      throw AppError.badRequest('Password is incorrect', 'INVALID_PASSWORD');
    }
    await deactivateAccount(user._id, user.role);
    user.status = 'deleted';
    user.deletedAt = new Date();
    await user.save();
    clearRefreshCookie(res);
    sendSuccess(res, null, { message: 'Your account has been deleted' });
  }),
);
