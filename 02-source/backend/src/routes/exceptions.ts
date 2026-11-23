import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, one, run } from '../db/index.js';
import { addDays, nowIso } from '../lib/dates.js';
import { ApiError, paged, readPaging, safeJson } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { writeAudit } from '../lib/audit.js';
import { guard, parseBody } from './helpers.js';

const riskExpr = (prefix = '') =>
  `CASE WHEN ${prefix}type IN ('DUPLICATE_PAYMENT', 'MISSING_PAYMENT', 'UNALLOCATED_PAYMENT') THEN ${prefix}amount_minor ELSE ABS(${prefix}delta_minor) END`;

const RESOLUTION_CODES = [
  'CONFIRMED_DUPLICATE',
  'REFUND_INITIATED',
  'ADJUSTED',
  'EVIDENCE_ACCEPTED',
  'WRITTEN_OFF',
  'FALSE_POSITIVE',
  'ESCALATED',
] as const;

const patchSchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'IGNORED']).optional(),
  resolutionCode: z.enum(RESOLUTION_CODES).optional(),
  note: z.string().max(2000).optional(),
  assigneeId: z.string().nullable().optional(),
});

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  assigneeId: z.string().min(1),
});

interface ExceptionRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  transactionRef: string | null;
  invoiceNumber: string | null;
  amountMinor: number;
  deltaMinor: number;
  currency: string;
  vendorId: string | null;
  assigneeId: string | null;
  resolutionCode: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  detailJson: string;
}

function getException(id: string): ExceptionRow | undefined {
  return one<ExceptionRow>(
    `SELECT e.id, e.type, e.severity, e.status, e.title, e.transaction_ref AS transactionRef,
            e.invoice_number AS invoiceNumber, e.amount_minor AS amountMinor, e.delta_minor AS deltaMinor,
            e.currency, e.vendor_id AS vendorId, e.assignee_id AS assigneeId, e.resolution_code AS resolutionCode,
            e.resolution_note AS resolutionNote, e.created_at AS createdAt, e.updated_at AS updatedAt,
            e.resolved_at AS resolvedAt, e.detail_json AS detailJson
     FROM exceptions e WHERE e.id = ?`,
    id,
  );
}

function invoiceDetail(invoiceNumber: string) {
  const invoice = one(
    `SELECT i.id, i.invoice_number AS invoiceNumber, i.issue_date AS issueDate, i.due_date AS dueDate,
            i.currency, i.subtotal_minor AS subtotalMinor, i.tax_minor AS taxMinor, i.total_minor AS totalMinor,
            i.status, i.payment_ref AS paymentRef, i.description,
            v.id AS vendorId, v.code AS vendorCode, v.name AS vendorName, v.category AS vendorCategory,
            v.bank_name AS vendorBank, v.account_mask AS vendorAccount
     FROM invoices i JOIN vendors v ON v.id = i.vendor_id WHERE i.invoice_number = ?`,
    invoiceNumber,
  ) as Record<string, unknown> | undefined;
  if (!invoice) return null;
  const id = String(invoice.id);
  const lines = all(
    `SELECT line_no AS lineNo, description, qty, unit_price_minor AS unitPriceMinor, amount_minor AS amountMinor
     FROM invoice_lines WHERE invoice_id = ? ORDER BY line_no`,
    id,
  );
  const receipts = all(
    `SELECT r.id, r.receipt_number AS receiptNumber, r.amount_minor AS amountMinor, r.currency,
            r.received_date AS receivedDate, r.attachment_id AS attachmentId,
            a.file_name AS fileName, a.sha256 AS attachmentSha
     FROM receipts r LEFT JOIN attachments a ON a.id = r.attachment_id
     WHERE r.invoice_number = ? ORDER BY r.received_date`,
    invoiceNumber,
  );
  const match = one(
    `SELECT m.status, m.amount_delta_minor AS deltaMinor, m.confidence,
            l.id AS ledgerId, l.transaction_id AS transactionId, l.value_date AS valueDate,
            l.amount_minor AS amountMinor, l.account_mask AS accountMask, l.channel
     FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.invoice_id = ? LIMIT 1`,
    id,
  );
  return { ...invoice, lines, receipts, match: match ?? null };
}

