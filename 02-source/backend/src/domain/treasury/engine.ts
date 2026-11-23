import { config } from '../../config.js';
import { all, getDb, one, run, tx } from '../../db/index.js';
import { addDays, nowIso } from '../../lib/dates.js';
import { newId } from '../../lib/ids.js';
import {
  CATEGORY_SPECS,
  REQUIRED_LEGS,
  type TreasuryBreakType,
  type TreasuryCategory,
  type TreasuryDocType,
} from './catalog.js';
import { expectedLegs } from './calc.js';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface DealRow {
  id: string;
  deal_ref: string;
  category: TreasuryCategory;
  instrument_code: string;
  direction: string;
  counterparty_id: string;
  trade_date: string;
  value_date: string;
  maturity_date: string;
  currency: string;
  notional_minor: number;
  notional_idr_minor: number;
  fx_rate: number | null;
  rate_bps: number | null;
  price: number | null;
  coupon_bps: number | null;
  tenor_days: number;
  status: string;
  economic_key: string;
  duplicate_of: string | null;
}

interface DocRow {
  id: string;
  deal_id: string;
  doc_type: TreasuryDocType;
  doc_number: string;
  counterparty_id: string | null;
  notional_minor: number | null;
  currency: string | null;
  fx_rate: number | null;
  rate_bps: number | null;
  price: number | null;
  trade_date: string | null;
  value_date: string | null;
  maturity_date: string | null;
  status: string;
}

interface LegRow {
  id: string;
  deal_id: string;
  leg_no: number;
  leg_type: string;
  direction: string;
  currency: string;
  amount_minor: number;
  amount_idr_minor: number;
  value_date: string;
  status: string;
}

interface ProposedBreak {
  breakType: TreasuryBreakType;
  severity: Severity;
  fieldName?: string;
  expectedValue?: string;
  actualValue?: string;
  amountMinor?: number;
  detail?: Record<string, unknown>;
}

interface DealResult {
  dealId: string;
  status: 'FULL' | 'PARTIAL' | 'UNMATCHED';
  docsExpected: number;
  docsReceived: number;
  legsExpected: number;
  legsMatched: number;
  confidence: number;
  breaks: ProposedBreak[];
}

export interface TreasuryRunStats {
  deals: number;
  full: number;
  partial: number;
  unmatched: number;
  coverage: number;
  docsExpected: number;
  docsReceived: number;
  docsMissing: number;
  legsExpected: number;
  legsReceived: number;
  openBreaks: number;
  valueAtRiskIdrMinor: number;
  notionalIdrMinor: number;
  breaksByType: Array<{ type: string; count: number }>;
  breaksBySeverity: Array<{ severity: string; count: number }>;
}

export interface TreasuryRunResult {
  runId: string;
  stats: TreasuryRunStats;
}

const AMOUNT_TOLERANCE = 0.00005;

function severityFor(category: TreasuryCategory, breakType: TreasuryBreakType, notionalIdrMinor: number): Severity {
  if (breakType === 'DUPLICATE_DEAL') return 'CRITICAL';
  if (breakType === 'MISSING_CASHFLOW' || breakType === 'UNSETTLED_CASHFLOW' || breakType === 'CASHFLOW_AMOUNT_MISMATCH') {
    return notionalIdrMinor >= 100_000_000_000_00 ? 'CRITICAL' : 'HIGH';
  }
  if (breakType === 'MISSING_SUPPORTING_DOCUMENT' || breakType === 'CUSTODY_POSITION_MISMATCH') {
    return notionalIdrMinor >= 100_000_000_000_00 ? 'HIGH' : 'MEDIUM';
  }
  if (breakType === 'DOC_NOTIONAL_MISMATCH' || breakType === 'DOC_RATE_MISMATCH' || breakType === 'DOC_PRICE_MISMATCH' || breakType === 'DOC_FX_RATE_MISMATCH') {
    return notionalIdrMinor >= 50_000_000_000_00 ? 'HIGH' : 'MEDIUM';
  }
  if (breakType === 'DOC_DATE_MISMATCH' || breakType === 'SETTLEMENT_DATE_MISMATCH' || breakType === 'DOC_MATURITY_MISMATCH') {
    return 'MEDIUM';
  }
  if (breakType === 'DOC_COUNTERPARTY_MISMATCH' || breakType === 'DOC_CURRENCY_MISMATCH') return 'HIGH';
  return category === 'PROJECT_FINANCE' ? 'HIGH' : 'MEDIUM';
}

