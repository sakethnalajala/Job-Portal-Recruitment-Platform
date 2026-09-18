import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/ApiResponse';
import * as service from './candidate.service';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { profile: await service.getOwnProfile(req.user!.id) });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const profile = await service.updateOwnProfile(req.user!.id, req.body);
  sendSuccess(res, { profile }, { message: 'Profile updated' });
});

export const uploadPhoto = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.uploadPhoto(req.user!.id, req.file!.buffer);
  sendSuccess(res, result, { message: 'Photo updated' });
});

export const deletePhoto = asyncHandler(async (req: Request, res: Response) => {
  await service.deletePhoto(req.user!.id);
  sendNoContent(res);
});

export const listResumes = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { resumes: await service.listResumes(req.user!.id) });
});

export const uploadResume = asyncHandler(async (req: Request, res: Response) => {
  const resume = await service.uploadResume(req.user!.id, req.file!, req.body.setActive);
  sendCreated(res, { resume }, 'Resume uploaded');
});

export const activateResume = asyncHandler(async (req: Request, res: Response) => {
  const resumes = await service.setActiveResume(req.user!.id, req.params.id!);
  sendSuccess(res, { resumes }, { message: 'Active resume updated' });
});

export const deleteResume = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteResume(req.user!.id, req.params.id!);
  sendNoContent(res);
});

export const downloadResume = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { resume: await service.getOwnResumeDownloadUrl(req.user!.id, req.params.id!) });
});

export const getCandidate = asyncHandler(async (req: Request, res: Response) => {
  const profile = await service.getCandidateForViewer(req.params.id!, req.user!);
  sendSuccess(res, { profile });
});
