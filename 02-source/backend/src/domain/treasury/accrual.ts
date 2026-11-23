import { config } from '../../config.js';
import { all, one } from '../../db/index.js';
import { daysBetween } from '../../lib/dates.js';
import { CATEGORY_LABELS, type TreasuryCategory } from './catalog.js';
import {
  FLOATING_REFERENCE_BPS,
  basisFor,
  endOfMonth,
  fxForwardRate,
  interestMinor,
  type DayBasis,
} from './calc.js';

export interface AccrualDeal {
  id: string;
  deal_ref: string;
  category: TreasuryCategory;
  direction: string;
  currency: string;
  notional_minor: number;
  notional_idr_minor: number;
  fx_rate: number | null;
  rate_bps: number | null;
  coupon_bps: number | null;
  value_date: string;
  maturity_date: string;
  tenor_days: number;
  counterparty_name: string;
}

export interface AccrualItem {
  dealId: string;
  dealRef: string;
  category: TreasuryCategory;
  categoryLabel: string;
  counterparty: string;
  direction: string;
  currency: string;
  principalMinor: number;
  principalIdrMinor: number;
  accrualType: 'INTEREST' | 'COUPON' | 'FX_POINTS' | 'SWAP_NET' | 'FEE';
  from: string;
  to: string;
  days: number;
  dayBasis: DayBasis;
  rateBps: number | null;
  amountMinor: number;
  amountIdrMinor: number;
  kind: 'INCOME' | 'EXPENSE';
  debitAccount: string;
  debitAccountName: string;
  creditAccount: string;
  creditAccountName: string;
  formula: string;
}

export interface AccrualReport {
  period: string;
  from: string;
  to: string;
  generatedAt: string;
  totals: {
    deals: number;
    incomeIdrMinor: number;
    expenseIdrMinor: number;
    netIdrMinor: number;
    principalIdrMinor: number;
  };
  byCategory: Array<{
    category: TreasuryCategory;
    label: string;
    deals: number;
    incomeIdrMinor: number;
    expenseIdrMinor: number;
    netIdrMinor: number;
  }>;
  journal: Array<{
    account: string;
    name: string;
    debitIdrMinor: number;
    creditIdrMinor: number;
  }>;
  balanced: boolean;
  items: AccrualItem[];
}

const ACCOUNTS = {
  interestReceivable: ['1201', 'Interest receivable'],
  interestPayable: ['2101', 'Interest payable'],
  interestIncome: ['4101', 'Interest income'],
  interestExpense: ['5101', 'Interest expense'],
  couponReceivable: ['1202', 'Coupon receivable'],
  couponIncome: ['4102', 'Coupon income'],
  swapReceivable: ['1205', 'Accrued swap receivable'],
  swapPayable: ['2105', 'Accrued swap payable'],
  swapIncome: ['4105', 'Swap interest income'],
  swapExpense: ['5105', 'Swap interest expense'],
  feeReceivable: ['1206', 'Fee receivable'],
  feeIncome: ['4106', 'Fee income'],
  forwardReceivable: ['1207', 'Forward points receivable'],
  forwardPayable: ['2107', 'Forward points payable'],
  forwardIncome: ['4107', 'Forward points income'],
  forwardExpense: ['5107', 'Forward points expense'],
} as const;

type Account = readonly [string, string];

function posting(kind: 'INCOME' | 'EXPENSE', receivable: Account, payable: Account, income: Account, expense: Account) {
  if (kind === 'INCOME') {
    return { debitAccount: receivable[0], debitAccountName: receivable[1], creditAccount: income[0], creditAccountName: income[1] };
  }
  return { debitAccount: expense[0], debitAccountName: expense[1], creditAccount: payable[0], creditAccountName: payable[1] };
}

function round(value: number): number {
  return Math.round(value);
}

function formatMinor(amountMinor: number, currency: string): string {
  const value = amountMinor / 100;
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function normalizePeriod(period?: string): { period: string; from: string; to: string } {
  const candidate = (period ?? '').trim() || config.today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)) {
    throw new Error('INVALID_PERIOD');
  }
  const from = `${candidate}-01`;
  return { period: candidate, from, to: endOfMonth(from) };
}