function relativeDiff(expected: number, actual: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1;
  return Math.abs(actual - expected) / Math.abs(expected);
}

export function runTreasuryReconciliation(options: {
  trigger: string;
  actorId?: string;
  today?: string;
} = { trigger: 'MANUAL' }): TreasuryRunResult {
  const today = options.today ?? config.today;
  const periodFrom = addDays(today, -120);
  const periodTo = today;
  const runId = newId('trun');
  const startedAt = nowIso();

  const deals = all<DealRow>(
    `SELECT id, deal_ref, category, instrument_code, direction, counterparty_id, trade_date, value_date,
            maturity_date, currency, notional_minor, notional_idr_minor, fx_rate, rate_bps, price,
            coupon_bps, tenor_days, status, economic_key, duplicate_of
       FROM treasury_deals
      WHERE trade_date <= ?`,
    periodTo,
  );
  const docs = all<DocRow>(
    `SELECT id, deal_id, doc_type, doc_number, counterparty_id, notional_minor, currency, fx_rate,
            rate_bps, price, trade_date, value_date, maturity_date, status
       FROM treasury_documents`,
  );
  const legs = all<LegRow>(
    `SELECT id, deal_id, leg_no, leg_type, direction, currency, amount_minor, amount_idr_minor, value_date, status
       FROM treasury_legs`,
  );

  const docsByDeal = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const bucket = docsByDeal.get(doc.deal_id) ?? [];
    bucket.push(doc);
    docsByDeal.set(doc.deal_id, bucket);
  }
  const legsByDeal = new Map<string, LegRow[]>();
  for (const leg of legs) {
    const bucket = legsByDeal.get(leg.deal_id) ?? [];
    bucket.push(leg);
    legsByDeal.set(leg.deal_id, bucket);
  }

  const economicGroups = new Map<string, DealRow[]>();
  for (const deal of deals) {
    const bucket = economicGroups.get(deal.economic_key) ?? [];
    bucket.push(deal);
    economicGroups.set(deal.economic_key, bucket);
  }
  const duplicateIds = new Set<string>();
  for (const group of economicGroups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    for (const duplicate of ordered.slice(1)) duplicateIds.add(duplicate.id);
  }

  const results: DealResult[] = [];
  for (const deal of deals) {
    const dealDocs = docsByDeal.get(deal.id) ?? [];
    const dealLegs = legsByDeal.get(deal.id) ?? [];
    const requiredDocs = CATEGORY_SPECS[deal.category].requiredDocs;
    const presentDocs = new Set(dealDocs.map((doc) => doc.doc_type));
    const missingDocs = requiredDocs.filter((docType) => !presentDocs.has(docType));
    const breaks: ProposedBreak[] = [];

    if (missingDocs.length > 0) {
      breaks.push({
        breakType: 'MISSING_SUPPORTING_DOCUMENT',
        severity: severityFor(deal.category, 'MISSING_SUPPORTING_DOCUMENT', deal.notional_idr_minor),
        fieldName: 'required_documents',
        expectedValue: requiredDocs.join(', '),
        actualValue: [...presentDocs].join(', ') || '(none)',
        amountMinor: deal.notional_minor,
        detail: { missingDocTypes: missingDocs },
      });
    }

    for (const doc of dealDocs) {
      if (doc.status !== 'RECEIVED') {
        breaks.push({
          breakType: 'MISSING_SUPPORTING_DOCUMENT',
          severity: severityFor(deal.category, 'MISSING_SUPPORTING_DOCUMENT', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.status`,
          expectedValue: 'RECEIVED',
          actualValue: doc.status,
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number, docType: doc.doc_type },
        });
        continue;
      }

      if (doc.notional_minor !== null && doc.notional_minor !== deal.notional_minor) {
        const diff = relativeDiff(deal.notional_minor, doc.notional_minor);
        if (diff > 0.00001) {
          breaks.push({
            breakType: doc.doc_type === 'CUSTODY_STATEMENT' ? 'CUSTODY_POSITION_MISMATCH' : 'DOC_NOTIONAL_MISMATCH',
            severity: severityFor(deal.category, doc.doc_type === 'CUSTODY_STATEMENT' ? 'CUSTODY_POSITION_MISMATCH' : 'DOC_NOTIONAL_MISMATCH', deal.notional_idr_minor),
            fieldName: `${doc.doc_type}.notional`,
            expectedValue: String(deal.notional_minor),
            actualValue: String(doc.notional_minor),
            amountMinor: Math.abs(doc.notional_minor - deal.notional_minor),
            detail: { docNumber: doc.doc_number, docType: doc.doc_type, relativeDiff: diff },
          });
        }
      }
      if (doc.rate_bps !== null && deal.rate_bps !== null && doc.rate_bps !== deal.rate_bps) {
        breaks.push({
          breakType: 'DOC_RATE_MISMATCH',
          severity: severityFor(deal.category, 'DOC_RATE_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.rate_bps`,
          expectedValue: String(deal.rate_bps),
          actualValue: String(doc.rate_bps),
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number, deltaBps: doc.rate_bps - deal.rate_bps },
        });
      }
      if (doc.price !== null && deal.price !== null && Math.abs(doc.price - deal.price) > 0.0001) {
        breaks.push({
          breakType: 'DOC_PRICE_MISMATCH',
          severity: severityFor(deal.category, 'DOC_PRICE_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.price`,
          expectedValue: String(deal.price),
          actualValue: String(doc.price),
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number },
        });
      }
      if (doc.fx_rate !== null && deal.fx_rate !== null && Math.abs(doc.fx_rate - deal.fx_rate) > 0.01) {
        breaks.push({
          breakType: 'DOC_FX_RATE_MISMATCH',
          severity: severityFor(deal.category, 'DOC_FX_RATE_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.fx_rate`,
          expectedValue: deal.fx_rate.toFixed(2),
          actualValue: doc.fx_rate.toFixed(2),
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number },
        });
      }
      if (doc.value_date !== null && doc.value_date !== deal.value_date) {
        breaks.push({
          breakType: 'DOC_DATE_MISMATCH',
          severity: severityFor(deal.category, 'DOC_DATE_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.value_date`,
          expectedValue: deal.value_date,
          actualValue: doc.value_date,
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number },
        });
      }
      if (doc.maturity_date !== null && doc.maturity_date !== deal.maturity_date) {
        breaks.push({
          breakType: 'DOC_MATURITY_MISMATCH',
          severity: severityFor(deal.category, 'DOC_MATURITY_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.maturity_date`,
          expectedValue: deal.maturity_date,
          actualValue: doc.maturity_date,
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number },
        });
      }
      if (doc.counterparty_id !== null && doc.counterparty_id !== deal.counterparty_id) {
        breaks.push({
          breakType: 'DOC_COUNTERPARTY_MISMATCH',
          severity: severityFor(deal.category, 'DOC_COUNTERPARTY_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.counterparty`,
          expectedValue: deal.counterparty_id,
          actualValue: doc.counterparty_id,
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number },
        });
      }
      if (doc.currency !== null && doc.currency !== deal.currency) {
        breaks.push({
          breakType: 'DOC_CURRENCY_MISMATCH',
          severity: severityFor(deal.category, 'DOC_CURRENCY_MISMATCH', deal.notional_idr_minor),
          fieldName: `${doc.doc_type}.currency`,
          expectedValue: deal.currency,
          actualValue: doc.currency,
          amountMinor: deal.notional_minor,
          detail: { docNumber: doc.doc_number },
        });
      }
    }

    const requiredLegs = REQUIRED_LEGS[deal.category];
    if (dealLegs.length < requiredLegs) {
      breaks.push({
        breakType: 'MISSING_CASHFLOW',
        severity: severityFor(deal.category, 'MISSING_CASHFLOW', deal.notional_idr_minor),
        fieldName: 'legs',
        expectedValue: String(requiredLegs),
        actualValue: String(dealLegs.length),
        amountMinor: deal.notional_minor,
      });
    }
    for (const leg of dealLegs) {
      if (leg.status === 'FAILED') {
        breaks.push({
          breakType: 'UNSETTLED_CASHFLOW',
          severity: severityFor(deal.category, 'UNSETTLED_CASHFLOW', deal.notional_idr_minor),
          fieldName: `leg_${leg.leg_no}.status`,
          expectedValue: 'SETTLED',
          actualValue: leg.status,
          amountMinor: leg.amount_minor,
          detail: { legType: leg.leg_type, valueDate: leg.value_date },
        });
      }
    }

    const wantLegs = expectedLegs({
      category: deal.category,
      direction: deal.direction,
      currency: deal.currency,
      notionalMinor: deal.notional_minor,
      notionalIdrMinor: deal.notional_idr_minor,
      fxRate: deal.fx_rate,
      rateBps: deal.rate_bps,
      price: deal.price,
      couponBps: deal.coupon_bps,
      tradeDate: deal.trade_date,
      valueDate: deal.value_date,
      maturityDate: deal.maturity_date,
      tenorDays: deal.tenor_days,
    });
    for (let index = 0; index < wantLegs.length; index += 1) {
      const want = wantLegs[index]!;
      const leg = dealLegs.find((candidate) => candidate.leg_no === index + 1);
      if (!leg) continue;
      if (relativeDiff(want.amountMinor, leg.amount_minor) > AMOUNT_TOLERANCE) {
        breaks.push({
          breakType: 'CASHFLOW_AMOUNT_MISMATCH',
          severity: severityFor(deal.category, 'CASHFLOW_AMOUNT_MISMATCH', deal.notional_idr_minor),
          fieldName: `leg_${leg.leg_no}.amount`,
          expectedValue: String(want.amountMinor),
          actualValue: String(leg.amount_minor),
          amountMinor: Math.abs(leg.amount_minor - want.amountMinor),
          detail: { legType: want.legType, currency: want.currency, valueDate: want.valueDate },
        });
      }
      if (leg.value_date !== want.valueDate) {
        breaks.push({
          breakType: 'SETTLEMENT_DATE_MISMATCH',
          severity: severityFor(deal.category, 'SETTLEMENT_DATE_MISMATCH', deal.notional_idr_minor),
          fieldName: `leg_${leg.leg_no}.value_date`,
          expectedValue: want.valueDate,
          actualValue: leg.value_date,
          amountMinor: leg.amount_minor,
          detail: { legType: want.legType },
        });
      }
    }

    if (duplicateIds.has(deal.id)) {
      breaks.push({
        breakType: 'DUPLICATE_DEAL',
        severity: 'CRITICAL',
        fieldName: 'economic_key',
        expectedValue: 'unique',
        actualValue: deal.economic_key,
        amountMinor: deal.notional_minor,
        detail: { duplicateOf: deal.duplicate_of ?? null },
      });
    }

    const legsMatched = dealLegs.filter((leg) => leg.status === 'SETTLED').length;
    let status: DealResult['status'];
    if (dealDocs.length === 0 && dealLegs.length === 0) status = 'UNMATCHED';
    else if (breaks.length === 0 && missingDocs.length === 0 && dealLegs.length >= requiredLegs) status = 'FULL';
    else status = 'PARTIAL';

    const confidence = status === 'FULL' ? 100 : status === 'UNMATCHED' ? 30 : Math.max(45, 90 - breaks.length * 10);
    results.push({
      dealId: deal.id,
      status,
      docsExpected: requiredDocs.length,
      docsReceived: dealDocs.length,
      legsExpected: requiredLegs,
      legsMatched,
      confidence,
      breaks,
    });
  }

  const full = results.filter((result) => result.status === 'FULL').length;
  const partial = results.filter((result) => result.status === 'PARTIAL').length;
  const unmatched = results.filter((result) => result.status === 'UNMATCHED').length;
  const breaksByTypeMap = new Map<string, number>();
  const breaksBySeverityMap = new Map<string, number>();
  let openBreaks = 0;
  let valueAtRiskIdrMinor = 0;
  let notionalIdrMinor = 0;
  const dealsWithBreaks = new Set<string>();
  for (const deal of deals) notionalIdrMinor += deal.notional_idr_minor;
  for (const result of results) {
    for (const issue of result.breaks) {
      openBreaks += 1;
      breaksByTypeMap.set(issue.breakType, (breaksByTypeMap.get(issue.breakType) ?? 0) + 1);
      breaksBySeverityMap.set(issue.severity, (breaksBySeverityMap.get(issue.severity) ?? 0) + 1);
      dealsWithBreaks.add(result.dealId);
    }
  }
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));
  for (const dealId of dealsWithBreaks) valueAtRiskIdrMinor += dealById.get(dealId)?.notional_idr_minor ?? 0;

  const stats: TreasuryRunStats = {
    deals: results.length,
    full,
    partial,
    unmatched,
    coverage: results.length === 0 ? 0 : Math.round((full / results.length) * 1000) / 10,
    docsExpected: results.reduce((sum, result) => sum + result.docsExpected, 0),
    docsReceived: results.reduce((sum, result) => sum + result.docsReceived, 0),
    docsMissing: results.reduce((sum, result) => sum + Math.max(0, result.docsExpected - result.docsReceived), 0),
    legsExpected: results.reduce((sum, result) => sum + result.legsExpected, 0),
    legsReceived: results.reduce((sum, result) => sum + result.legsMatched, 0),
    openBreaks,
    valueAtRiskIdrMinor,
    notionalIdrMinor,
    breaksByType: [...breaksByTypeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    breaksBySeverity: [...breaksBySeverityMap.entries()].map(([severity, count]) => ({ severity, count })),
  };

  tx(() => {
    run(
      `INSERT INTO treasury_runs (id, trigger, status, period_from, period_to, started_at, finished_at, stats_json, triggered_by)
       VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
      runId,
      options.trigger,
      periodFrom,
      periodTo,
      startedAt,
      nowIso(),
      JSON.stringify(stats),
      options.actorId ?? null,
    );
    const insertMatch = getDb().prepare(
      `INSERT INTO treasury_matches (id, run_id, deal_id, status, docs_expected, docs_received, legs_expected, legs_matched, confidence, matched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertBreak = getDb().prepare(
      `INSERT INTO treasury_breaks (id, run_id, deal_id, break_type, severity, status, field_name, expected_value, actual_value, amount_minor, currency, detail_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const matchedAt = nowIso();
    for (const result of results) {
      insertMatch.run(
        newId('tmat'), runId, result.dealId, result.status, result.docsExpected, result.docsReceived,
        result.legsExpected, result.legsMatched, result.confidence, matchedAt,
      );
      for (const issue of result.breaks) {
        const deal = dealById.get(result.dealId)!;
        insertBreak.run(
          newId('tbrk'), runId, result.dealId, issue.breakType, issue.severity,
          issue.fieldName ?? null, issue.expectedValue ?? null, issue.actualValue ?? null,
          issue.amountMinor ?? 0, deal.currency, JSON.stringify(issue.detail ?? {}), matchedAt, matchedAt,
        );
      }
    }
  });

  return { runId, stats };
}

export function latestTreasuryRun(): Record<string, unknown> | undefined {
  const row = one<{ id: string; started_at: string; finished_at: string; stats_json: string }>(
    "SELECT id, started_at, finished_at, stats_json FROM treasury_runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1",
  );
  if (!row) return undefined;
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    stats: JSON.parse(row.stats_json) as TreasuryRunStats,
  };
}
