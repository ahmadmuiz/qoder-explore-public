import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accrualForDeals,
  buildAccrualReport,
  normalizePeriod,
  type AccrualDeal,
  type AccrualItem,
} from '../src/domain/treasury/accrual.js';
import { basisFor, interestMinor } from '../src/domain/treasury/calc.js';
import { daysBetween } from '../src/lib/dates.js';

const FROM = '2026-11-01';
const TO = '2026-11-30';

function makeDeal(overrides: Partial<AccrualDeal> = {}): AccrualDeal {
  return {
    id: 'D-1',
    deal_ref: 'D-1',
    category: 'MM_CALL',
    direction: 'PLACE',
    currency: 'IDR',
    notional_minor: 25_000_000_000_000,
    notional_idr_minor: 25_000_000_000_000,
    fx_rate: null,
    rate_bps: 580,
    coupon_bps: null,
    value_date: '2026-11-18',
    maturity_date: '2026-12-02',
    tenor_days: 14,
    counterparty_name: 'Bank Test',
    ...overrides,
  };
}

const mmCall = makeDeal();

const repo = makeDeal({
  id: 'D-2',
  deal_ref: 'D-2',
  category: 'REPO',
  direction: 'REPO',
  notional_minor: 100_000_000_000_000,
  notional_idr_minor: 100_000_000_000_000,
  rate_bps: 560,
  value_date: '2026-11-10',
  maturity_date: '2026-12-10',
  tenor_days: 30,
});

const usdBond = makeDeal({
  id: 'D-3',
  deal_ref: 'D-3',
  category: 'CORP_BOND',
  direction: 'BUY',
  currency: 'USD',
  notional_minor: 2_500_000_000,
  notional_idr_minor: 40_625_000_000_000,
  fx_rate: 16250,
  rate_bps: null,
  coupon_bps: 675,
  value_date: '2026-11-09',
  maturity_date: '2031-06-30',
  tenor_days: 2059,
});

const irs = makeDeal({
  id: 'D-4',
  deal_ref: 'D-4',
  category: 'IRS',
  direction: 'PAY_FIXED',
  notional_minor: 200_000_000_000_000,
  notional_idr_minor: 200_000_000_000_000,
  rate_bps: 610,
  value_date: '2026-11-06',
  maturity_date: '2031-11-06',
  tenor_days: 1826,
});

const tradeFinance = makeDeal({
  id: 'D-5',
  deal_ref: 'D-5',
  category: 'TRADE_FINANCE',
  direction: 'ISSUE',
  currency: 'USD',
  notional_minor: 300_000_000,
  notional_idr_minor: 4_875_000_000_000,
  fx_rate: 16250,
  rate_bps: 85,
  value_date: '2026-11-04',
  maturity_date: '2027-02-02',
  tenor_days: 90,
});

function findItem(items: AccrualItem[], dealId: string): AccrualItem {
  const item = items.find((candidate) => candidate.dealId === dealId);
  assert.ok(item, `expected an accrual item for ${dealId}`);
  return item;
}

test('day count excludes the first day and uses actual calendar days', () => {
  assert.equal(daysBetween('2026-11-18', '2026-11-30'), 12);
  assert.equal(daysBetween('2026-11-10', '2026-11-30'), 20);
  assert.equal(daysBetween('2026-11-30', '2026-11-30'), 0);
});

test('interestMinor applies ACT/365 and ACT/360 denominators', () => {
  assert.equal(interestMinor(25_000_000_000_000, 580, '2026-11-18', '2026-11-30', 'ACT/365'), 47_671_232_877);
  assert.equal(interestMinor(100_000_000_000_000, 560, '2026-11-10', '2026-11-30', 'ACT/365'), 306_849_315_068);
  assert.equal(interestMinor(2_500_000_000, 675, '2026-11-09', '2026-11-30', 'ACT/360'), 9_843_750);
  assert.equal(interestMinor(200_000_000_000_000, 75, '2026-11-06', '2026-11-30', 'ACT/365'), 98_630_136_986);
  assert.equal(interestMinor(300_000_000, 85, '2026-11-04', '2026-11-30', 'ACT/360'), 184_167);
});

test('basisFor follows the product and currency conventions', () => {
  assert.equal(basisFor('GOV_BOND', 'IDR'), 'ACT/365');
  assert.equal(basisFor('CORP_BOND', 'USD'), 'ACT/360');
  assert.equal(basisFor('TIME_DEPOSIT', 'IDR'), 'ACT/365');
  assert.equal(basisFor('FX_FORWARD', 'USD'), 'ACT/360');
  assert.equal(basisFor('CORPORATE_LOAN', 'IDR'), 'ACT/365');
});

