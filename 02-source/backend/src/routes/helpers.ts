import type { FastifyRequest } from 'fastify';
import type { ZodSchema } from 'zod';
import { ApiError } from '../lib/http.js';
import { requireRole, userFromRequest, type Role } from '../lib/security.js';

export function guard(roles?: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const user = userFromRequest(request);
    if (roles) requireRole(user, roles);
    request.user = user;
  };
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'The request payload is invalid.', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}
