import type { Role } from '../utils/constants';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      role: Role;
      email: string;
      isEmailVerified: boolean;
    }
    interface Request {
      user?: AuthUser;
      /** Parsed + coerced query, populated by validate() middleware. */
      validatedQuery?: unknown;
    }
  }
}

export {};
