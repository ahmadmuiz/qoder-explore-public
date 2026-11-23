import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { config } from '../config.js';
import { addDays } from '../lib/dates.js';
import { safeJson } from '../lib/http.js';
import { guard } from './helpers.js';

const riskExpr = (prefix = '') =>
  `CASE WHEN ${prefix}type IN ('DUPLICATE_PAYMENT', 'MISSING_PAYMENT', 'UNALLOCATED_PAYMENT') THEN ${prefix}amount_minor ELSE ABS(${prefix}delta_minor) END`;

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const today = query.today ?? config.today;
    const from = query.from ?? addDays(today, -29);
    const to = query.to ?? today;

    const runRow = one<{ id: string; started_at: string; finished_at: string; stats_json: string }>(
      "SELECT id, started_at, finished_at, stats_json FROM runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1",
    );
    const runStats = safeJson<Record<string, unknown>>(runRow?.stats_json, {});

    const counts = one<{
      invoices: number;
      ledger: number;
      matched: number;
      open_exceptions: number;
      risk: number;
      reconciled_value: number;
      missing: number;
      duplicates: number;
      unresolved_value: number;
      resolved_7d: number;
      avg_resolution_hours: number | null;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM invoices) AS invoices,
        (SELECT COUNT(*) FROM ledger_transactions) AS ledger,
        (SELECT COUNT(*) FROM matches WHERE status IN ('EXACT', 'TOLERANCE')) AS matched,
        (SELECT COUNT(*) FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')) AS open_exceptions,
        (SELECT COALESCE(SUM(${riskExpr()}), 0) FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')) AS risk,
        (SELECT COALESCE(SUM(l.amount_minor), 0) FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id WHERE m.status IN ('EXACT', 'TOLERANCE')) AS reconciled_value,
        (SELECT COUNT(*) FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW') AND type = 'MISSING_PAYMENT') AS missing,
        (SELECT COUNT(*) FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW') AND type IN ('DUPLICATE_PAYMENT', 'DUPLICATE_RECEIPT')) AS duplicates,
        (SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_transactions WHERE status IN ('UNMATCHED', 'IN_REVIEW', 'DUPLICATE')) AS unresolved_value,
        (SELECT COUNT(*) FROM exceptions WHERE resolved_at IS NOT NULL AND resolution_code != 'AUTO_CLEARED' AND resolved_at >= ?) AS resolved_7d,
        (SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) FROM exceptions WHERE resolved_at IS NOT NULL AND resolution_code != 'AUTO_CLEARED') AS avg_resolution_hours`,
      addDays(today, -7),
    );

    const skipped = one<{ rows: number }>('SELECT COALESCE(SUM(skipped_count), 0) AS rows FROM import_batches');

    const matchedRate =
      counts && counts.invoices > 0 ? Math.round(((counts.matched / counts.invoices) * 100) * 10) / 10 : 0;

    const breakdown = all<{ type: string; count: number; value_minor: number }>(
      `SELECT type, COUNT(*) AS count, COALESCE(SUM(${riskExpr()}), 0) AS value_minor
       FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')
       GROUP BY type ORDER BY value_minor DESC`,
    );

    const severity = all<{ severity: string; count: number }>(
      `SELECT severity, COUNT(*) AS count FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')
       GROUP BY severity ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`,
    );

    const ledgerByDay = all<{ date: string; count: number; value: number }>(
      'SELECT value_date AS date, COUNT(*) AS count, SUM(amount_minor) AS value FROM ledger_transactions WHERE value_date BETWEEN ? AND ? GROUP BY value_date',
      from,
      to,
    );
    const matchedByDay = all<{ date: string; value: number }>(
      `SELECT l.value_date AS date, SUM(l.amount_minor) AS value
       FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id
       WHERE m.status IN ('EXACT', 'TOLERANCE') AND l.value_date BETWEEN ? AND ?
       GROUP BY l.value_date`,
      from,
      to,
    );
    const exceptionByDay = all<{ date: string; count: number }>(
      `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count FROM exceptions
       WHERE substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY substr(created_at, 1, 10)`,
      from,
      to,
    );
    const ledgerMap = new Map(ledgerByDay.map((row) => [row.date, row]));
    const matchedMap = new Map(matchedByDay.map((row) => [row.date, row.value]));
    const exceptionMap = new Map(exceptionByDay.map((row) => [row.date, row.count]));
    const trend: Array<{ date: string; ledgerCount: number; ledgerValueMinor: number; matchedValueMinor: number; exceptions: number }> = [];
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      trend.push({
        date,
        ledgerCount: ledgerMap.get(date)?.count ?? 0,
        ledgerValueMinor: ledgerMap.get(date)?.value ?? 0,
        matchedValueMinor: matchedMap.get(date) ?? 0,
        exceptions: exceptionMap.get(date) ?? 0,
      });
    }

    const runs = all<{ id: string; started_at: string; finished_at: string | null; trigger: string; stats_json: string }>(
      "SELECT id, started_at, finished_at, trigger, stats_json FROM runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 6",
    ).map((row) => {
      const stats = safeJson<Record<string, number>>(row.stats_json, {});
      return {
        id: row.id,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        trigger: row.trigger,
        matchedRate: stats.matchedRate ?? 0,
        exceptionsOpen: stats.exceptionsOpen ?? 0,
        exactMatches: stats.exactMatches ?? 0,
      };
    });

    const aging = all<{ bucket: string; count: number }>(
      `SELECT
        CASE
          WHEN julianday(?) - julianday(created_at) <= 7 THEN '0–7 days'
          WHEN julianday(?) - julianday(created_at) <= 14 THEN '8–14 days'
          WHEN julianday(?) - julianday(created_at) <= 30 THEN '15–30 days'
          ELSE '31+ days'
        END AS bucket,
        COUNT(*) AS count
       FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')
       GROUP BY bucket`,
      today,
      today,
      today,
    );
    const agingOrder = ['0–7 days', '8–14 days', '15–30 days', '31+ days'];
    const agingSorted = agingOrder.map((bucket) => ({ bucket, count: aging.find((row) => row.bucket === bucket)?.count ?? 0 }));

    const topVendors = all<{ id: string; code: string; name: string; count: number; value_minor: number }>(
      `SELECT v.id, v.code, v.name, COUNT(e.id) AS count, COALESCE(SUM(${riskExpr('e.')}), 0) AS value_minor
       FROM exceptions e JOIN vendors v ON v.id = e.vendor_id
       WHERE e.status IN ('OPEN', 'IN_REVIEW')
       GROUP BY v.id ORDER BY value_minor DESC LIMIT 5`,
    );

    const upcoming = one<{ count: number; value: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_minor), 0) AS value FROM invoices
       WHERE status = 'OPEN' AND due_date BETWEEN ? AND ?`,
      today,
      addDays(today, 14),
    );

    const recent = all<{ id: string; type: string; severity: string; title: string; invoice_number: string | null; amount_minor: number; status: string; created_at: string; vendor_name: string | null }>(
      `SELECT e.id, e.type, e.severity, e.title, e.invoice_number, e.amount_minor, e.status, e.created_at, v.name AS vendor_name
       FROM exceptions e LEFT JOIN vendors v ON v.id = e.vendor_id
       WHERE e.status IN ('OPEN', 'IN_REVIEW')
       ORDER BY CASE e.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, e.amount_minor DESC
       LIMIT 7`,
    );

    return reply.send({
      asOf: new Date().toISOString(),
      period: { from, to },
      lastRun: runRow ? { id: runRow.id, startedAt: runRow.started_at, finishedAt: runRow.finished_at, stats: runStats } : null,
      kpis: {
        matchedRate,
        openExceptions: counts?.open_exceptions ?? 0,
        valueAtRiskMinor: counts?.risk ?? 0,
        reconciledValueMinor: counts?.reconciled_value ?? 0,
        unresolvedValueMinor: counts?.unresolved_value ?? 0,
        invoices: counts?.invoices ?? 0,
        ledgerRows: counts?.ledger ?? 0,
        missingPayments: counts?.missing ?? 0,
        duplicates: counts?.duplicates ?? 0,
        resolved7d: counts?.resolved_7d ?? 0,
        avgResolutionHours: counts?.avg_resolution_hours ?? null,
        importsSkipped: skipped?.rows ?? 0,
      },
      breakdown: breakdown.map((row) => ({ type: row.type, count: row.count, valueMinor: row.value_minor })),
      severity,
      trend,
      runs,
      aging: agingSorted,
      topVendors: topVendors.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        count: row.count,
        valueMinor: row.value_minor,
      })),
      upcoming: { count: upcoming?.count ?? 0, valueMinor: upcoming?.value ?? 0 },
      recentExceptions: recent.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        invoiceNumber: row.invoice_number,
        amountMinor: row.amount_minor,
        status: row.status,
        createdAt: row.created_at,
        vendorName: row.vendor_name,
      })),
    });
  });
}
