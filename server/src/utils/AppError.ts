export type ErrorDetails = Array<{ field: string; message: string }>;

/**
 * Operational error with a stable machine-readable code.
 * Anything that is NOT an AppError is treated as unexpected and its message
 * is never sent to the client.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ErrorDetails | undefined;
  public readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: ErrorDetails) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }
  static forbidden(
    message = 'You do not have permission to perform this action',
    code = 'FORBIDDEN',
  ) {
    return new AppError(403, code, message);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }
  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(409, code, message);
  }
  static tooMany(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    return new AppError(429, code, message);
  }
  static internal(message = 'Something went wrong', code = 'INTERNAL_ERROR') {
    return new AppError(500, code, message);
  }
}
