import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export const backendDir = join(import.meta.dirname, '..', '..', '02-source', 'backend');
export const sampleDir = join(backendDir, 'data', 'sample');

export interface QaContext {
  app: any;
  tempDir: string;
  tokens: Record<'analyst' | 'supervisor' | 'auditor', string>;
  cleanup: () => Promise<void>;
}

async function login(app: any, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'laras2026' },
  });
  if (response.statusCode !== 200) throw new Error(`Login failed for ${email}: ${response.body}`);
  return response.json().token as string;
}

export async function bootQaContext(): Promise<QaContext> {
  const tempDir = mkdtempSync(join(tmpdir(), 'laras-qa-'));
  const dbPath = join(tempDir, 'recon.db');
  const uploadsDir = join(tempDir, 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  // VACUUM INTO produces a consistent copy even when the source is in WAL mode.
  const source = new DatabaseSync(join(backendDir, 'data', 'recon.db'));
  source.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);
  source.close();

  process.env.DB_PATH = dbPath;
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.JWT_SECRET = 'laras-qa-test-secret';
  process.env.RECON_TODAY = '2026-11-16';
  process.env.LOG_LEVEL = 'silent';

  const moduleUrl = pathToFileURL(join(backendDir, 'src', 'app.ts')).href;
  const { buildApp } = await import(moduleUrl);
  const app = await buildApp();
  await app.ready();

  const tokens = {
    analyst: await login(app, 'rani@bcn.co.id'),
    supervisor: await login(app, 'dimas@bcn.co.id'),
    auditor: await login(app, 'ayu@bcn.co.id'),
  };

  return {
    app,
    tempDir,
    tokens,
    cleanup: async () => {
      await app.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function multipart(
  fields: Record<string, string>,
  file: { filename: string; contentType: string; buffer: Buffer },
): { payload: Buffer; boundary: string } {
  const boundary = `----larasqa${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  chunks.push(file.buffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), boundary };
}
