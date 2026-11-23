import type { FastifyInstance } from 'fastify';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { z } from 'zod';
import { all, one, run } from '../db/index.js';
import { config } from '../config.js';
import { ApiError } from '../lib/http.js';
import { newId, sha256Hex } from '../lib/ids.js';
import { parseAmountToMinor } from '../lib/money.js';
import { nowIso } from '../lib/dates.js';
import { writeAudit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { runReconciliation } from '../domain/engine.js';
import { guard } from './helpers.js';

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

const kindSchema = z.enum(['RECEIPT', 'INVOICE', 'EVIDENCE']);

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/attachments', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.invoiceNumber) {
      clauses.push('linked_invoice_number = ?');
      params.push(query.invoiceNumber);
    }
    if (query.exceptionId) {
      clauses.push('linked_exception_id = ?');
      params.push(query.exceptionId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const items = all(
      `SELECT id, kind, file_name AS fileName, mime, size_bytes AS sizeBytes, declared_amount_minor AS declaredAmountMinor,
              linked_invoice_number AS linkedInvoiceNumber, linked_exception_id AS linkedExceptionId, created_at AS createdAt
       FROM attachments ${where} ORDER BY created_at DESC LIMIT 100`,
      ...params,
    );
    return reply.send({ items });
  });

  app.get('/api/attachments/:id/meta', { preHandler: guard() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const attachment = one(
      `SELECT id, kind, file_name AS fileName, mime, size_bytes AS sizeBytes, sha256,
              declared_amount_minor AS declaredAmountMinor, linked_invoice_number AS linkedInvoiceNumber,
              linked_transaction_ref AS linkedTransactionRef, linked_exception_id AS linkedExceptionId,
              created_at AS createdAt
       FROM attachments WHERE id = ?`,
      id,
    );
    if (!attachment) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'That document does not exist.');
    return reply.send({ attachment });
  });

  app.get('/api/attachments/:id/file', { preHandler: guard() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const attachment = one<{ file_name: string; mime: string; storage_path: string }>(
      'SELECT file_name, mime, storage_path FROM attachments WHERE id = ?',
      id,
    );
    if (!attachment) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'That document does not exist.');
    if (!existsSync(attachment.storage_path)) {
      throw new ApiError(410, 'ATTACHMENT_MISSING', 'The stored file is no longer available.');
    }
    const safeName = attachment.file_name.replace(/["\r\n]/g, '');
    return reply
      .header('content-type', attachment.mime)
      .header('content-disposition', `inline; filename="${safeName}"`)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=300')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
      .send(readFileSync(attachment.storage_path));
  });

  app.post('/api/attachments', { preHandler: guard(['ANALYST', 'SUPERVISOR']) }, async (request, reply) => {
    const part = await request.file();
    if (!part) throw new ApiError(400, 'FILE_REQUIRED', 'Choose a document to upload.');
    const fields = (part.fields ?? {}) as Record<string, { value?: unknown } | undefined>;
    const valueOf = (key: string): string | undefined => {
      const field = fields[key];
      const value = field?.value;
      return value === undefined || value === null ? undefined : String(value);
    };
    const kind = kindSchema.safeParse(valueOf('kind') ?? 'EVIDENCE');
    if (!kind.success) throw new ApiError(422, 'KIND_INVALID', 'Document kind must be RECEIPT, INVOICE or EVIDENCE.');
    const mime = part.mimetype;
    const extension = MIME_EXT[mime];
    if (!extension) throw new ApiError(415, 'FILE_TYPE_UNSUPPORTED', 'Upload a PDF, PNG, JPG, WEBP or SVG document.');
    if (part.file.truncated) throw new ApiError(413, 'FILE_TOO_LARGE', 'Documents are limited to 8 MB.');

    const buffer = await part.toBuffer();
    const hash = sha256Hex(buffer);
    const existing = one<Record<string, unknown>>(
      `SELECT id, kind, file_name AS fileName, mime, size_bytes AS sizeBytes, sha256,
              declared_amount_minor AS declaredAmountMinor, linked_invoice_number AS linkedInvoiceNumber,
              linked_exception_id AS linkedExceptionId, created_at AS createdAt
       FROM attachments WHERE sha256 = ?`,
      hash,
    );
    const invoiceNumber = valueOf('invoiceNumber') || null;
    const exceptionId = valueOf('exceptionId') || null;
    const transactionRef = valueOf('transactionRef') || null;
    const declaredRaw = valueOf('declaredAmount');
    const declaredAmountMinor = declaredRaw ? parseAmountToMinor(declaredRaw) : null;
    if (declaredRaw && (declaredAmountMinor === null || declaredAmountMinor < 0)) {
      throw new ApiError(422, 'DECLARED_AMOUNT_INVALID', 'Declared nominal must be a positive amount.');
    }
    if (exceptionId) {
      const exception = one('SELECT id FROM exceptions WHERE id = ?', exceptionId);
      if (!exception) throw new ApiError(422, 'EXCEPTION_INVALID', 'Linked exception does not exist.');
    }

    if (existing) {
      const id = String(existing.id);
      if (exceptionId) {
        run(
          `UPDATE attachments SET linked_exception_id = COALESCE(linked_exception_id, ?),
             linked_invoice_number = COALESCE(linked_invoice_number, ?)
           WHERE id = ?`,
          exceptionId,
          invoiceNumber,
          id,
        );
      }
      writeAudit({
        actorId: request.user.id,
        actorName: request.user.name,
        action: 'ATTACHMENT_REUSED',
        entityType: 'ATTACHMENT',
        entityId: id,
        summary: `Duplicate document detected by SHA-256 and reused: ${String(existing.fileName)}.`,
        meta: { sha256: hash },
      });
      return reply.send({ attachment: existing, duplicate: true, runId: null });
    }

    const now = nowIso();
    const folder = now.slice(0, 7);
    const directory = join(config.uploadsDir, folder);
    mkdirSync(directory, { recursive: true });
    const storagePath = join(directory, `${hash}.${extension}`);
    writeFileSync(storagePath, buffer);
    const id = newId('att');
    const fileName = part.filename || `document.${extension}`;

    run(
      `INSERT INTO attachments (id, kind, file_name, mime, size_bytes, sha256, storage_path, declared_amount_minor,
        linked_invoice_number, linked_transaction_ref, linked_exception_id, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      kind.data,
      fileName,
      mime,
      buffer.length,
      hash,
      storagePath,
      declaredAmountMinor,
      invoiceNumber,
      transactionRef,
      exceptionId,
      request.user.id,
      now,
    );

    writeAudit({
      actorId: request.user.id,
      actorName: request.user.name,
      action: 'ATTACHMENT_UPLOADED',
      entityType: 'ATTACHMENT',
      entityId: id,
      summary: `${kind.data} document uploaded: ${fileName}${invoiceNumber ? ` for ${invoiceNumber}` : ''}.`,
      meta: { sha256: hash, sizeBytes: buffer.length, declaredAmountMinor, exceptionId },
    });

    let runId: string | null = null;
    if (kind.data === 'RECEIPT' && declaredAmountMinor !== null && invoiceNumber && getSettings().autoRunOnImport) {
      runId = runReconciliation({ trigger: 'ATTACHMENT', actor: request.user }).runId;
    }

    return reply.status(201).send({
      attachment: {
        id,
        kind: kind.data,
        fileName,
        mime,
        sizeBytes: buffer.length,
        sha256: hash,
        declaredAmountMinor,
        linkedInvoiceNumber: invoiceNumber,
        linkedExceptionId: exceptionId,
        createdAt: now,
      },
      duplicate: false,
      runId,
    });
  });
}