test('normalizePeriod resolves month boundaries', () => {
  assert.deepEqual(normalizePeriod('2026-11'), { period: '2026-11', from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(normalizePeriod('2028-02'), { period: '2028-02', from: '2028-02-01', to: '2028-02-29' });
  assert.throws(() => normalizePeriod('2026-13'), /INVALID_PERIOD/);
  assert.throws(() => normalizePeriod('2026-1'), /INVALID_PERIOD/);
});

test('accrualForDeals computes one entry per live deal with the right amount and posting', () => {
  const items = accrualForDeals([mmCall, repo, usdBond, irs, tradeFinance], FROM, TO);
  assert.equal(items.length, 5);

  const mm = findItem(items, 'D-1');
  assert.equal(mm.accrualType, 'INTEREST');
  assert.equal(mm.kind, 'INCOME');
  assert.equal(mm.days, 12);
  assert.equal(mm.dayBasis, 'ACT/365');
  assert.equal(mm.amountMinor, 47_671_232_877);
  assert.equal(mm.amountIdrMinor, 47_671_232_877);
  assert.equal(mm.debitAccount, '1201');
  assert.equal(mm.creditAccount, '4101');

  const repoItem = findItem(items, 'D-2');
  assert.equal(repoItem.kind, 'EXPENSE');
  assert.equal(repoItem.days, 20);
  assert.equal(repoItem.amountMinor, 306_849_315_068);
  assert.equal(repoItem.debitAccount, '5101');
  assert.equal(repoItem.creditAccount, '2101');

  const bond = findItem(items, 'D-3');
  assert.equal(bond.accrualType, 'COUPON');
  assert.equal(bond.dayBasis, 'ACT/360');
  assert.equal(bond.days, 21);
  assert.equal(bond.amountMinor, 9_843_750);
  assert.equal(bond.amountIdrMinor, 159_960_937_500);
  assert.match(bond.formula, /21\/360/);
  assert.equal(bond.debitAccount, '1202');
  assert.equal(bond.creditAccount, '4102');

  const irsItem = findItem(items, 'D-4');
  assert.equal(irsItem.accrualType, 'SWAP_NET');
  assert.equal(irsItem.kind, 'EXPENSE');
  assert.equal(irsItem.days, 24);
  assert.equal(irsItem.amountMinor, 98_630_136_986);
  assert.equal(irsItem.debitAccount, '5105');
  assert.equal(irsItem.creditAccount, '2105');

  const fee = findItem(items, 'D-5');
  assert.equal(fee.accrualType, 'FEE');
  assert.equal(fee.kind, 'INCOME');
  assert.equal(fee.days, 26);
  assert.equal(fee.amountMinor, 184_167);
  assert.equal(fee.amountIdrMinor, 2_992_713_750);
  assert.equal(fee.debitAccount, '1206');
  assert.equal(fee.creditAccount, '4106');
});

test('accrual window clips deals to the month and skips future deals', () => {
  const maturedOnMonthEnd = makeDeal({ value_date: '2026-11-01', maturity_date: '2026-11-30' });
  const startsNextMonth = makeDeal({ value_date: '2026-12-01' });
  const endsOnFirstDay = makeDeal({ value_date: '2026-11-01', maturity_date: '2026-11-02' });

  const matured = accrualForDeals([maturedOnMonthEnd], FROM, TO);
  assert.equal(matured.length, 1);
  assert.equal(matured[0]?.days, 29);
  assert.equal(matured[0]?.to, '2026-11-30');

  assert.equal(accrualForDeals([startsNextMonth], FROM, TO).length, 0);

  const early = accrualForDeals([endsOnFirstDay], FROM, TO);
  assert.equal(early.length, 1);
  assert.equal(early[0]?.days, 1);
});

test('buildAccrualReport produces a balanced double-entry journal', () => {
  const items = accrualForDeals([mmCall, repo, usdBond, irs, tradeFinance], FROM, TO);
  const report = buildAccrualReport(items, '2026-11', FROM, TO);

  assert.equal(report.balanced, true);
  const debitTotal = report.journal.reduce((sum, row) => sum + row.debitIdrMinor, 0);
  const creditTotal = report.journal.reduce((sum, row) => sum + row.creditIdrMinor, 0);
  assert.equal(debitTotal, creditTotal);

  const income = items.filter((item) => item.kind === 'INCOME').reduce((sum, item) => sum + item.amountIdrMinor, 0);
  const expense = items.filter((item) => item.kind === 'EXPENSE').reduce((sum, item) => sum + item.amountIdrMinor, 0);
  assert.equal(report.totals.incomeIdrMinor, income);
  assert.equal(report.totals.expenseIdrMinor, expense);
  assert.equal(report.totals.netIdrMinor, income - expense);
  assert.equal(report.totals.deals, 5);
  assert.equal(debitTotal, income + expense);

  const accounts = report.journal.map((row) => row.account);
  for (const account of ['1201', '1202', '1206', '2101', '2105', '4101', '4102', '4106', '5101', '5105']) {
    assert.ok(accounts.includes(account), `journal is missing account ${account}`);
  }

  const income1201 = report.journal.find((row) => row.account === '1201');
  assert.equal(income1201?.debitIdrMinor, 47_671_232_877);
  const expense5101 = report.journal.find((row) => row.account === '5101');
  assert.equal(expense5101?.debitIdrMinor, 306_849_315_068);
  const payable2101 = report.journal.find((row) => row.account === '2101');
  assert.equal(payable2101?.creditIdrMinor, 306_849_315_068);
});
