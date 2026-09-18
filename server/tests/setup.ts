import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import mongoose from 'mongoose';

// Cloudinary is not available in tests; the storage layer is swapped for a
// deterministic in-memory fake so upload/URL flows can still be exercised.
vi.mock('../src/services/storage.service', () => {
  let counter = 0;
  return {
    storageService: {
      uploadResume: vi.fn(async (_buf: Buffer, userId: string) => ({
        publicId: `job-portal/resumes/${userId}/${++counter}.pdf`,
        bytes: 1234,
      })),
      uploadImage: vi.fn(async (_buf: Buffer, kind: string, ownerId: string) => ({
        publicId: `job-portal/${kind}/${ownerId}`,
        bytes: 999,
      })),
      getResumeSignedUrl: vi.fn((publicId: string) => `https://signed.test/${publicId}?expires=900`),
      getImageUrl: vi.fn((publicId?: string | null) => (publicId ? `https://img.test/${publicId}` : null)),
      deleteResume: vi.fn(async () => undefined),
      deleteImage: vi.fn(async () => undefined),
    },
  };
});

beforeAll(async () => {
  const { connectDatabase } = await import('../src/config/db');
  await import('../src/models');
  await connectDatabase(process.env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
