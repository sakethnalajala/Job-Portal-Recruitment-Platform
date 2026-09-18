import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError, type ErrorDetails } from '../utils/AppError';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and *replaces* req.body / req.params with the parsed (coerced,
 * stripped) values, so handlers only ever see whitelisted fields.
 * Parsed query lands on req.validatedQuery because Express 4 exposes
 * req.query as a getter-backed object.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetails = [];

    const run = (key: keyof Schemas, input: unknown) => {
      const schema = schemas[key];
      if (!schema) return undefined;
      const result = schema.safeParse(input);
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            field: [key, ...issue.path].join('.'),
            message: issue.message,
          });
        }
        return undefined;
      }
      return result.data;
    };

    const body = run('body', req.body ?? {});
    const query = run('query', req.query ?? {});
    const params = run('params', req.params ?? {});

    if (details.length) {
      return next(AppError.badRequest('Validation failed', 'VALIDATION_ERROR', details));
    }

    if (schemas.body) req.body = body;
    if (schemas.query) req.validatedQuery = query;
    if (schemas.params) req.params = params as typeof req.params;
    next();
  };
}
