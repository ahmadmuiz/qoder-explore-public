import { createHash, randomBytes } from 'node:crypto';

export function newId(prefix: string): string {
  const body = randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 12);
  return `${prefix}_${body}`;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function shortHash(value: string, length = 10): string {
  return sha256Hex(value).slice(0, length);
}

export function normalizeRef(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeInvoiceNumber(value: unknown): string {
  return normalizeRef(value);
}
