import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, one } from '../db/index.js';
import { ApiError } from '../lib/http.js';
import { signToken, verifyPassword, type AuthUser } from '../lib/security.js';
import { writeAudit } from '../lib/audit.js';
import { guard, parseBody } from './helpers.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  title: string;
  role: AuthUser['role'];
  password_hash: string;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function listUsers() {
  return all<{ id: string; email: string; name: string; title: string; role: string }>(
    'SELECT id, email, name, title, role FROM users ORDER BY CASE role WHEN \'SUPERVISOR\' THEN 0 WHEN \'ANALYST\' THEN 1 ELSE 2 END, name',
  );
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    const row = one<UserRow>('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', body.email.trim());
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw new ApiError(401, 'LOGIN_FAILED', 'Email or password is incorrect.');
    }
    const user: AuthUser = { id: row.id, email: row.email, name: row.name, title: row.title, role: row.role };
    writeAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'LOGIN',
      entityType: 'SESSION',
      entityId: user.id,
      summary: `${user.name} signed in.`,
    });
    return reply.send({ token: signToken(user), user });
  });

  app.get('/api/auth/me', { preHandler: guard() }, async (request, reply) => {
    return reply.send({ user: request.user });
  });

  app.get('/api/users', { preHandler: guard() }, async (_request, reply) => {
    return reply.send({ items: listUsers() });
  });
}
