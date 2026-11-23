import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

export const config = {
  root,
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? '127.0.0.1',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? 'laras-local-dev-secret-do-not-use-in-production',
  dbPath: process.env.DB_PATH ?? join(root, 'data', 'recon.db'),
  uploadsDir: process.env.UPLOADS_DIR ?? join(root, 'uploads'),
  seedDir: join(root, 'data', 'sample'),
  today: process.env.RECON_TODAY ?? new Date().toISOString().slice(0, 10),
  maxUploadBytes: 8 * 1024 * 1024,
  maxCsvRows: 25_000,
};