export function accrualForDeals(deals: AccrualDeal[], from: string, to: string): AccrualItem[] {
  const items: AccrualItem[] = [];

  const add = (
    deal: AccrualDeal,
    input: {
      accrualType: AccrualItem['accrualType'];
      from: string;
      to: string;
      days: number;
      dayBasis: DayBasis;
      rateBps: number | null;
      amountMinor: number;
      amountIdrMinor?: number;
      kind: AccrualItem['kind'];
      debit: Account;
      credit: Account;
      formula: string;
    },
  ) => {
    if (input.days <= 0 || input.amountMinor <= 0) return;
    const amountIdrMinor = input.amountIdrMinor ?? (deal.currency === 'IDR' ? input.amountMinor : round(input.amountMinor * (deal.fx_rate ?? 1)));
    items.push({
      dealId: deal.id,
      dealRef: deal.deal_ref,
      category: deal.category,
      categoryLabel: CATEGORY_LABELS[deal.category],
      counterparty: deal.counterparty_name,
      direction: deal.direction,
      currency: deal.currency,
      principalMinor: deal.notional_minor,
      principalIdrMinor: deal.notional_idr_minor,
      accrualType: input.accrualType,
      from: input.from,
      to: input.to,
      days: input.days,
      dayBasis: input.dayBasis,
      rateBps: input.rateBps,
      amountMinor: input.amountMinor,
      amountIdrMinor,
      kind: input.kind,
      debitAccount: input.debit[0],
      debitAccountName: input.debit[1],
      creditAccount: input.credit[0],
      creditAccountName: input.credit[1],
      formula: input.formula,
    });
  };

  for (const deal of deals) {
    const start = deal.value_date > from ? deal.value_date : from;
    const end = to < deal.maturity_date ? to : deal.maturity_date;
    const days = daysBetween(start, end);
    if (days <= 0) continue;
    const basis = basisFor(deal.category, deal.currency);
    const denominator = basis === 'ACT/365' ? 365 : 360;
    const rate = deal.rate_bps;
    const amount = formatMinor(deal.notional_minor, deal.currency);
    const formula = (rateBps: number) =>
      `${amount} × ${(rateBps / 100).toFixed(2)}% × ${days}/${denominator} (${basis})`;

    switch (deal.category) {
      case 'MM_CALL':
      case 'TIME_DEPOSIT': {
        if (rate === null) break;
        const kind = deal.direction === 'PLACE' ? 'INCOME' : 'EXPENSE';
        const value = interestMinor(deal.notional_minor, rate, start, end, basis);
        const postingRow = posting(kind, ACCOUNTS.interestReceivable, ACCOUNTS.interestPayable, ACCOUNTS.interestIncome, ACCOUNTS.interestExpense);
        add(deal, {
          accrualType: 'INTEREST',
          from: start,
          to: end,
          days,
          dayBasis: basis,
          rateBps: rate,
          amountMinor: value,
          kind,
          debit: [postingRow.debitAccount, postingRow.debitAccountName],
          credit: [postingRow.creditAccount, postingRow.creditAccountName],
          formula: formula(rate),
        });
        break;
      }
      case 'REPO': {
        if (rate === null) break;
        const kind = deal.direction === 'REPO' ? 'EXPENSE' : 'INCOME';
        const value = interestMinor(deal.notional_minor, rate, start, end, 'ACT/365');
        const postingRow = posting(kind, ACCOUNTS.interestReceivable, ACCOUNTS.interestPayable, ACCOUNTS.interestIncome, ACCOUNTS.interestExpense);
        add(deal, {
          accrualType: 'INTEREST',
          from: start,
          to: end,
          days,
          dayBasis: 'ACT/365',
          rateBps: rate,
          amountMinor: value,
          kind,
          debit: [postingRow.debitAccount, postingRow.debitAccountName],
          credit: [postingRow.creditAccount, postingRow.creditAccountName],
          formula: `${amount} × ${(rate / 100).toFixed(2)}% × ${days}/365 (repo rate, ACT/365)`,
        });
        break;
      }
      case 'GOV_BOND':
      case 'CORP_BOND': {
        if (deal.direction !== 'BUY' || deal.coupon_bps === null) break;
        const value = interestMinor(deal.notional_minor, deal.coupon_bps, start, end, basis);
        add(deal, {
          accrualType: 'COUPON',
          from: start,
          to: end,
          days,
          dayBasis: basis,
          rateBps: deal.coupon_bps,
          amountMinor: value,
          kind: 'INCOME',
          debit: ACCOUNTS.couponReceivable,
          credit: ACCOUNTS.couponIncome,
          formula: `${amount} × ${(deal.coupon_bps / 100).toFixed(2)}% × ${days}/${denominator} (coupon accrual, ${basis})`,
        });
        break;
      }
      case 'FX_FORWARD':
      case 'FX_SWAP': {
        const spot = deal.fx_rate;
        if (!spot) break;
        const tenor = Math.max(deal.tenor_days, 1);
        const elapsed = Math.min(daysBetween(deal.value_date, end), tenor);
        if (elapsed <= 0) break;
        const forward = fxForwardRate(spot, deal.currency, tenor);
        const totalPointsIdrMinor = deal.notional_idr_minor * (forward / spot - 1);
        const valueIdr = round((totalPointsIdrMinor * elapsed) / tenor);
        const valueMinor = round(valueIdr / spot);
        const isBuy = deal.direction === 'BUY' || deal.direction === 'BUY_SELL';
        const kind = isBuy ? 'EXPENSE' : 'INCOME';
        const postingRow = posting(kind, ACCOUNTS.forwardReceivable, ACCOUNTS.forwardPayable, ACCOUNTS.forwardIncome, ACCOUNTS.forwardExpense);
        add(deal, {
          accrualType: 'FX_POINTS',
          from: deal.value_date > start ? deal.value_date : start,
          to: end,
          days: elapsed,
          dayBasis: 'ACT/365',
          rateBps: null,
          amountMinor: valueMinor,
          amountIdrMinor: valueIdr,
          kind,
          debit: [postingRow.debitAccount, postingRow.debitAccountName],
          credit: [postingRow.creditAccount, postingRow.creditAccountName],
          formula: `${formatMinor(deal.notional_minor, deal.currency)} × (${forward.toFixed(2)} − ${spot.toFixed(2)}) × ${elapsed}/${tenor} (forward points)`,
        });
        break;
      }
      case 'IRS': {
        if (rate === null) break;
        const fixed = interestMinor(deal.notional_minor, rate, start, end, basis);
        const floating = interestMinor(deal.notional_minor, FLOATING_REFERENCE_BPS, start, end, basis);
        const diff = fixed - floating;
        if (diff === 0) break;
        const paysFixed = deal.direction === 'PAY_FIXED';
        const kind: AccrualItem['kind'] = (diff > 0) === paysFixed ? 'EXPENSE' : 'INCOME';
        const postingRow = posting(kind, ACCOUNTS.swapReceivable, ACCOUNTS.swapPayable, ACCOUNTS.swapIncome, ACCOUNTS.swapExpense);
        add(deal, {
          accrualType: 'SWAP_NET',
          from: start,
          to: end,
          days,
          dayBasis: basis,
          rateBps: rate,
          amountMinor: Math.abs(diff),
          kind,
          debit: [postingRow.debitAccount, postingRow.debitAccountName],
          credit: [postingRow.creditAccount, postingRow.creditAccountName],
          formula: `${amount} × (${(rate / 100).toFixed(2)}% fixed − ${(FLOATING_REFERENCE_BPS / 100).toFixed(2)}% floating) × ${days}/${denominator}`,
        });
        break;
      }
      case 'CORPORATE_LOAN':
      case 'SYNDICATED_LOAN':
      case 'PROJECT_FINANCE': {
        if (rate === null) break;
        const value = interestMinor(deal.notional_minor, rate, start, end, basis);
        add(deal, {
          accrualType: 'INTEREST',
          from: start,
          to: end,
          days,
          dayBasis: basis,
          rateBps: rate,
          amountMinor: value,
          kind: 'INCOME',
          debit: ACCOUNTS.interestReceivable,
          credit: ACCOUNTS.interestIncome,
          formula: formula(rate),
        });
        break;
      }
      case 'TRADE_FINANCE': {
        if (rate === null) break;
        const value = interestMinor(deal.notional_minor, rate, start, end, 'ACT/360');
        add(deal, {
          accrualType: 'FEE',
          from: start,
          to: end,
          days,
          dayBasis: 'ACT/360',
          rateBps: rate,
          amountMinor: value,
          kind: 'INCOME',
          debit: ACCOUNTS.feeReceivable,
          credit: ACCOUNTS.feeIncome,
          formula: `${amount} × ${(rate / 100).toFixed(2)}% × ${days}/360 (fee accrual, ACT/360)`,
        });
        break;
      }
      default:
        break;
    }
  }

  return items;
}

