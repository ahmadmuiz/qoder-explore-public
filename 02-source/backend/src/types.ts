import type { AuthUser } from './lib/security.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export {};
