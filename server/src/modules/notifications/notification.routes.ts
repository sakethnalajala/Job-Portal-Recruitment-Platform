import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { Notification } from '../../models/Notification';
import { User } from '../../models/User';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import { buildMeta, paginationQuerySchema, toSkip } from '../../utils/pagination';
import { booleanQuery, idParamSchema } from '../../utils/validation';

export const notificationRouter = Router();
notificationRouter.use(authenticate);

const listSchema = paginationQuerySchema.extend({ unreadOnly: booleanQuery, type: z.string().trim().max(40).optional() });
type ListQuery = z.infer<typeof listSchema>;

notificationRouter.get(
  '/',
  validate({ query: listSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListQuery;
    const filter = { user: req.user!.id, ...(query.unreadOnly ? { isRead: false } : {}), ...(query.type ? { type: query.type } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user!.id, isRead: false }),
    ]);
    sendSuccess(
      res,
      {
        notifications: items.map((n) => ({
          id: n._id.toString(),
          type: n.type,
          title: n.title,
          message: n.message,
          link: n.link ?? null,
          isRead: n.isRead,
          readAt: n.readAt ?? null,
          meta: { jobId: n.meta?.jobId?.toString() ?? null, applicationId: n.meta?.applicationId?.toString() ?? null },
          createdAt: n.createdAt,
        })),
      },
      { meta: { ...buildMeta(query, total), unreadCount } },
    );
  }),
);

const prefBool = z.boolean();
const preferencesSchema = z.object({
  email: z.object({ applicationUpdates: prefBool, newApplicants: prefBool, interviews: prefBool, jobUpdates: prefBool, marketing: prefBool }).partial().strict(),
  inApp: z.object({ applicationUpdates: prefBool, newApplicants: prefBool, interviews: prefBool, jobUpdates: prefBool }).partial().strict(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const DEFAULT_PREFS = { email: { applicationUpdates: true, newApplicants: true, interviews: true, jobUpdates: true, marketing: false }, inApp: { applicationUpdates: true, newApplicants: true, interviews: true, jobUpdates: true } };
const mergePrefs = (p?: Partial<typeof DEFAULT_PREFS> | null) => ({ email: { ...DEFAULT_PREFS.email, ...(p?.email ?? {}) }, inApp: { ...DEFAULT_PREFS.inApp, ...(p?.inApp ?? {}) } });

notificationRouter.get(
  '/preferences',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.user!.id).select('notificationPreferences').lean();
    sendSuccess(res, { preferences: mergePrefs(user?.notificationPreferences) });
  }),
);

notificationRouter.patch(
  '/preferences',
  validate({ body: preferencesSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const set: Record<string, boolean> = {};
    for (const [channel, values] of Object.entries(req.body as Record<string, Record<string, boolean>>)) for (const [k, v] of Object.entries(values)) set[`notificationPreferences.${channel}.${k}`] = v;
    const user = await User.findByIdAndUpdate(req.user!.id, { $set: set }, { new: true }).select('notificationPreferences').lean();
    sendSuccess(res, { preferences: mergePrefs(user?.notificationPreferences) }, { message: 'Notification preferences saved' });
  }),
);

notificationRouter.patch(
  '/:id/unread',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user!.id }, { $set: { isRead: false }, $unset: { readAt: 1 } }, { new: true }).lean();
    if (!n) throw AppError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
    sendSuccess(res, { id: n._id.toString(), isRead: n.isRead });
  }),
);

notificationRouter.get(
  '/unread-count',
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, { unreadCount: await Notification.countDocuments({ user: req.user!.id, isRead: false }) });
  }),
);

notificationRouter.patch(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await Notification.updateMany(
      { user: req.user!.id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    sendSuccess(res, { updated: result.modifiedCount }, { message: 'All notifications marked as read' });
  }),
);

notificationRouter.patch(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true },
    ).lean();
    if (!n) throw AppError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
    sendSuccess(res, { id: n._id.toString(), isRead: n.isRead, readAt: n.readAt });
  }),
);

notificationRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await Notification.deleteOne({ _id: req.params.id, user: req.user!.id });
    if (result.deletedCount === 0) throw AppError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
    sendNoContent(res);
  }),
);
