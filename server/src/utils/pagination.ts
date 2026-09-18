import { z } from 'zod';
import { PAGINATION } from './constants';
import type { PaginationMeta } from './ApiResponse';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function toSkip({ page, limit }: PaginationQuery): number {
  return (page - 1) * limit;
}

export function buildMeta({ page, limit }: PaginationQuery, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