export function buildAccrualReport(items: AccrualItem[], period: string, from: string, to: string): AccrualReport {
  let incomeIdrMinor = 0n;
  let expenseIdrMinor = 0n;
  let principalIdrMinor = 0n;
  const byCategory = new Map<TreasuryCategory, {
    category: TreasuryCategory;
    label: string;
    deals: number;
    incomeIdrMinor: bigint;
    expenseIdrMinor: bigint;
  }>();
  const journalMap = new Map<string, { account: string; name: string; debitIdrMinor: bigint; creditIdrMinor: bigint }>();
  const journal = (account: string, name: string) => {
    const existing = journalMap.get(account);
    if (existing) return existing;
    const row = { account, name, debitIdrMinor: 0n, creditIdrMinor: 0n };
    journalMap.set(account, row);
    return row;
  };

  for (const item of items) {
    const amount = BigInt(item.amountIdrMinor);
    principalIdrMinor += BigInt(item.principalIdrMinor);
    if (item.kind === 'INCOME') incomeIdrMinor += amount;
    else expenseIdrMinor += amount;
    journal(item.debitAccount, item.debitAccountName).debitIdrMinor += amount;
    journal(item.creditAccount, item.creditAccountName).creditIdrMinor += amount;
    const bucket = byCategory.get(item.category) ?? {
      category: item.category,
      label: item.categoryLabel,
      deals: 0,
      incomeIdrMinor: 0n,
      expenseIdrMinor: 0n,
    };
    bucket.deals += 1;
    if (item.kind === 'INCOME') bucket.incomeIdrMinor += amount;
    else bucket.expenseIdrMinor += amount;
    byCategory.set(item.category, bucket);
  }

  const journalRows = [...journalMap.values()]
    .sort((a, b) => a.account.localeCompare(b.account))
    .map((row) => ({
      account: row.account,
      name: row.name,
      debitIdrMinor: Number(row.debitIdrMinor),
      creditIdrMinor: Number(row.creditIdrMinor),
    }));
  const debitTotal = [...journalMap.values()].reduce((sum, row) => sum + row.debitIdrMinor, 0n);
  const creditTotal = [...journalMap.values()].reduce((sum, row) => sum + row.creditIdrMinor, 0n);

  return {
    period,
    from,
    to,
    generatedAt: new Date().toISOString(),
    totals: {
      deals: new Set(items.map((item) => item.dealId)).size,
      incomeIdrMinor: Number(incomeIdrMinor),
      expenseIdrMinor: Number(expenseIdrMinor),
      netIdrMinor: Number(incomeIdrMinor - expenseIdrMinor),
      principalIdrMinor: Number(principalIdrMinor),
    },
    byCategory: [...byCategory.values()]
      .map((row) => ({
        category: row.category,
        label: row.label,
        deals: row.deals,
        incomeIdrMinor: Number(row.incomeIdrMinor),
        expenseIdrMinor: Number(row.expenseIdrMinor),
        netIdrMinor: Number(row.incomeIdrMinor - row.expenseIdrMinor),
      }))
      .sort((a, b) => b.netIdrMinor - a.netIdrMinor),
    journal: journalRows,
    balanced: debitTotal === creditTotal,
    items,
  };
}

let cache: { key: string; report: AccrualReport } | null = null;

export function computeAccrual(periodInput?: string): AccrualReport {
  const { period, from, to } = normalizePeriod(periodInput);
  const fingerprint = one<{ n: number; created: string }>(
    'SELECT COUNT(*) AS n, MAX(created_at) AS created FROM treasury_deals',
  );
  const key = `${period}|${fingerprint?.n ?? 0}|${fingerprint?.created ?? ''}`;
  if (cache && cache.key === key) return cache.report;

  const deals = all<AccrualDeal>(
    `SELECT d.id, d.deal_ref, d.category, d.direction, d.currency, d.notional_minor, d.notional_idr_minor,
            d.fx_rate, d.rate_bps, d.coupon_bps, d.value_date, d.maturity_date, d.tenor_days,
            c.name AS counterparty_name
       FROM treasury_deals d
       JOIN treasury_counterparties c ON c.id = d.counterparty_id
      WHERE d.value_date <= ? AND d.maturity_date > ? AND d.duplicate_of IS NULL
      ORDER BY d.deal_ref`,
    to,
    to,
  );

  const report = buildAccrualReport(accrualForDeals(deals, from, to), period, from, to);
  cache = { key, report };
  return report;
}