export async function exceptionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/exceptions', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    const status = query.status ?? 'ACTIVE';
    if (status === 'ACTIVE') clauses.push("e.status IN ('OPEN', 'IN_REVIEW')");
    else if (status !== 'ALL') {
      const statuses = status.split(',').filter(Boolean);
      clauses.push(`e.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (query.type) {
      const types = query.type.split(',').filter(Boolean);
      clauses.push(`e.type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    if (query.severity) {
      const severities = query.severity.split(',').filter(Boolean);
      clauses.push(`e.severity IN (${severities.map(() => '?').join(',')})`);
      params.push(...severities);
    }
    if (query.vendor) {
      clauses.push('e.vendor_id = ?');
      params.push(query.vendor);
    }
    if (query.assignee === 'me') {
      clauses.push('e.assignee_id = ?');
      params.push(request.user.id);
    } else if (query.assignee === 'unassigned') {
      clauses.push('e.assignee_id IS NULL');
    } else if (query.assignee) {
      clauses.push('e.assignee_id = ?');
      params.push(query.assignee);
    }
    if (query.q) {
      clauses.push('(e.title LIKE ? OR e.invoice_number LIKE ? OR e.transaction_ref LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sorts: Record<string, string> = {
      risk: `CASE e.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, ${riskExpr('e.')} DESC`,
      newest: 'e.created_at DESC',
      oldest: 'e.created_at ASC',
      amount: 'e.amount_minor DESC',
      updated: 'e.updated_at DESC',
    };
    const order = sorts[query.sort ?? 'risk'] ?? sorts.risk;

    const total = one<{ count: number }>(`SELECT COUNT(*) AS count FROM exceptions e ${where}`, ...params)?.count ?? 0;
    const items = all(
      `SELECT e.id, e.type, e.severity, e.status, e.title, e.transaction_ref AS transactionRef,
              e.invoice_number AS invoiceNumber, e.amount_minor AS amountMinor, e.delta_minor AS deltaMinor,
              e.currency, e.created_at AS createdAt, e.updated_at AS updatedAt, e.resolved_at AS resolvedAt,
              e.resolution_code AS resolutionCode, e.assignee_id AS assigneeId,
              v.id AS vendorId, v.name AS vendorName, v.code AS vendorCode,
              u.name AS assigneeName, e.detail_json AS detailJson
       FROM exceptions e
       LEFT JOIN vendors v ON v.id = e.vendor_id
       LEFT JOIN users u ON u.id = e.assignee_id
       ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params,
      paging.pageSize,
      paging.offset,
    ).map((row) => {
      const item = row as Record<string, unknown>;
      const detail = safeJson<Record<string, unknown>>(String(item.detailJson ?? '{}'), {});
      delete item.detailJson;
      return { ...item, reason: detail.reason ?? null };
    });

    return reply.send(paged(items, total, paging));
  });

  app.get('/api/exceptions/summary', { preHandler: guard() }, async (_request, reply) => {
    const groups = all<{ type: string; status: string; count: number; value_minor: number }>(
      `SELECT type, status, COUNT(*) AS count, COALESCE(SUM(${riskExpr()}), 0) AS value_minor
       FROM exceptions GROUP BY type, status`,
    );
    const byType = new Map<string, { type: string; open: number; inReview: number; resolved: number; ignored: number; valueMinor: number }>();
    for (const group of groups) {
      const entry = byType.get(group.type) ?? { type: group.type, open: 0, inReview: 0, resolved: 0, ignored: 0, valueMinor: 0 };
      if (group.status === 'OPEN') entry.open += group.count;
      else if (group.status === 'IN_REVIEW') entry.inReview += group.count;
      else if (group.status === 'RESOLVED') entry.resolved += group.count;
      else entry.ignored += group.count;
      if (group.status === 'OPEN' || group.status === 'IN_REVIEW') entry.valueMinor += group.value_minor;
      byType.set(group.type, entry);
    }
    const totals = one<{ open: number; in_review: number; resolved: number; value_minor: number; assigned: number }>(
      `SELECT
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'IN_REVIEW' THEN 1 ELSE 0 END) AS in_review,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
        COALESCE(SUM(CASE WHEN status IN ('OPEN', 'IN_REVIEW') THEN ${riskExpr()} ELSE 0 END), 0) AS value_minor,
        SUM(CASE WHEN assignee_id IS NOT NULL AND status IN ('OPEN', 'IN_REVIEW') THEN 1 ELSE 0 END) AS assigned
       FROM exceptions`,
    );
    return reply.send({
      types: [...byType.values()],
      totals: {
        open: totals?.open ?? 0,
        inReview: totals?.in_review ?? 0,
        resolved: totals?.resolved ?? 0,
        valueMinor: totals?.value_minor ?? 0,
        assigned: totals?.assigned ?? 0,
      },
    });
  });

  app.get('/api/exceptions/:id', { preHandler: guard() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const exception = getException(id);
    if (!exception) throw new ApiError(404, 'EXCEPTION_NOT_FOUND', 'That exception does not exist.');
    const detail = safeJson<Record<string, unknown>>(exception.detailJson, {});
    delete (exception as unknown as Record<string, unknown>).detailJson;
    const vendor = exception.vendorId
      ? one('SELECT id, code, name, category, bank_name AS bankName, account_mask AS accountMask FROM vendors WHERE id = ?', exception.vendorId)
      : null;
    const assignee = exception.assigneeId
      ? one('SELECT id, name, role, title FROM users WHERE id = ?', exception.assigneeId)
      : null;
    const invoice = exception.invoiceNumber ? invoiceDetail(exception.invoiceNumber) : null;
    const attachments = all(
      `SELECT id, kind, file_name AS fileName, mime, size_bytes AS sizeBytes, declared_amount_minor AS declaredAmountMinor,
              linked_invoice_number AS linkedInvoiceNumber, created_at AS createdAt
       FROM attachments
       WHERE linked_exception_id = ? OR (linked_invoice_number IS NOT NULL AND linked_invoice_number = ?)
       ORDER BY created_at DESC`,
      exception.id,
      exception.invoiceNumber,
    );
    const history = all(
      `SELECT at, actor_name AS actorName, action, summary FROM audit_events
       WHERE entity_id = ? ORDER BY at DESC LIMIT 25`,
      exception.id,
    );

    const evidenceLedger = exception.transactionRef
      ? all(
          `SELECT l.id, l.transaction_id AS transactionId, l.amount_minor AS amountMinor, l.currency,
                  l.value_date AS valueDate, l.account_mask AS accountMask, l.channel, l.description, l.status
           FROM ledger_transactions l WHERE l.transaction_id = ? ORDER BY l.value_date`,
          exception.transactionRef,
        )
      : [];
    const relatedLedger =
      exception.type === 'DUPLICATE_PAYMENT'
        ? all(
            `SELECT l.id, l.transaction_id AS transactionId, l.amount_minor AS amountMinor, l.value_date AS valueDate,
                    l.account_mask AS accountMask, l.channel, l.status
             FROM ledger_transactions l
             WHERE l.normalized_ref = (SELECT normalized_ref FROM ledger_transactions WHERE transaction_id = ? LIMIT 1)
             ORDER BY l.value_date`,
            exception.transactionRef,
          )
        : [];

    let suggestions: Array<Record<string, unknown>> = [];
    if (exception.type === 'MISSING_PAYMENT' && invoice) {
      const total = Number((invoice as Record<string, unknown>).totalMinor);
      const dueDate = String((invoice as Record<string, unknown>).dueDate);
      suggestions = all(
        `SELECT l.id, l.transaction_id AS transactionId, l.amount_minor AS amountMinor, l.value_date AS valueDate,
                l.invoice_number AS invoiceNumber, l.channel, ABS(l.amount_minor - ?) AS amountDiff,
                v.name AS vendorName
         FROM ledger_transactions l LEFT JOIN vendors v ON v.id = l.vendor_id
         WHERE l.currency = ? AND l.amount_minor BETWEEN ? AND ?
           AND l.value_date BETWEEN ? AND ?
         ORDER BY amountDiff ASC, ABS(julianday(l.value_date) - julianday(?)) ASC LIMIT 5`,
        total,
        String((invoice as Record<string, unknown>).currency),
        Math.floor(total * 0.99),
        Math.ceil(total * 1.01),
        addDays(dueDate, -30),
        addDays(dueDate, 30),
        dueDate,
      ).map((row) => {
        const candidate = row as Record<string, unknown>;
        const amountDiff = Number(candidate.amountDiff);
        const score = Math.max(40, 100 - Math.round((amountDiff / total) * 1000));
        return { ...candidate, score, source: 'ledger' };
      });
    }
    if (exception.type === 'UNALLOCATED_PAYMENT') {
      suggestions = all(
        `SELECT i.invoice_number AS invoiceNumber, i.due_date AS dueDate, i.total_minor AS amountMinor,
                i.status, v.name AS vendorName, ABS(i.total_minor - ?) AS amountDiff
         FROM invoices i JOIN vendors v ON v.id = i.vendor_id
         WHERE i.currency = ? AND i.total_minor BETWEEN ? AND ?
         ORDER BY amountDiff ASC LIMIT 5`,
        exception.amountMinor,
        exception.currency,
        Math.floor(exception.amountMinor * 0.98),
        Math.ceil(exception.amountMinor * 1.02),
      ).map((row) => {
        const candidate = row as Record<string, unknown>;
        const amountDiff = Number(candidate.amountDiff);
        const score = Math.max(40, 100 - Math.round((amountDiff / Math.max(1, exception.amountMinor)) * 500));
        return { ...candidate, score, source: 'invoice' };
      });
    }

    return reply.send({
      exception,
      detail,
      vendor,
      assignee,
      invoice,
      attachments,
      history,
      evidenceLedger,
      relatedLedger,
      suggestions,
    });
  });

  app.patch('/api/exceptions/:id', { preHandler: guard(['ANALYST', 'SUPERVISOR']) }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = parseBody(patchSchema, request.body);
    const current = getException(id);
    if (!current) throw new ApiError(404, 'EXCEPTION_NOT_FOUND', 'That exception does not exist.');
    const settings = getSettings();
    const now = nowIso();
    const note = body.note?.trim() ?? '';
    const nextStatus = body.status ?? current.status;

    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      const target = one<{ id: string }>('SELECT id FROM users WHERE id = ?', body.assigneeId);
      if (!target) throw new ApiError(422, 'ASSIGNEE_INVALID', 'That assignee does not exist.');
    }

    if (nextStatus === 'RESOLVED') {
      if (!body.resolutionCode) throw new ApiError(422, 'RESOLUTION_REQUIRED', 'Choose a resolution code.');
      if (note.length < 8) throw new ApiError(422, 'NOTE_REQUIRED', 'Add a resolution note of at least 8 characters.');
      if (
        request.user.role === 'ANALYST' &&
        current.amountMinor >= settings.approvalThresholdMinor &&
        (body.resolutionCode === 'WRITTEN_OFF' || body.resolutionCode === 'ADJUSTED')
      ) {
        throw new ApiError(403, 'SUPERVISOR_APPROVAL_REQUIRED', 'This value requires supervisor approval.');
      }
    }
    if (nextStatus === 'IGNORED' && note.length < 8) {
      throw new ApiError(422, 'NOTE_REQUIRED', 'Explain why this exception is ignored (min. 8 characters).');
    }
    if (current.status === 'RESOLVED' && nextStatus === 'OPEN' && request.user.role === 'AUDITOR') {
      throw new ApiError(403, 'FORBIDDEN', 'Auditors cannot reopen exceptions.');
    }

    const assigneeId =
      body.assigneeId !== undefined
        ? body.assigneeId
        : nextStatus === 'IN_REVIEW' && !current.assigneeId
          ? request.user.id
          : current.assigneeId;
    const isResolving = nextStatus === 'RESOLVED';
    const isReopening = (current.status === 'RESOLVED' || current.status === 'IGNORED') && nextStatus !== current.status;

    run(
      `UPDATE exceptions SET
         status = ?,
         assignee_id = ?,
         resolution_code = ?,
         resolution_note = ?,
         resolved_by = ?,
         resolved_at = ?,
         updated_at = ?
       WHERE id = ?`,
      nextStatus,
      assigneeId,
      isResolving ? body.resolutionCode : null,
      isResolving || nextStatus === 'IGNORED' ? note : isReopening ? note : current.resolutionNote,
      isResolving ? request.user.id : null,
      isResolving ? now : null,
      now,
      id,
    );

    writeAudit({
      actorId: request.user.id,
      actorName: request.user.name,
      action: isResolving ? 'EXCEPTION_RESOLVED' : isReopening ? 'EXCEPTION_REOPENED' : 'EXCEPTION_UPDATED',
      entityType: 'EXCEPTION',
      entityId: id,
      summary: `${current.title} → ${nextStatus}${body.resolutionCode ? ` (${body.resolutionCode})` : ''}`,
      meta: { previousStatus: current.status, nextStatus, resolutionCode: body.resolutionCode ?? null, note },
    });

    return reply.send({ ok: true, exception: getException(id) });
  });

  app.post('/api/exceptions/bulk-assign', { preHandler: guard(['ANALYST', 'SUPERVISOR']) }, async (request, reply) => {
    const body = parseBody(bulkSchema, request.body);
    const target = one<{ id: string; name: string }>('SELECT id, name FROM users WHERE id = ?', body.assigneeId);
    if (!target) throw new ApiError(422, 'ASSIGNEE_INVALID', 'That assignee does not exist.');
    const placeholders = body.ids.map(() => '?').join(',');
    const result = run(
      `UPDATE exceptions SET assignee_id = ?, status = CASE WHEN status = 'OPEN' THEN 'IN_REVIEW' ELSE status END, updated_at = ?
       WHERE id IN (${placeholders}) AND status IN ('OPEN', 'IN_REVIEW')`,
      body.assigneeId,
      nowIso(),
      ...body.ids,
    );
    writeAudit({
      actorId: request.user.id,
      actorName: request.user.name,
      action: 'EXCEPTION_BULK_ASSIGNED',
      entityType: 'EXCEPTION',
      entityId: null,
      summary: `${result.changes} exception(s) assigned to ${target.name}.`,
      meta: { ids: body.ids, assigneeId: body.assigneeId },
    });
    return reply.send({ ok: true, updated: result.changes, assignee: target });
  });
}
