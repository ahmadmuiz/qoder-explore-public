import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { ApiError, paged, readPaging } from '../lib/http.js';
import { guard } from './helpers.js';

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/transactions', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.status && query.status !== 'ALL') {
      const statuses = query.status.split(',').filter(Boolean);
      clauses.push(`l.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (query.vendor) {
      clauses.push('l.vendor_id = ?');
      params.push(query.vendor);
    }
    if (query.from) {
      clauses.push('l.value_date >= ?');
      params.push(query.from);
    }
    if (query.to) {
      clauses.push('l.value_date <= ?');
      params.push(query.to);
    }
    if (query.q) {
      clauses.push('(l.transaction_id LIKE ? OR l.invoice_number LIKE ? OR l.description LIKE ? OR v.name LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sorts: Record<string, string> = {
      newest: 'l.value_date DESC, l.created_at DESC',
      oldest: 'l.value_date ASC',
      amount: 'l.amount_minor DESC',
    };
    const order = sorts[query.sort ?? 'newest'] ?? sorts.newest;

    const total = one<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ledger_transactions l LEFT JOIN vendors v ON v.id = l.vendor_id ${where}`,
      ...params,
    )?.count ?? 0;

    const items = all(
      `SELECT l.id, l.transaction_id AS transactionId, l.amount_minor AS amountMinor, l.currency,
              l.value_date AS valueDate, l.vendor_id AS vendorId, v.name AS vendorName, v.code AS vendorCode,
              l.invoice_number AS invoiceNumber, l.account_mask AS accountMask, l.channel, l.description, l.status,
              (SELECT i.invoice_number FROM matches m JOIN invoices i ON i.id = m.invoice_id WHERE m.ledger_id = l.id LIMIT 1) AS matchedInvoiceNumber,
              (SELECT m.status FROM matches m WHERE m.ledger_id = l.id LIMIT 1) AS matchStatus,
              (SELECT COUNT(*) FROM exceptions e WHERE e.transaction_ref = l.transaction_id AND e.status IN ('OPEN', 'IN_REVIEW')) AS openExceptions
       FROM ledger_transactions l LEFT JOIN vendors v ON v.id = l.vendor_id
       ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params,
      paging.pageSize,
      paging.offset,
    );

    return reply.send(paged(items, total, paging));
  });

  app.get('/api/transactions/:id', { preHandler: guard() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const transaction = one<Record<string, unknown>>(
      `SELECT l.id, l.transaction_id AS transactionId, l.normalized_ref AS normalizedRef, l.amount_minor AS amountMinor,
              l.currency, l.value_date AS valueDate, l.vendor_id AS vendorId, v.name AS vendorName, v.code AS vendorCode,
              l.invoice_number AS invoiceNumber, l.account_mask AS accountMask, l.channel, l.description, l.status,
              l.created_at AS createdAt, b.file_name AS batchFile, b.created_at AS importedAt
       FROM ledger_transactions l
       LEFT JOIN vendors v ON v.id = l.vendor_id
       LEFT JOIN import_batches b ON b.id = l.batch_id
       WHERE l.id = ?`,
      id,
    );
    if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'That ledger entry does not exist.');
    const match = one<Record<string, unknown>>(
      `SELECT m.status, m.amount_delta_minor AS deltaMinor, m.confidence,
              i.invoice_number AS invoiceNumber, i.id AS invoiceId, i.total_minor AS invoiceTotalMinor,
              i.due_date AS dueDate, i.status AS invoiceStatus, i.payment_ref AS paymentRef
       FROM matches m JOIN invoices i ON i.id = m.invoice_id WHERE m.ledger_id = ? LIMIT 1`,
      id,
    );
    const exceptions = all(
      `SELECT id, type, severity, status, title, invoice_number AS invoiceNumber, amount_minor AS amountMinor,
              delta_minor AS deltaMinor, created_at AS createdAt
       FROM exceptions WHERE transaction_ref = ? ORDER BY created_at DESC`,
      String(transaction.transactionId),
    );
    const relatedPayments = all(
      `SELECT id, transaction_id AS transactionId, amount_minor AS amountMinor, value_date AS valueDate,
              account_mask AS accountMask, status
       FROM ledger_transactions WHERE normalized_ref = ? AND id != ? ORDER BY value_date`,
      String(transaction.normalizedRef),
      id,
    );
    return reply.send({ transaction, match: match ?? null, exceptions, relatedPayments });
  });
}
