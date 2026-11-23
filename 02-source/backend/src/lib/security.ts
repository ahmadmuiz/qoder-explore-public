import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { ApiError } from './http.js';

export type Role = 'ANALYST' | 'SUPERVISOR' | 'AUDITOR';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, title: user.title },
    config.jwtSecret,
    { expiresIn: '12h' },
  );
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  return {
    id: String(payload.sub),
    email: String(payload.email),
    name: String(payload.name),
    role: payload.role as Role,
    title: String(payload.title),
  };
}

export function userFromRequest(request: FastifyRequest): AuthUser {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'A bearer token is required.');
  }
  try {
    return verifyToken(header.slice(7));
  } catch {
    throw new ApiError(401, 'AUTH_INVALID', 'Session expired or invalid. Sign in again.');
  }
}

export function requireRole(user: AuthUser, roles: Role[]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, 'FORBIDDEN', `This action requires role ${roles.join(' or ')}.`);
  }
}
