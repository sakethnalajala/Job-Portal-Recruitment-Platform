import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { Application } from '../../models/Application';
import { CandidateProfile } from '../../models/CandidateProfile';
import { Job } from '../../models/Job';
import { Notification } from '../../models/Notification';
import { SavedJob } from '../../models/SavedJob';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/ApiResponse';
import { APPLICATION_STATUSES, JOB_STATUSES } from '../../utils/constants';
import { serializeJobCard, type JobLean } from '../jobs/job.service';
import { getRecruiterScope } from '../../services/team.service';
import { Interview } from '../../models/Interview';
import { validate } from '../../middleware/validate';
import { z } from 'zod';

export const statsRouter = Router();
statsRouter.use(authenticate);

const zeroed = (keys: readonly string[], rows: Array<{ _id: string; count: number }>) =>
  Object.fromEntries(keys.map((k) => [k, rows.find((r) => r._id === k)?.count ?? 0]));

const dayFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
const thirtyDaysAgo = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

statsRouter.get(
  '/candidate',
  authorize('candidate'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = new Types.ObjectId(req.user!.id);
    const [byStatus, saved, unread, profile, recent] = await Promise.all([
      Application.aggregate<{ _id: string; count: number }>([{ $match: { candidate: userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      SavedJob.countDocuments({ candidate: userId }),
      Notification.countDocuments({ user: userId, isRead: false }),
      CandidateProfile.findOne({ user: userId }).select('completion skills activeResume').lean(),
      Application.find({ candidate: userId }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    const jobs = await Job.find({ _id: { $in: recent.map((a) => a.job) } }).lean<JobLean[]>();
    const jobBy = new Map(jobs.map((j) => [j._id.toString(), j]));

    sendSuccess(res, {
      applications: { byStatus: zeroed(APPLICATION_STATUSES, byStatus), total: byStatus.reduce((s, r) => s + r.count, 0) },
      savedJobs: saved,
      unreadNotifications: unread,
      profile: { completion: profile?.completion ?? 0, skills: profile?.skills.length ?? 0, hasResume: Boolean(profile?.activeResume) },
      recentApplications: recent.map((a) => ({
        id: a._id.toString(),
        status: a.status,
        appliedAt: a.createdAt,
        job: jobBy.get(a.job.toString()) ? serializeJobCard(jobBy.get(a.job.toString())!) : null,
      })),
    });
  }),
);

statsRouter.get(
  '/recruiter',
  authorize('recruiter'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = new Types.ObjectId(req.user!.id);
    const owners = (await getRecruiterScope(req.user!.id)).ownerIds;
    const [jobsByStatus, appsByStatus, perDay, topJobs, views, unread] = await Promise.all([
      Job.aggregate<{ _id: string; count: number }>([{ $match: { recruiter: { $in: owners } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate<{ _id: string; count: number }>([{ $match: { recruiter: { $in: owners } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate<{ _id: string; count: number }>([
        { $match: { recruiter: { $in: owners }, createdAt: { $gte: thirtyDaysAgo() } } },
        { $group: { _id: dayFormat, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Job.find({ recruiter: { $in: owners }, status: { $ne: 'removed' } }).sort({ applicationCount: -1 }).limit(5).lean<JobLean[]>(),
      Job.aggregate<{ _id: null; views: number }>([{ $match: { recruiter: { $in: owners } } }, { $group: { _id: null, views: { $sum: '$viewCount' } } }]),
      Notification.countDocuments({ user: userId, isRead: false }),
    ]);
    const totalApps = appsByStatus.reduce((s, r) => s + r.count, 0);
    const selected = appsByStatus.find((r) => r._id === 'selected')?.count ?? 0;

    sendSuccess(res, {
      jobs: { byStatus: zeroed(JOB_STATUSES, jobsByStatus), total: jobsByStatus.reduce((s, r) => s + r.count, 0) },
      applications: { byStatus: zeroed(APPLICATION_STATUSES, appsByStatus), total: totalApps },
      totalViews: views[0]?.views ?? 0,
      conversionRate: totalApps ? Math.round((selected / totalApps) * 1000) / 10 : 0,
      unreadNotifications: unread,
      applicationsPerDay: perDay.map((r) => ({ date: r._id, count: r.count })),
      topJobs: topJobs.map((j) => ({ ...serializeJobCard(j, {}, { owner: true }), viewCount: j.viewCount })),
    });
  }),
);

/** Recruiter analytics with a date range — everything computed from the database. */
const analyticsSchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });
statsRouter.get(
  '/recruiter/analytics',
  authorize('recruiter'),
  validate({ query: analyticsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.validatedQuery as { days: number };
    const since = new Date(Date.now() - days * 86_400_000);
    const owners = (await getRecruiterScope(req.user!.id)).ownerIds;
    const match = { recruiter: { $in: owners } };
    const [jobsByStatus, appsByStatus, appsPerDay, appsInRangeByStatus, jobsPerDay, perJob, interviewsByStatus, upcomingInterviews, views, byWorkType, byLevel] = await Promise.all([
      Job.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate<{ _id: string; count: number }>([{ $match: { ...match, createdAt: { $gte: since } } }, { $group: { _id: dayFormat, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Application.aggregate<{ _id: string; count: number }>([{ $match: { ...match, createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Job.aggregate<{ _id: string; count: number }>([{ $match: { ...match, createdAt: { $gte: since } } }, { $group: { _id: dayFormat, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Job.aggregate<{ _id: Types.ObjectId; title: string; status: string; viewCount: number; applicationCount: number; publishedAt: Date | null; shortlisted: number; interview: number; selected: number; rejected: number; total: number }>([
        { $match: { ...match, status: { $ne: 'removed' } } },
        { $lookup: { from: 'applications', localField: '_id', foreignField: 'job', as: 'apps' } },
        { $project: {
          title: 1, status: 1, viewCount: 1, applicationCount: 1, publishedAt: 1,
          total: { $size: '$apps' },
          shortlisted: { $size: { $filter: { input: '$apps', as: 'a', cond: { $in: ['$$a.status', ['shortlisted', 'interview', 'selected']] } } } },
          interview: { $size: { $filter: { input: '$apps', as: 'a', cond: { $in: ['$$a.status', ['interview', 'selected']] } } } },
          selected: { $size: { $filter: { input: '$apps', as: 'a', cond: { $eq: ['$$a.status', 'selected'] } } } },
          rejected: { $size: { $filter: { input: '$apps', as: 'a', cond: { $eq: ['$$a.status', 'rejected'] } } } },
        } },
        { $sort: { total: -1, viewCount: -1 } },
        { $limit: 25 },
      ]),
      Interview.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Interview.countDocuments({ ...match, status: { $in: ['scheduled', 'rescheduled'] }, scheduledAt: { $gte: new Date() } }),
      Job.aggregate<{ _id: null; views: number }>([{ $match: match }, { $group: { _id: null, views: { $sum: '$viewCount' } } }]),
      Job.aggregate<{ _id: string; count: number }>([{ $match: { ...match, status: 'open' } }, { $group: { _id: '$workType', count: { $sum: 1 } } }]),
      Job.aggregate<{ _id: string; count: number }>([{ $match: { ...match, status: 'open' } }, { $group: { _id: '$experienceLevel', count: { $sum: 1 } } }]),
    ]);
    const get = (rows: { _id: string; count: number }[], k: string) => rows.find((r) => r._id === k)?.count ?? 0;
    const total = appsByStatus.reduce((s, r) => s + r.count, 0);
    const inRange = appsInRangeByStatus.reduce((s, r) => s + r.count, 0);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const funnel = (rows: { _id: string; count: number }[], t: number) => {
      const shortlisted = get(rows, 'shortlisted') + get(rows, 'interview') + get(rows, 'selected');
      const interview = get(rows, 'interview') + get(rows, 'selected');
      const selected = get(rows, 'selected');
      return { applications: t, shortlisted, interview, selected, rejected: get(rows, 'rejected'), withdrawn: get(rows, 'withdrawn'), shortlistRate: pct(shortlisted, t), interviewRate: pct(interview, t), offerRate: pct(selected, t) };
    };
    const totalViews = views[0]?.views ?? 0;
    sendSuccess(res, {
      rangeDays: days,
      totals: { jobs: jobsByStatus.reduce((s, r) => s + r.count, 0), openJobs: get(jobsByStatus, 'open'), applications: total, applicationsInRange: inRange, views: totalViews, viewToApplyRate: pct(total, totalViews), upcomingInterviews, interviewsHeld: get(interviewsByStatus, 'completed') },
      funnel: { allTime: funnel(appsByStatus, total), inRange: funnel(appsInRangeByStatus, inRange) },
      trends: { applications: appsPerDay.map((r) => ({ date: r._id, count: r.count })), jobsPosted: jobsPerDay.map((r) => ({ date: r._id, count: r.count })) },
      breakdowns: { jobsByStatus: zeroed(JOB_STATUSES, jobsByStatus), applicationsByStatus: zeroed(APPLICATION_STATUSES, appsByStatus), interviewsByStatus: Object.fromEntries(interviewsByStatus.map((r) => [r._id, r.count])), openJobsByWorkType: Object.fromEntries(byWorkType.map((r) => [r._id, r.count])), openJobsByLevel: Object.fromEntries(byLevel.map((r) => [r._id, r.count])) },
      jobs: perJob.map((j) => ({ id: j._id.toString(), title: j.title, status: j.status, views: j.viewCount, applications: j.total, shortlisted: j.shortlisted, interview: j.interview, selected: j.selected, rejected: j.rejected, conversion: pct(j.total, j.viewCount), publishedAt: j.publishedAt })),
    });
  }),
);
