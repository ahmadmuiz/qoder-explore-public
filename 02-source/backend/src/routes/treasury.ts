import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { ApiError, paged, readPaging, safeJson } from '../lib/http.js';
import { runTreasuryReconciliation, latestTreasuryRun } from '../domain/treasury/engine.js';
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  BREAK_LABELS,
  DOC_LABELS,
  TREASURY_BREAK_TYPES,
  TREASURY_CATEGORIES,
  TREASURY_DOC_TYPES,
} from '../domain/treasury/catalog.js';
import { guard } from './helpers.js';
import { computeAccrual, normalizePeriod, type AccrualItem } from '../domain/treasury/accrual.js';

let running = false;

function latestRunId(): string | null {
  const row = one<{ id: string }>(
    "SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1",
  );
  return row?.id ?? null;
}

function csv(values: string | undefined): string[] {
  return (values ?? '').split(',').map((value) => value.trim()).filter(Boolean);
}

function inClause(column: string, values: string[]): { sql: string; params: string[] } {
  return { sql: `${column} IN (${values.map(() => '?').join(',')})`, params: values };
}

export async function treasuryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/treasury/summary', { preHandler: guard() }, async (_request, reply) => {
    const runId = latestRunId();
    const totals = one<{ deals: number; notional: number; idr_notional: number }>(
      `SELECT COUNT(*) AS deals, COALESCE(SUM(CAST(notional_minor AS REAL)), 0) AS notional,
              COALESCE(SUM(CAST(notional_idr_minor AS REAL)), 0) AS idr_notional
       FROM treasury_deals`,
    );
    const categories = all<{ category: string; deals: number; notional_idr: number }>(
      `SELECT category, COUNT(*) AS deals, COALESCE(SUM(CAST(notional_idr_minor AS REAL)), 0) AS notional_idr
       FROM treasury_deals GROUP BY category`,
    );
    const matchRows = runId
      ? all<{ status: string; deals: number; notional_idr: number }>(
          `SELECT m.status, COUNT(*) AS deals, COALESCE(SUM(CAST(d.notional_idr_minor AS REAL)), 0) AS notional_idr
           FROM treasury_matches m JOIN treasury_deals d ON d.id = m.deal_id
           WHERE m.run_id = ? GROUP BY m.status`,
          runId,
        )
      : [];
    const breakRows = all<{ break_type: string; severity: string; count: number; value_minor: number }>(
      `SELECT break_type, severity, COUNT(*) AS count, COALESCE(SUM(CAST(amount_minor AS REAL)), 0) AS value_minor
       FROM treasury_breaks WHERE run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) AND status IN ('OPEN', 'IN_REVIEW') GROUP BY break_type, severity`,
    );
    const openByCategory = all<{ category: string; breaks: number }>(
      `SELECT d.category, COUNT(DISTINCT b.id) AS breaks
       FROM treasury_breaks b JOIN treasury_deals d ON d.id = b.deal_id
       WHERE b.run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) AND b.status IN ('OPEN', 'IN_REVIEW') GROUP BY d.category`,
    );
    const docs = one<{ total: number; missing: number }>(
      `SELECT COUNT(*) AS total FROM treasury_documents`,
    );
    const legs = one<{ total: number; failed: number }>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
       FROM treasury_legs`,
    );
    const topCounterparties = all<{ id: string; code: string; name: string; party_type: string; breaks: number; exposure: number }>(
      `SELECT c.id, c.code, c.name, c.party_type, COUNT(DISTINCT b.id) AS breaks,
              COALESCE(SUM(DISTINCT CAST(d.notional_idr_minor AS REAL)), 0) AS exposure
       FROM treasury_breaks b
       JOIN treasury_deals d ON d.id = b.deal_id
       JOIN treasury_counterparties c ON c.id = d.counterparty_id
       WHERE b.run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) AND b.status IN ('OPEN', 'IN_REVIEW')
       GROUP BY c.id ORDER BY breaks DESC, exposure DESC LIMIT 8`,
    );
    const statusByCategory = new Map<string, { full: number; partial: number; unmatched: number }>();
    if (runId) {
      const rows = all<{ category: string; status: string; deals: number }>(
        `SELECT d.category, m.status, COUNT(*) AS deals
         FROM treasury_matches m JOIN treasury_deals d ON d.id = m.deal_id
         WHERE m.run_id = ? GROUP BY d.category, m.status`,
        runId,
      );
      for (const row of rows) {
        const entry = statusByCategory.get(row.category) ?? { full: 0, partial: 0, unmatched: 0 };
        if (row.status === 'FULL') entry.full = row.deals;
        else if (row.status === 'PARTIAL') entry.partial = row.deals;
        else entry.unmatched = row.deals;
        statusByCategory.set(row.category, entry);
      }
    }
    const categoryMap = new Map(categories.map((row) => [row.category, row]));
    const breakMap = new Map(openByCategory.map((row) => [row.category, row.breaks]));

    const matchTotals = { FULL: 0, PARTIAL: 0, UNMATCHED: 0 };
    for (const row of matchRows) matchTotals[row.status as keyof typeof matchTotals] = row.deals;
    const coverage = matchRows.reduce((sum, row) => sum + row.deals, 0)
      ? (matchTotals.FULL / matchRows.reduce((sum, row) => sum + row.deals, 0)) * 100
      : 0;

    const byType = new Map<string, { type: string; count: number; valueMinor: number }>();
    const bySeverity = new Map<string, number>();
    for (const row of breakRows) {
      const entry = byType.get(row.break_type) ?? { type: row.break_type, count: 0, valueMinor: 0 };
      entry.count += row.count;
      entry.valueMinor += row.value_minor;
      byType.set(row.break_type, entry);
      bySeverity.set(row.severity, (bySeverity.get(row.severity) ?? 0) + row.count);
    }

    return reply.send({
      asOf: new Date().toISOString().slice(0, 10),
      totals: {
        deals: totals?.deals ?? 0,
        notionalMinor: totals?.notional ?? 0,
        notionalIdrMinor: totals?.idr_notional ?? 0,
        documents: docs?.total ?? 0,
        legs: legs?.total ?? 0,
        failedLegs: legs?.failed ?? 0,
        full: matchTotals.FULL,
        partial: matchTotals.PARTIAL,
        unmatched: matchTotals.UNMATCHED,
        coverage,
      },
      categories: TREASURY_CATEGORIES.map((category) => {
        const row = categoryMap.get(category);
        const status = statusByCategory.get(category) ?? { full: 0, partial: 0, unmatched: 0 };
        return {
          category,
          label: CATEGORY_LABELS[category],
          short: CATEGORY_SHORT[category],
          deals: row?.deals ?? 0,
          notionalIdrMinor: row?.notional_idr ?? 0,
          ...status,
          openBreaks: breakMap.get(category) ?? 0,
        };
      }),
      breaksByType: [...byType.values()]
        .map((row) => ({ ...row, label: BREAK_LABELS[row.type as keyof typeof BREAK_LABELS] ?? row.type }))
        .sort((a, b) => b.count - a.count),
      breaksBySeverity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((severity) => ({
        severity,
        count: bySeverity.get(severity) ?? 0,
      })),
      topCounterparties,
      latestRun: latestTreasuryRun() ?? null,
      lastRunId: runId,
    });
  });

  app.get('/api/treasury/deals', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    const categories = csv(query.category).filter((value) => (TREASURY_CATEGORIES as readonly string[]).includes(value));
    if (categories.length) {
      const clause = inClause('d.category', categories);
      clauses.push(clause.sql);
      params.push(...clause.params);
    }
    if (query.currency) {
      clauses.push('d.currency = ?');
      params.push(query.currency);
    }
    if (query.direction) {
      clauses.push('d.direction = ?');
      params.push(query.direction);
    }
    if (query.status) {
      clauses.push('d.status = ?');
      params.push(query.status);
    }
    if (query.matchStatus && query.matchStatus !== 'ALL') {
      clauses.push(query.matchStatus === 'NONE' ? 'm.id IS NULL' : 'm.status = ?');
      if (query.matchStatus !== 'NONE') params.push(query.matchStatus);
    }
    if (query.breaks === '1') {
      clauses.push(
        "EXISTS (SELECT 1 FROM treasury_breaks b WHERE b.deal_id = d.id AND b.run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) AND b.status IN ('OPEN', 'IN_REVIEW'))",
      );
    }
    if (query.q) {
      clauses.push('(d.deal_ref LIKE ? OR d.instrument_code LIKE ? OR c.name LIKE ? OR d.portfolio LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const runId = latestRunId();
    const from = `FROM treasury_deals d
      JOIN treasury_counterparties c ON c.id = d.counterparty_id
      LEFT JOIN treasury_matches m ON m.deal_id = d.id AND m.run_id = ?`;
    const paramsWithRun = [runId, ...params];
    const sorts: Record<string, string> = {
      notional: 'd.notional_idr_minor DESC',
      newest: 'd.trade_date DESC',
      maturity: 'd.maturity_date ASC',
      ref: 'd.deal_ref ASC',
    };
    const order = sorts[query.sort ?? 'notional'] ?? sorts.notional;

    const total = one<{ count: number }>(`SELECT COUNT(*) AS count ${from} ${where}`, ...paramsWithRun)?.count ?? 0;
    const items = all(
      `SELECT d.id, d.deal_ref AS dealRef, d.category, d.instrument_code AS instrumentCode, d.direction,
              d.trade_date AS tradeDate, d.value_date AS valueDate, d.maturity_date AS maturityDate,
              d.currency, d.notional_minor AS notionalMinor, d.notional_idr_minor AS notionalIdrMinor,
              d.fx_rate AS fxRate, d.rate_bps AS rateBps, d.price, d.coupon_bps AS couponBps, d.tenor_days AS tenorDays,
              d.portfolio, d.desk, d.status, d.duplicate_of AS duplicateOf,
              c.id AS counterpartyId, c.code AS counterpartyCode, c.name AS counterpartyName, c.party_type AS partyType,
              m.status AS matchStatus, m.confidence, m.docs_expected AS docsExpected, m.docs_received AS docsReceived,
              (SELECT COUNT(*) FROM treasury_breaks b WHERE b.deal_id = d.id AND b.run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) AND b.status IN ('OPEN', 'IN_REVIEW')) AS openBreaks
       ${from} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...paramsWithRun,
      paging.pageSize,
      paging.offset,
    );
    return reply.send(paged(items, total, paging));
  });

  app.get('/api/treasury/deals/:id', { preHandler: guard() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const deal = one<Record<string, unknown>>(
      `SELECT d.id, d.deal_ref AS dealRef, d.category, d.instrument_code AS instrumentCode, d.direction,
              d.trade_date AS tradeDate, d.value_date AS valueDate, d.maturity_date AS maturityDate,
              d.currency, d.notional_minor AS notionalMinor, d.notional_idr_minor AS notionalIdrMinor,
              d.fx_rate AS fxRate, d.rate_bps AS rateBps, d.price, d.coupon_bps AS couponBps, d.tenor_days AS tenorDays,
              d.portfolio, d.desk, d.status, d.economic_key AS economicKey, d.duplicate_of AS duplicateOf,
              d.created_at AS createdAt,
              c.id AS counterpartyId, c.code AS counterpartyCode, c.name AS counterpartyName,
              c.party_type AS partyType, c.rating, c.country
       FROM treasury_deals d JOIN treasury_counterparties c ON c.id = d.counterparty_id
       WHERE d.id = ?`,
      id,
    );
    if (!deal) throw new ApiError(404, 'DEAL_NOT_FOUND', 'That treasury deal does not exist.');
    const category = String(deal.category);
    const matchRow = one(
      'SELECT * FROM treasury_matches WHERE deal_id = ? ORDER BY matched_at DESC LIMIT 1',
      id,
    );
    const match = matchRow
      ? {
          runId: String((matchRow as Record<string, unknown>).run_id),
          status: String((matchRow as Record<string, unknown>).status),
          docsExpected: Number((matchRow as Record<string, unknown>).docs_expected),
          docsReceived: Number((matchRow as Record<string, unknown>).docs_received),
          legsExpected: Number((matchRow as Record<string, unknown>).legs_expected),
          legsMatched: Number((matchRow as Record<string, unknown>).legs_matched),
          confidence: Number((matchRow as Record<string, unknown>).confidence),
          matchedAt: String((matchRow as Record<string, unknown>).matched_at),
        }
      : null;
    const documents = all(
      `SELECT id, doc_type AS docType, doc_number AS docNumber, doc_version AS docVersion, status,
              source, file_name AS fileName, mime, sha256, received_at AS receivedAt,
              notional_minor AS notionalMinor, currency, fx_rate AS fxRate, rate_bps AS rateBps, price,
              trade_date AS tradeDate, value_date AS valueDate, maturity_date AS maturityDate,
              counterparty_id AS counterpartyId, extracted_json AS extractedJson
       FROM treasury_documents WHERE deal_id = ? ORDER BY doc_type`,
      id,
    ).map((row) => {
      const doc = row as Record<string, unknown>;
      doc.extracted = safeJson(String(doc.extractedJson ?? '{}'), {});
      delete doc.extractedJson;
      doc.label = DOC_LABELS[String(doc.docType) as keyof typeof DOC_LABELS] ?? doc.docType;
      return doc;
    });
    const legs = all(
      `SELECT id, leg_no AS legNo, leg_type AS legType, direction, currency, amount_minor AS amountMinor,
              amount_idr_minor AS amountIdrMinor, value_date AS valueDate, account_mask AS accountMask,
              settlement_ref AS settlementRef, status
       FROM treasury_legs WHERE deal_id = ? ORDER BY leg_no`,
      id,
    );
    const breaks = all(
      `SELECT id, break_type AS breakType, severity, status, field_name AS fieldName,
              expected_value AS expectedValue, actual_value AS actualValue, amount_minor AS amountMinor,
              currency, detail_json AS detailJson, created_at AS createdAt
       FROM treasury_breaks WHERE deal_id = ? AND run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) ORDER BY severity, break_type`,
      id,
    ).map((row) => {
      const item = row as Record<string, unknown>;
      item.detail = safeJson(String(item.detailJson ?? '{}'), {});
      delete item.detailJson;
      item.label = BREAK_LABELS[String(item.breakType) as keyof typeof BREAK_LABELS] ?? item.breakType;
      return item;
    });
    return reply.send({
      deal: {
        ...deal,
        categoryLabel: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category,
      },
      match: match ?? null,
      documents,
      legs,
      breaks,
    });
  });

  app.get('/api/treasury/breaks', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    const status = query.status ?? 'ACTIVE';
    if (status === 'ACTIVE') {
      clauses.push(
        "b.run_id = (SELECT id FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1) AND b.status IN ('OPEN', 'IN_REVIEW')",
      );
    }
    else if (status !== 'ALL') {
      const values = csv(status);
      const clause = inClause('b.status', values);
      clauses.push(clause.sql);
      params.push(...clause.params);
    }
    const types = csv(query.type).filter((value) => (TREASURY_BREAK_TYPES as readonly string[]).includes(value));
    if (types.length) {
      const clause = inClause('b.break_type', types);
      clauses.push(clause.sql);
      params.push(...clause.params);
    }
    const severities = csv(query.severity);
    if (severities.length) {
      const clause = inClause('b.severity', severities);
      clauses.push(clause.sql);
      params.push(...clause.params);
    }
    const categories = csv(query.category).filter((value) => (TREASURY_CATEGORIES as readonly string[]).includes(value));
    if (categories.length) {
      const clause = inClause('d.category', categories);
      clauses.push(clause.sql);
      params.push(...clause.params);
    }
    if (query.q) {
      clauses.push('(d.deal_ref LIKE ? OR c.name LIKE ? OR b.expected_value LIKE ? OR b.actual_value LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const from = `FROM treasury_breaks b
      JOIN treasury_deals d ON d.id = b.deal_id
      JOIN treasury_counterparties c ON c.id = d.counterparty_id`;
    const sorts: Record<string, string> = {
      severity: "CASE b.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, d.notional_idr_minor DESC",
      newest: 'b.created_at DESC',
      amount: 'd.notional_idr_minor DESC',
      deal: 'd.deal_ref ASC',
    };
    const order = sorts[query.sort ?? 'severity'] ?? sorts.severity;

    const total = one<{ count: number }>(`SELECT COUNT(*) AS count ${from} ${where}`, ...params)?.count ?? 0;
    const items = all(
      `SELECT b.id, b.break_type AS breakType, b.severity, b.status, b.field_name AS fieldName,
              b.expected_value AS expectedValue, b.actual_value AS actualValue, b.amount_minor AS amountMinor,
              b.currency, b.created_at AS createdAt,
              d.id AS dealId, d.deal_ref AS dealRef, d.category, d.currency AS dealCurrency,
              d.notional_idr_minor AS notionalIdrMinor, d.maturity_date AS maturityDate,
              c.name AS counterpartyName, c.code AS counterpartyCode
       ${from} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params,
      paging.pageSize,
      paging.offset,
    ).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        label: BREAK_LABELS[String(item.breakType) as keyof typeof BREAK_LABELS] ?? item.breakType,
        categoryLabel: CATEGORY_LABELS[String(item.category) as keyof typeof CATEGORY_LABELS] ?? item.category,
        docLabel: DOC_LABELS[String(item.fieldName ?? '') as keyof typeof DOC_LABELS] ?? null,
      };
    });
    return reply.send(paged(items, total, paging));
  });

  app.post('/api/treasury/run', { preHandler: guard(['ANALYST', 'SUPERVISOR']) }, async (request, reply) => {
    if (running) throw new ApiError(409, 'RUN_IN_PROGRESS', 'A treasury reconciliation run is already in progress.');
    running = true;
    try {
      const result = runTreasuryReconciliation({ trigger: 'MANUAL', actorId: request.user.id });
      return reply.send({ ok: true, ...result });
    } finally {
      running = false;
    }
  });

  app.get('/api/treasury/runs', { preHandler: guard() }, async (_request, reply) => {
    const rows = all<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats_json: string; actor_name: string | null }>(
      `SELECT r.id, r.trigger, r.status, r.started_at, r.finished_at, r.stats_json, u.name AS actor_name
       FROM treasury_runs r LEFT JOIN users u ON u.id = r.triggered_by
       ORDER BY r.started_at DESC LIMIT 20`,
    );
    return reply.send({
      items: rows.map((row) => ({
        id: row.id,
        trigger: row.trigger,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        actorName: row.actor_name,
        stats: safeJson<Record<string, unknown>>(row.stats_json, {}),
      })),
    });
  });

  app.get('/api/treasury/accrual', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    let report;
    try {
      report = computeAccrual(query.period);
    } catch {
      throw new ApiError(400, 'INVALID_PERIOD', 'Use a period in YYYY-MM format.');
    }
    let items = report.items;
    if (query.category) {
      const categories = csv(query.category);
      items = items.filter((item) => categories.includes(item.category));
    }
    if (query.kind && query.kind !== 'ALL') {
      items = items.filter((item) => item.kind === query.kind);
    }
    if (query.q) {
      const needle = query.q.toLowerCase();
      items = items.filter(
        (item) =>
          item.dealRef.toLowerCase().includes(needle) ||
          item.counterparty.toLowerCase().includes(needle) ||
          item.formula.toLowerCase().includes(needle),
      );
    }
    const total = items.length;
    return reply.send({
      ...report,
      items: items.slice(paging.offset, paging.offset + paging.pageSize),
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
    });
  });

  app.get('/api/treasury/accrual/export', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    let period: { period: string; from: string; to: string };
    let report;
    try {
      period = normalizePeriod(query.period);
      report = computeAccrual(period.period);
    } catch {
      throw new ApiError(400, 'INVALID_PERIOD', 'Use a period in YYYY-MM format.');
    }
    const escape = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const header = [
      'period', 'deal_ref', 'category', 'counterparty', 'direction', 'accrual_type',
      'from', 'to', 'days', 'day_basis', 'rate_bps', 'currency', 'amount_minor', 'amount_idr_minor',
      'kind', 'debit_account', 'debit_account_name', 'credit_account', 'credit_account_name', 'formula',
    ];
    const rows = report.items.map((item: AccrualItem) =>
      [
        period.period, item.dealRef, item.category, item.counterparty, item.direction, item.accrualType,
        item.from, item.to, item.days, item.dayBasis, item.rateBps ?? '', item.currency,
        item.amountMinor, item.amountIdrMinor, item.kind, item.debitAccount, item.debitAccountName,
        item.creditAccount, item.creditAccountName, item.formula,
      ].map(escape).join(','),
    );
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="laras-accrual-${period.period}.csv"`);
    return reply.send([header.join(','), ...rows].join('\n'));
  });

  app.get('/api/treasury/meta', { preHandler: guard() }, async (_request, reply) => {    return reply.send({
      categories: TREASURY_CATEGORIES.map((category) => ({
        value: category,
        label: CATEGORY_LABELS[category],
        short: CATEGORY_SHORT[category],
      })),
      docTypes: TREASURY_DOC_TYPES.map((docType) => ({ value: docType, label: DOC_LABELS[docType] })),
      breakTypes: TREASURY_BREAK_TYPES.map((breakType) => ({ value: breakType, label: BREAK_LABELS[breakType] })),
    });
  });
}
