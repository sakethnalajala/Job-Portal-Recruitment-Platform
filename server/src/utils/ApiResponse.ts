import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SendOptions {
  statusCode?: number;
  message?: string;
  meta?: object;
}

export function sendSuccess<T>(res: Response, data: T, options: SendOptions = {}) {
  const { statusCode = 200, message = 'OK', meta } = options;
  return res.status(statusCode).json({ success: true, message, data, ...(meta ? { meta } : {}) });
}

export function sendCreated<T>(res: Response, data: T, message = 'Created') {
  return sendSuccess(res, data, { statusCode: 201, message });
}

export function sendNoContent(res: Response) {
  return res.status(204).send();
}
