import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { config } from '../config.js';
import { addDays } from '../lib/dates.js';
import { toCsv } from '../lib/csv.js';
import { guard } from './helpers.js';

const riskExpr = (prefix = '') =>
  `CASE WHEN ${prefix}type IN ('DUPLICATE_PAYMENT', 'MISSING_PAYMENT', 'UNALLOCATED_PAYMENT') THEN ${prefix}amount_minor ELSE ABS(${prefix}delta_minor) END`;

function period(query: Record<string, string | undefined>) {
  const to = query.to ?? config.today;
  const from = query.from ?? addDays(to, -90);
  return { from, to };
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/reports/close-pack', { preHandler: guard(['ANALYST', 'SUPERVISOR', 'AUDITOR']) }, async (request, reply) => {
    const { from, to } = period(request.query as Record<string, string | undefined>);
    const rows = all<Record<string, unknown>>(
      `SELECT i.invoice_number, v.code AS vendor_code, v.name AS vendor_name, i.issue_date, i.due_date, i.currency,
              i.subtotal_minor, i.tax_minor, i.total_minor, i.status, i.payment_ref,
              (SELECT l.transaction_id FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.invoice_id = i.id LIMIT 1) AS matched_ref,
              (SELECT l.value_date FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.invoice_id = i.id LIMIT 1) AS matched_date,
              COALESCE((SELECT l.amount_minor FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.invoice_id = i.id LIMIT 1), 0) AS paid_minor,
              COALESCE((SELECT SUM(r.amount_minor) FROM receipts r WHERE r.invoice_number = i.invoice_number), 0) AS receipt_total_minor,
              (SELECT COUNT(*) FROM exceptions e WHERE e.invoice_number = i.invoice_number AND e.status IN ('OPEN', 'IN_REVIEW')) AS open_exceptions
       FROM invoices i JOIN vendors v ON v.id = i.vendor_id
       WHERE i.issue_date BETWEEN ? AND ?
       ORDER BY i.invoice_number`,
      from,
      to,
    );
    const csvRows = rows.map((row) => {
      const total = Number(row.total_minor);
      const paid = Number(row.paid_minor);
      const receipt = Number(row.receipt_total_minor);
      return {
        invoice_number: row.invoice_number,
        vendor_code: row.vendor_code,
        vendor_name: row.vendor_name,
        issue_date: row.issue_date,
        due_date: row.due_date,
        currency: row.currency,
        subtotal_idr: Number(row.subtotal_minor) / 100,
        tax_idr: Number(row.tax_minor) / 100,
        total_idr: total / 100,
        status: row.status,
        payment_ref: row.payment_ref ?? '',
        matched_ref: row.matched_ref ?? '',
        matched_date: row.matched_date ?? '',
        paid_idr: paid / 100,
        payment_variance_idr: (paid - total) / 100,
        receipt_total_idr: receipt / 100,
        receipt_variance_idr: (receipt - total) / 100,
        open_exceptions: row.open_exceptions,
      };
    });
    const columns = Object.keys(csvRows[0] ?? {
      invoice_number: '',
      vendor_code: '',
      vendor_name: '',
      issue_date: '',
      due_date: '',
      currency: '',
      subtotal_idr: '',
      tax_idr: '',
      total_idr: '',
      status: '',
      payment_ref: '',
      matched_ref: '',
      matched_date: '',
      paid_idr: '',
      payment_variance_idr: '',
      receipt_total_idr: '',
      receipt_variance_idr: '',
      open_exceptions: '',
    });
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="laras-close-pack-${from}-to-${to}.csv"`)
      .send(toCsv(csvRows, columns));
  });

  app.get('/api/reports/exceptions.csv', { preHandler: guard(['ANALYST', 'SUPERVISOR', 'AUDITOR']) }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const status = query.status ?? 'ALL';
    const clause = status === 'ALL' ? '' : 'WHERE e.status = ?';
    const params = status === 'ALL' ? [] : [status];
    const rows = all<Record<string, unknown>>(
      `SELECT e.id, e.type, e.severity, e.status, e.title, e.invoice_number, e.transaction_ref,
              e.amount_minor, e.delta_minor, v.code AS vendor_code, e.resolution_code, e.resolution_note,
              e.created_at, e.resolved_at, u.name AS assignee
       FROM exceptions e LEFT JOIN vendors v ON v.id = e.vendor_id LEFT JOIN users u ON u.id = e.assignee_id
       ${clause} ORDER BY e.created_at DESC`,
      ...params,
    );
    const csvRows = rows.map((row) => ({
      exception_id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      invoice_number: row.invoice_number ?? '',
      transaction_ref: row.transaction_ref ?? '',
      amount_idr: Number(row.amount_minor) / 100,
      variance_idr: Number(row.delta_minor) / 100,
      vendor_code: row.vendor_code ?? '',
      assignee: row.assignee ?? '',
      resolution_code: row.resolution_code ?? '',
      resolution_note: row.resolution_note ?? '',
      created_at: row.created_at,
      resolved_at: row.resolved_at ?? '',
    }));
    const columns = Object.keys(csvRows[0] ?? {
      exception_id: '', type: '', severity: '', status: '', title: '', invoice_number: '', transaction_ref: '',
      amount_idr: '', variance_idr: '', vendor_code: '', assignee: '', resolution_code: '', resolution_note: '',
      created_at: '', resolved_at: '',
    });
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="laras-exceptions-${config.today}.csv"`)
      .send(toCsv(csvRows, columns));
  });

  app.get('/api/reports/nominal-accuracy', { preHandler: guard(['ANALYST', 'SUPERVISOR', 'AUDITOR']) }, async (_request, reply) => {
    const invoiceCount = one<{ count: number }>('SELECT COUNT(*) AS count FROM invoices')?.count ?? 0;
    const formulaFailures = one<{ count: number }>('SELECT COUNT(*) AS count FROM exceptions WHERE fingerprint LIKE \'NOMINAL_VARIANCE:total:%\'')?.count ?? 0;
    const lineFailures = one<{ count: number }>('SELECT COUNT(*) AS count FROM exceptions WHERE fingerprint LIKE \'NOMINAL_VARIANCE:lines:%\'')?.count ?? 0;
    const receiptFailures = one<{ count: number }>('SELECT COUNT(*) AS count FROM exceptions WHERE fingerprint LIKE \'NOMINAL_VARIANCE:receipts:%\'')?.count ?? 0;
    const attachmentFailures = one<{ count: number }>('SELECT COUNT(*) AS count FROM exceptions WHERE fingerprint LIKE \'NOMINAL_VARIANCE:attachment:%\'')?.count ?? 0;
    const totalVariance = one<{ value: number }>(
      `SELECT COALESCE(SUM(ABS(delta_minor)), 0) AS value FROM exceptions WHERE type = 'NOMINAL_VARIANCE' AND status IN ('OPEN', 'IN_REVIEW')`,
    )?.value ?? 0;
    const matchStats = one<{ exact: number; tolerance: number; provisional: number; matched_value: number }>(
      `SELECT
        SUM(CASE WHEN status = 'EXACT' THEN 1 ELSE 0 END) AS exact,
        SUM(CASE WHEN status = 'TOLERANCE' THEN 1 ELSE 0 END) AS tolerance,
        SUM(CASE WHEN status = 'PROVISIONAL' THEN 1 ELSE 0 END) AS provisional,
        (SELECT COALESCE(SUM(l.amount_minor), 0) FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.status IN ('EXACT', 'TOLERANCE')) AS matched_value
       FROM matches`,
    );
    const byVendor = all<{ vendorCode: string; vendorName: string; exceptions: number; varianceMinor: number }>(
      `SELECT v.code AS vendorCode, v.name AS vendorName, COUNT(e.id) AS exceptions,
              COALESCE(SUM(${riskExpr('e.')}), 0) AS varianceMinor
       FROM exceptions e JOIN vendors v ON v.id = e.vendor_id
       WHERE e.type = 'NOMINAL_VARIANCE' AND e.status IN ('OPEN', 'IN_REVIEW')
       GROUP BY v.id ORDER BY varianceMinor DESC LIMIT 6`,
    );
    const recent = all(
      `SELECT e.id, e.invoice_number AS invoiceNumber, e.title, e.delta_minor AS deltaMinor, e.status,
              e.severity, v.name AS vendorName, e.created_at AS createdAt
       FROM exceptions e LEFT JOIN vendors v ON v.id = e.vendor_id
       WHERE e.type = 'NOMINAL_VARIANCE' ORDER BY e.created_at DESC LIMIT 8`,
    );
    const checked = Math.max(1, invoiceCount);
    const clean = Math.max(0, invoiceCount - formulaFailures);
    return reply.send({
      invoiceCount,
      formulaFailures,
      lineFailures,
      receiptFailures,
      attachmentFailures,
      totalVarianceMinor: totalVariance,
      accuracyRate: Math.round((clean / checked) * 1000) / 10,
      matchStats: {
        exact: matchStats?.exact ?? 0,
        tolerance: matchStats?.tolerance ?? 0,
        provisional: matchStats?.provisional ?? 0,
        matchedValueMinor: matchStats?.matched_value ?? 0,
      },
      byVendor,
      recent,
    });
  });
}
