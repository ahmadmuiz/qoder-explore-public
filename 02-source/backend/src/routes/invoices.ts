import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { config } from '../config.js';
import { daysBetween, todayIso } from '../lib/dates.js';
import { ApiError, paged, readPaging } from '../lib/http.js';
import { guard } from './helpers.js';

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/invoices', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.status && query.status !== 'ALL') {
      const statuses = query.status.split(',').filter(Boolean);
      clauses.push(`i.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (query.vendor) {
      clauses.push('i.vendor_id = ?');
      params.push(query.vendor);
    }
    if (query.q) {
      clauses.push('(i.invoice_number LIKE ? OR i.description LIKE ? OR v.name LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like);
    }
    if (query.from) {
      clauses.push('i.due_date >= ?');
      params.push(query.from);
    }
    if (query.to) {
      clauses.push('i.due_date <= ?');
      params.push(query.to);
    }
    if (query.attention === 'true') {
      clauses.push("(i.status IN ('EXCEPTION', 'OVERDUE') OR EXISTS (SELECT 1 FROM exceptions e WHERE e.invoice_number = i.invoice_number AND e.status IN ('OPEN', 'IN_REVIEW')))");
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sorts: Record<string, string> = {
      due: 'i.due_date ASC',
      amount: 'i.total_minor DESC',
      recent: 'i.issue_date DESC',
      exceptions: 'openExceptions DESC, i.due_date ASC',
    };
    const order = sorts[query.sort ?? 'due'] ?? sorts.due;

    const total = one<{ count: number }>(
      `SELECT COUNT(*) AS count FROM invoices i JOIN vendors v ON v.id = i.vendor_id ${where}`,
      ...params,
    )?.count ?? 0;

    const items = all(
      `SELECT i.id, i.invoice_number AS invoiceNumber, i.issue_date AS issueDate, i.due_date AS dueDate,
              i.currency, i.subtotal_minor AS subtotalMinor, i.tax_minor AS taxMinor, i.total_minor AS totalMinor,
              i.status, i.payment_ref AS paymentRef, i.description,
              v.id AS vendorId, v.code AS vendorCode, v.name AS vendorName,
              (SELECT l.amount_minor FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id
                WHERE m.invoice_id = i.id LIMIT 1) AS paidMinor,
              (SELECT m.status FROM matches m WHERE m.invoice_id = i.id LIMIT 1) AS matchStatus,
              (SELECT COALESCE(SUM(r.amount_minor), 0) FROM receipts r WHERE r.invoice_number = i.invoice_number) AS receiptTotalMinor,
              (SELECT COUNT(*) FROM receipts r WHERE r.invoice_number = i.invoice_number) AS receiptCount,
              (SELECT COUNT(*) FROM exceptions e WHERE e.invoice_number = i.invoice_number AND e.status IN ('OPEN', 'IN_REVIEW')) AS openExceptions
       FROM invoices i JOIN vendors v ON v.id = i.vendor_id
       ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params,
      paging.pageSize,
      paging.offset,
    );

    return reply.send(paged(items, total, paging));
  });

  app.get('/api/invoices/:invoiceNumber', { preHandler: guard() }, async (request, reply) => {
    const invoiceNumber = decodeURIComponent((request.params as { invoiceNumber: string }).invoiceNumber);
    const invoice = one<Record<string, unknown>>(
      `SELECT i.id, i.invoice_number AS invoiceNumber, i.issue_date AS issueDate, i.due_date AS dueDate,
              i.currency, i.subtotal_minor AS subtotalMinor, i.tax_minor AS taxMinor, i.total_minor AS totalMinor,
              i.status, i.payment_ref AS paymentRef, i.description, i.created_at AS createdAt,
              v.id AS vendorId, v.code AS vendorCode, v.name AS vendorName, v.category AS vendorCategory,
              v.bank_name AS vendorBank, v.account_mask AS vendorAccount
       FROM invoices i JOIN vendors v ON v.id = i.vendor_id WHERE i.invoice_number = ?`,
      invoiceNumber,
    );
    if (!invoice) throw new ApiError(404, 'INVOICE_NOT_FOUND', 'That invoice is not in the register.');

    const id = String(invoice.id);
    const lines = all(
      `SELECT line_no AS lineNo, description, qty, unit_price_minor AS unitPriceMinor, amount_minor AS amountMinor
       FROM invoice_lines WHERE invoice_id = ? ORDER BY line_no`,
      id,
    );
    const lineTotal = (lines as Array<{ amountMinor: number }>).reduce((total, line) => total + line.amountMinor, 0);
    const match = one<Record<string, unknown>>(
      `SELECT m.status, m.amount_delta_minor AS deltaMinor, m.confidence, m.matched_at AS matchedAt,
              l.id AS ledgerId, l.transaction_id AS transactionId, l.value_date AS valueDate,
              l.amount_minor AS amountMinor, l.account_mask AS accountMask, l.channel, l.description AS ledgerDescription
       FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.invoice_id = ? LIMIT 1`,
      id,
    );
    const receipts = all<Record<string, unknown>>(
      `SELECT r.id, r.receipt_number AS receiptNumber, r.amount_minor AS amountMinor, r.currency,
              r.received_date AS receivedDate, r.attachment_id AS attachmentId,
              a.file_name AS fileName, a.mime AS attachmentMime
       FROM receipts r LEFT JOIN attachments a ON a.id = r.attachment_id
       WHERE r.invoice_number = ? ORDER BY r.received_date`,
      invoiceNumber,
    );
    const attachments = all(
      `SELECT id, kind, file_name AS fileName, mime, size_bytes AS sizeBytes, declared_amount_minor AS declaredAmountMinor,
              linked_exception_id AS linkedExceptionId, created_at AS createdAt
       FROM attachments WHERE linked_invoice_number = ? ORDER BY created_at DESC`,
      invoiceNumber,
    );
    const exceptions = all(
      `SELECT id, type, severity, status, title, amount_minor AS amountMinor, delta_minor AS deltaMinor, created_at AS createdAt
       FROM exceptions WHERE invoice_number = ? ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END, created_at DESC`,
      invoiceNumber,
    );

    const subtotal = Number(invoice.subtotalMinor);
    const tax = Number(invoice.taxMinor);
    const total = Number(invoice.totalMinor);
    const receiptTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.amountMinor), 0);
    const paid = match ? Number(match.amountMinor) : 0;
    const formulaDelta = subtotal + tax - total;
    const lineDelta = lines.length > 0 ? lineTotal - subtotal : 0;
    const receiptDelta = receipts.length > 0 ? receiptTotal - total : 0;
    const paymentDelta = match ? paid - total : 0;

    const checks = [
      {
        key: 'formula',
        label: 'Subtotal + PPN equals stated total',
        expectedMinor: total,
        actualMinor: subtotal + tax,
        deltaMinor: formulaDelta,
        state: formulaDelta === 0 ? 'pass' : 'fail',
      },
      {
        key: 'lines',
        label: 'Invoice lines sum to subtotal',
        expectedMinor: subtotal,
        actualMinor: lineTotal,
        deltaMinor: lineDelta,
        state: lines.length === 0 ? 'skipped' : lineDelta === 0 ? 'pass' : 'fail',
      },
      {
        key: 'payment',
        label: 'Ledger payment matches invoice total',
        expectedMinor: total,
        actualMinor: paid,
        deltaMinor: paymentDelta,
        state: !match ? 'pending' : paymentDelta === 0 ? 'pass' : 'fail',
      },
      {
        key: 'receipts',
        label: 'Kuitansi total matches invoice total',
        expectedMinor: total,
        actualMinor: receiptTotal,
        deltaMinor: receiptDelta,
        state: receipts.length === 0 ? 'skipped' : receiptDelta === 0 ? 'pass' : 'fail',
      },
    ];
    const failing = checks.filter((check) => check.state === 'fail').length;
    const today = todayIso(new Date(`${config.today}T00:00:00Z`));
    const overdueDays = invoice.status !== 'PAID' ? Math.max(0, daysBetween(String(invoice.dueDate), today)) : 0;

    return reply.send({
      invoice,
      vendor: {
        id: invoice.vendorId,
        code: invoice.vendorCode,
        name: invoice.vendorName,
        category: invoice.vendorCategory,
        bankName: invoice.vendorBank,
        accountMask: invoice.vendorAccount,
      },
      lines,
      match: match ?? null,
      receipts,
      attachments,
      exceptions,
      integrity: {
        status: failing > 0 || exceptions.some((exception) => (exception as { status: string }).status !== 'RESOLVED') ? 'ATTENTION' : 'VERIFIED',
        failing,
        subtotalMinor: subtotal,
        taxMinor: tax,
        totalMinor: total,
        lineTotalMinor: lineTotal,
        receiptTotalMinor: receiptTotal,
        paidMinor: paid,
        checks,
      },
      overdueDays,
    });
  });
}
