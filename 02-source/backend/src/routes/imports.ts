import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { all, one } from '../db/index.js';
import { config } from '../config.js';
import { ApiError, readPaging } from '../lib/http.js';
import { commitImport, previewImport, type ImportSource } from '../domain/imports.js';
import { getSettings } from '../lib/settings.js';
import { guard } from './helpers.js';
import { safeJson } from '../lib/http.js';

const SOURCES: ImportSource[] = ['LEDGER', 'INVOICE', 'RECEIPT'];

const TEMPLATES: Record<ImportSource, { headers: string[]; example: string[] }> = {
  LEDGER: {
    headers: ['transaction_id', 'amount', 'currency', 'value_date', 'vendor_code', 'invoice_number', 'account_mask', 'channel', 'description'],
    example: ['TRX/2026/11/004321', '487500000', 'IDR', '2026-11-12', 'VND-001', 'INV-2026-0142', '8820-01-****-4471', 'RTGS', 'Invoice settlement'],
  },
  INVOICE: {
    headers: ['invoice_number', 'vendor_code', 'issue_date', 'due_date', 'currency', 'subtotal', 'tax', 'total', 'payment_ref', 'description'],
    example: ['INV-2026-0142', 'VND-001', '2026-10-28', '2026-11-27', 'IDR', '450000000', '49500000', '499500000', 'TRX/2026/11/004321', 'Cloud infrastructure October'],
  },
  RECEIPT: {
    headers: ['receipt_number', 'invoice_number', 'vendor_code', 'amount', 'currency', 'received_date'],
    example: ['KWT/VND-001/0142', 'INV-2026-0142', 'VND-001', '499500000', 'IDR', '2026-11-13'],
  },
};

function resolveSource(request: FastifyRequest, part?: { fields?: Record<string, unknown> }): ImportSource {
  const fromQuery = (request.query as Record<string, string | undefined>).source;
  const rawField = part?.fields?.source as { value?: string } | string | undefined;
  const fromField = typeof rawField === 'string' ? rawField : rawField?.value;
  const source = String(fromField ?? fromQuery ?? '').toUpperCase() as ImportSource;
  if (!SOURCES.includes(source)) {
    throw new ApiError(400, 'IMPORT_SOURCE_INVALID', 'Choose a valid source: LEDGER, INVOICE or RECEIPT.');
  }
  return source;
}

async function readUpload(request: FastifyRequest): Promise<{ source: ImportSource; fileName: string; buffer: Buffer }> {
  const part = await request.file();
  if (!part) throw new ApiError(400, 'FILE_REQUIRED', 'Attach a CSV file to continue.');
  const source = resolveSource(request, part as unknown as { fields: Record<string, unknown> });
  const fileName = basename(part.filename || 'import.csv');
  if (!/\.csv$/i.test(fileName) && !['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(part.mimetype)) {
    throw new ApiError(415, 'FILE_TYPE_UNSUPPORTED', 'Only CSV files are supported in this pilot.');
  }
  if (part.file.truncated) {
    throw new ApiError(413, 'FILE_TOO_LARGE', `Files are limited to ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`);
  }
  const buffer = await part.toBuffer();
  return { source, fileName, buffer };
}

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/imports', { preHandler: guard() }, async (request, reply) => {
    const paging = readPaging(request.query as Record<string, unknown>);
    const total = one<{ count: number }>('SELECT COUNT(*) AS count FROM import_batches')?.count ?? 0;
    const items = all<Record<string, unknown>>(
      `SELECT b.id, b.source, b.file_name AS fileName, b.checksum, b.row_count AS rowCount,
              b.inserted_count AS insertedCount, b.skipped_count AS skippedCount, b.invalid_count AS invalidCount,
              b.status, b.created_at AS createdAt, b.run_id AS runId, u.name AS importedByName
       FROM import_batches b LEFT JOIN users u ON u.id = b.imported_by
       ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      paging.pageSize,
      paging.offset,
    ).map((row) => ({ ...row, checksum: String(row.checksum).slice(0, 12) }));
    const stats = one<{ batches: number; rows: number; skipped: number; last_at: string | null }>(
      `SELECT COUNT(*) AS batches, COALESCE(SUM(inserted_count), 0) AS rows,
              COALESCE(SUM(skipped_count), 0) AS skipped, MAX(created_at) AS last_at
       FROM import_batches`,
    );
    return reply.send({
      items,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
      stats: {
        batches: stats?.batches ?? 0,
        rows: stats?.rows ?? 0,
        skipped: stats?.skipped ?? 0,
        lastAt: stats?.last_at ?? null,
      },
    });
  });

  app.get('/api/imports/templates/:source', { preHandler: guard() }, async (request, reply) => {
    const source = String((request.params as { source: string }).source).toUpperCase() as ImportSource;
    if (!SOURCES.includes(source)) throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Unknown import template.');
    const template = TEMPLATES[source];
    const csv = `${template.headers.join(',')}\r\n${template.example.join(',')}\r\n`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="laras-${source.toLowerCase()}-template.csv"`)
      .send(csv);
  });

  app.get('/api/imports/samples', { preHandler: guard() }, async (_request, reply) => {
    if (!existsSync(config.seedDir)) return reply.send({ items: [] });
    const items = readdirSync(config.seedDir)
      .filter((name) => name.endsWith('.csv'))
      .map((name) => {
        const path = join(config.seedDir, name);
        const source: ImportSource = name.startsWith('receipt') ? 'RECEIPT' : name.startsWith('invoice') ? 'INVOICE' : 'LEDGER';
        return {
          name,
          source,
          sizeBytes: statSync(path).size,
          label: name
            .replace(/\.csv$/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase()),
        };
      });
    return reply.send({ items });
  });

  app.get('/api/imports/samples/:name', { preHandler: guard() }, async (request, reply) => {
    const name = basename((request.params as { name: string }).name);
    const path = join(config.seedDir, name);
    if (!existsSync(path) || !name.endsWith('.csv')) {
      throw new ApiError(404, 'SAMPLE_NOT_FOUND', 'That sample file is not available.');
    }
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${name}"`)
      .send(readFileSync(path));
  });

  app.post('/api/imports/preview', { preHandler: guard() }, async (request, reply) => {
    const upload = await readUpload(request);
    return reply.send(previewImport(upload.source, upload.fileName, upload.buffer));
  });

  app.post('/api/imports/commit', { preHandler: guard(['ANALYST', 'SUPERVISOR']) }, async (request, reply) => {
    const upload = await readUpload(request);
    const settings = getSettings();
    const outcome = commitImport({
      source: upload.source,
      fileName: upload.fileName,
      buffer: upload.buffer,
      actor: request.user,
      autoRun: settings.autoRunOnImport,
    });
    const run = outcome.runId
      ? one<{ stats_json: string }>('SELECT stats_json FROM runs WHERE id = ?', outcome.runId)
      : undefined;
    return reply.status(outcome.status === 'COMPLETED' ? 201 : 200).send({
      ...outcome,
      run: run ? safeJson(run.stats_json, {}) : null,
    });
  });
}
