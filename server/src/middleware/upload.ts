import multer from 'multer';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { FILE_LIMITS } from '../utils/constants';

/**
 * Files are buffered in memory (never written to disk on Render) and
 * validated by magic bytes before being pushed to Cloudinary.
 */
const memory = multer.memoryStorage();

const PDF_MAGIC = Buffer.from('%PDF-');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_RIFF = Buffer.from('RIFF');

export function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).equals(PDF_MAGIC);
}

export function isImage(buf: Buffer): boolean {
  return (
    buf.subarray(0, 4).equals(PNG_MAGIC) ||
    buf.subarray(0, 3).equals(JPEG_MAGIC) ||
    (buf.subarray(0, 4).equals(WEBP_RIFF) && buf.subarray(8, 12).toString() === 'WEBP')
  );
}

function fileValidator(kind: 'pdf' | 'image'): RequestHandler {
  return (req, _res, next) => {
    const file = req.file;
    if (!file) return next(AppError.badRequest('A file is required', 'FILE_REQUIRED'));
    const ok = kind === 'pdf' ? isPdf(file.buffer) : isImage(file.buffer);
    if (!ok) {
      return next(
        AppError.badRequest(
          kind === 'pdf' ? 'Only PDF files are accepted' : 'Only PNG, JPEG or WebP images are accepted',
          'INVALID_FILE_TYPE',
        ),
      );
    }
    next();
  };
}

const resumeMulter = multer({
  storage: memory,
  limits: { fileSize: FILE_LIMITS.RESUME_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(AppError.badRequest('Only PDF files are accepted', 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

const imageMulter = multer({
  storage: memory,
  limits: { fileSize: FILE_LIMITS.IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      return cb(AppError.badRequest('Only PNG, JPEG or WebP images are accepted', 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

/** `field` = multipart field name. Requires the file. */
export const uploadResume = (field = 'resume'): RequestHandler[] => [
  resumeMulter.single(field),
  fileValidator('pdf'),
];

export const uploadImage = (field = 'image'): RequestHandler[] => [
  imageMulter.single(field),
  fileValidator('image'),
];

/** Optional resume upload (e.g. apply flow where an existing resume may be reused). */
export const uploadResumeOptional = (field = 'resume'): RequestHandler[] => [
  resumeMulter.single(field),
  (req, _res, next) => {
    if (req.file && !isPdf(req.file.buffer)) {
      return next(AppError.badRequest('Only PDF files are accepted', 'INVALID_FILE_TYPE'));
    }
    next();
  },
];
