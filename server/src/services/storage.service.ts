import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { cloudinary } from '../config/cloudinary';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { uuid } from '../utils/crypto';

/**
 * Cloudinary-backed storage.
 *
 *  - Resumes: `resource_type: raw`, `type: private` → the asset has NO public URL.
 *    Access is only possible through a short-lived signed download URL that the
 *    API generates after an authorization check.
 *  - Images (profile photos, company logos): standard `upload` type, delivered
 *    through the CDN with auto format/quality. They are meant to be public.
 */

const RESUME_URL_TTL_SECONDS = 15 * 60;

function assertConfigured(): void {
  if (!env.cloudinaryConfigured) {
    throw new AppError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured on this server');
  }
}

function uploadBuffer(
  buffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) return reject(error ?? new Error('Empty upload result'));
      resolve(result);
    });
    stream.end(buffer);
  });
}

export interface StoredFile {
  publicId: string;
  bytes: number;
}

export const storageService = {
  async uploadResume(buffer: Buffer, userId: string): Promise<StoredFile> {
    assertConfigured();
    try {
      const result = await uploadBuffer(buffer, {
        folder: `${env.CLOUDINARY_FOLDER}/resumes/${userId}`,
        public_id: `${uuid()}.pdf`,
        resource_type: 'raw',
        type: 'private',
        overwrite: false,
      });
      return { publicId: result.public_id, bytes: result.bytes };
    } catch (err) {
      logger.error({ err }, '[storage] resume upload failed');
      throw new AppError(502, 'STORAGE_UPLOAD_FAILED', 'Could not upload the file, please try again');
    }
  },

  async uploadImage(buffer: Buffer, kind: 'avatars' | 'logos', ownerId: string): Promise<StoredFile> {
    assertConfigured();
    try {
      const result = await uploadBuffer(buffer, {
        folder: `${env.CLOUDINARY_FOLDER}/${kind}`,
        public_id: ownerId, // one image per owner; re-upload replaces it
        resource_type: 'image',
        type: 'upload',
        overwrite: true,
        invalidate: true,
        transformation: [{ width: 512, height: 512, crop: 'limit' }],
      });
      return { publicId: result.public_id, bytes: result.bytes };
    } catch (err) {
      logger.error({ err }, '[storage] image upload failed');
      throw new AppError(502, 'STORAGE_UPLOAD_FAILED', 'Could not upload the image, please try again');
    }
  },

  /**
   * Time-limited download URL for a private resume. Call only after authorization.
   * Returns null when storage is not configured so read endpoints still work.
   */
  getResumeSignedUrl(publicId: string, originalName?: string): string | null {
    if (!env.cloudinaryConfigured) return null;
    const expiresAt = Math.floor(Date.now() / 1000) + RESUME_URL_TTL_SECONDS;
    return cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      type: 'private',
      expires_at: expiresAt,
      attachment: originalName ? true : undefined,
    });
  },

  /** CDN URL for a public image with sensible defaults. */
  getImageUrl(publicId: string | null | undefined, size = 256): string | null {
    if (!publicId || !env.cloudinaryConfigured) return null;
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      transformation: [{ width: size, height: size, crop: 'fill', gravity: 'auto' }],
      fetch_format: 'auto',
      quality: 'auto',
    });
  },

  async deleteResume(publicId: string): Promise<void> {
    if (!env.cloudinaryConfigured) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'private' });
    } catch (err) {
      // Orphaned files are not fatal; log for cleanup.
      logger.warn({ err, publicId }, '[storage] failed to delete resume');
    }
  },

  async deleteImage(publicId: string): Promise<void> {
    if (!env.cloudinaryConfigured) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    } catch (err) {
      logger.warn({ err, publicId }, '[storage] failed to delete image');
    }
  },
};
