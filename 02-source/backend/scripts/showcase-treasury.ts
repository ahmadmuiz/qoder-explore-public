import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sha256Hex } from '../src/lib/ids.js';
import { CATEGORY_LABELS, CATEGORY_SPECS, COUNTERPARTIES } from '../src/domain/treasury/catalog.js';
import { expectedLegs, fxForwardRate, type CalcDeal } from '../src/domain/treasury/calc.js';
import { accrualForDeals, type AccrualDeal, type AccrualItem } from '../src/domain/treasury/accrual.js';

interface ShowcaseDeal extends CalcDeal {
  id: string;
  dealRef: string;
  instrumentCode: string;
  counterpartyIndex: number;
  portfolio: string;
  desk: string;
  status: string;
}

const today = '2026-11-19';
const periodFrom = '2026-11-01';
const periodTo = '2026-11-30';

const deals: ShowcaseDeal[] = [
  {
    id: 'tdl_show_001',
    dealRef: 'MM-CALL-2026-900001',
    category: 'MM_CALL',
    instrumentCode: 'IDR call placement',
    direction: 'PLACE',
    counterpartyIndex: 0,
    tradeDate: '2026-11-18',
    valueDate: '2026-11-18',
    maturityDate: '2026-12-02',
    currency: 'IDR',
    notionalMinor: 250_000_000_000 * 100,
    notionalIdrMinor: 250_000_000_000 * 100,
    fxRate: null,
    rateBps: 580,
    price: null,
    couponBps: null,
    tenorDays: 14,
    portfolio: 'Liquidity buffer',
    desk: 'Money Market',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_002',
    dealRef: 'TIME-DEPOSIT-2026-900002',
    category: 'TIME_DEPOSIT',
    instrumentCode: 'IDR time deposit',
    direction: 'PLACE',
    counterpartyIndex: 2,
    tradeDate: '2026-10-14',
    valueDate: '2026-10-15',
    maturityDate: '2027-01-13',
    currency: 'IDR',
    notionalMinor: 500_000_000_000 * 100,
    notionalIdrMinor: 500_000_000_000 * 100,
    fxRate: null,
    rateBps: 615,
    price: null,
    couponBps: null,
    tenorDays: 90,
    portfolio: 'Liquidity buffer',
    desk: 'Money Market',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_003',
    dealRef: 'REPO-2026-900003',
    category: 'REPO',
    instrumentCode: 'FR-series repo',
    direction: 'REPO',
    counterpartyIndex: 1,
    tradeDate: '2026-11-09',
    valueDate: '2026-11-10',
    maturityDate: '2026-12-10',
    currency: 'IDR',
    notionalMinor: 1_000_000_000_000 * 100,
    notionalIdrMinor: 1_000_000_000_000 * 100,
    fxRate: null,
    rateBps: 560,
    price: null,
    couponBps: null,
    tenorDays: 30,
    portfolio: 'HQLA portfolio',
    desk: 'Securities Finance',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_004',
    dealRef: 'GOV-BOND-2026-900004',
    category: 'GOV_BOND',
    instrumentCode: 'FR0090',
    direction: 'BUY',
    counterpartyIndex: 31,
    tradeDate: '2026-11-04',
    valueDate: '2026-11-05',
    maturityDate: '2030-03-15',
    currency: 'IDR',
    notionalMinor: 500_000_000_000 * 100,
    notionalIdrMinor: 500_000_000_000 * 100,
    fxRate: null,
    rateBps: null,
    price: 98.75,
    couponBps: 650,
    tenorDays: 1226,
    portfolio: 'HQLA portfolio',
    desk: 'Securities',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_005',
    dealRef: 'CORP-BOND-2026-900005',
    category: 'CORP_BOND',
    instrumentCode: 'AA corporate bond',
    direction: 'BUY',
    counterpartyIndex: 34,
    tradeDate: '2026-11-06',
    valueDate: '2026-11-09',
    maturityDate: '2031-06-30',
    currency: 'USD',
    notionalMinor: 25_000_000 * 100,
    notionalIdrMinor: Math.round(25_000_000 * 100 * 16_250),
    fxRate: 16_250,
    rateBps: null,
    price: 101.25,
    couponBps: 675,
    tenorDays: 1694,
    portfolio: 'Banking book',
    desk: 'Securities',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_006',
    dealRef: 'FX-SPOT-2026-900006',
    category: 'FX_SPOT',
    instrumentCode: 'USD/IDR',
    direction: 'BUY',
    counterpartyIndex: 5,
    tradeDate: '2026-11-17',
    valueDate: '2026-11-19',
    maturityDate: '2026-11-19',
    currency: 'USD',
    notionalMinor: 10_000_000 * 100,
    notionalIdrMinor: Math.round(10_000_000 * 100 * 16_250),
    fxRate: 16_250,
    rateBps: null,
    price: null,
    couponBps: null,
    tenorDays: 0,
    portfolio: 'FX book',
    desk: 'Treasury FX',
    status: 'SETTLED',
  },
  {
    id: 'tdl_show_007',
    dealRef: 'FX-FORWARD-2026-900007',
    category: 'FX_FORWARD',
    instrumentCode: 'USD/IDR forward',
    direction: 'SELL',
    counterpartyIndex: 8,
    tradeDate: '2026-11-02',
    valueDate: '2026-11-04',
    maturityDate: '2027-02-02',
    currency: 'USD',
    notionalMinor: 25_000_000 * 100,
    notionalIdrMinor: Math.round(25_000_000 * 100 * 16_250),
    fxRate: 16_250,
    rateBps: null,
    price: null,
    couponBps: null,
    tenorDays: 90,
    portfolio: 'FX book',
    desk: 'Treasury FX',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_008',
    dealRef: 'FX-SWAP-2026-900008',
    category: 'FX_SWAP',
    instrumentCode: 'USD/IDR FX swap',
    direction: 'BUY_SELL',
    counterpartyIndex: 10,
    tradeDate: '2026-11-10',
    valueDate: '2026-11-12',
    maturityDate: '2026-12-12',
    currency: 'USD',
    notionalMinor: 50_000_000 * 100,
    notionalIdrMinor: Math.round(50_000_000 * 100 * 16_250),
    fxRate: 16_250,
    rateBps: null,
    price: null,
    couponBps: null,
    tenorDays: 30,
    portfolio: 'FX book',
    desk: 'Treasury FX',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_009',
    dealRef: 'IRS-2026-900009',
    category: 'IRS',
    instrumentCode: 'IDR fixed vs IndONIA',
    direction: 'PAY_FIXED',
    counterpartyIndex: 7,
    tradeDate: '2026-11-05',
    valueDate: '2026-11-06',
    maturityDate: '2031-11-06',
    currency: 'IDR',
    notionalMinor: 2_000_000_000_000 * 100,
    notionalIdrMinor: 2_000_000_000_000 * 100,
    fxRate: null,
    rateBps: 610,
    price: null,
    couponBps: null,
    tenorDays: 1826,
    portfolio: 'Hedging book',
    desk: 'Rates',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_010',
    dealRef: 'CORPORATE-LOAN-2026-900010',
    category: 'CORPORATE_LOAN',
    instrumentCode: 'Term loan',
    direction: 'DRAW',
    counterpartyIndex: 12,
    tradeDate: '2026-09-29',
    valueDate: '2026-09-30',
    maturityDate: '2029-09-30',
    currency: 'IDR',
    notionalMinor: 750_000_000_000 * 100,
    notionalIdrMinor: 750_000_000_000 * 100,
    fxRate: null,
    rateBps: 925,
    price: null,
    couponBps: null,
    tenorDays: 1096,
    portfolio: 'Corporate lending',
    desk: 'Corporate Finance',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_011',
    dealRef: 'SYNDICATED-LOAN-2026-900011',
    category: 'SYNDICATED_LOAN',
    instrumentCode: 'Syndicated term loan',
    direction: 'DRAW',
    counterpartyIndex: 13,
    tradeDate: '2026-10-19',
    valueDate: '2026-10-20',
    maturityDate: '2031-10-20',
    currency: 'IDR',
    notionalMinor: 2_500_000_000_000 * 100,
    notionalIdrMinor: 2_500_000_000_000 * 100,
    fxRate: null,
    rateBps: 875,
    price: null,
    couponBps: null,
    tenorDays: 1826,
    portfolio: 'Syndicated lending',
    desk: 'Corporate Finance',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_012',
    dealRef: 'PROJECT-FINANCE-2026-900012',
    category: 'PROJECT_FINANCE',
    instrumentCode: 'Project finance facility',
    direction: 'DRAW',
    counterpartyIndex: 25,
    tradeDate: '2026-10-30',
    valueDate: '2026-10-31',
    maturityDate: '2034-10-31',
    currency: 'IDR',
    notionalMinor: 4_000_000_000_000 * 100,
    notionalIdrMinor: 4_000_000_000_000 * 100,
    fxRate: null,
    rateBps: 1050,
    price: null,
    couponBps: null,
    tenorDays: 2922,
    portfolio: 'Infrastructure lending',
    desk: 'Corporate Finance',
    status: 'OPEN',
  },
  {
    id: 'tdl_show_013',
    dealRef: 'TRADE-FINANCE-2026-900013',
    category: 'TRADE_FINANCE',
    instrumentCode: 'Usance LC',
    direction: 'ISSUE',
    counterpartyIndex: 21,
    tradeDate: '2026-11-03',
    valueDate: '2026-11-04',
    maturityDate: '2027-02-02',
    currency: 'USD',
    notionalMinor: 3_000_000 * 100,
    notionalIdrMinor: Math.round(3_000_000 * 100 * 16_250),
    fxRate: 16_250,
    rateBps: 85,
    price: null,
    couponBps: null,
    tenorDays: 90,
    portfolio: 'Trade assets',
    desk: 'Trade Finance',
    status: 'OPEN',
  },
];

function counterpartyId(index: number): string {
  return `tcp_${String(index + 1).padStart(3, '0')}`;
}

function formatMinor(amountMinor: number, currency: string): string {
  const formatted = (amountMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${formatted}`;
}

function formatIdr(amountMinor: number): string {
  return `Rp ${(amountMinor / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const snakeDeals: AccrualDeal[] = deals.map((deal) => ({
  id: deal.id,
  deal_ref: deal.dealRef,
  category: deal.category,
  direction: deal.direction,
  currency: deal.currency,
  notional_minor: deal.notionalMinor,
  notional_idr_minor: deal.notionalIdrMinor,
  fx_rate: deal.fxRate,
  rate_bps: deal.rateBps,
  coupon_bps: deal.couponBps,
  value_date: deal.valueDate,
  maturity_date: deal.maturityDate,
  tenor_days: deal.tenorDays,
  counterparty_name: COUNTERPARTIES[deal.counterpartyIndex]!.name,
}));

const accruals = accrualForDeals(snakeDeals, periodFrom, periodTo);
const accrualsByDeal = new Map<string, AccrualItem[]>();
for (const item of accruals) {
  const bucket = accrualsByDeal.get(item.dealId) ?? [];
  bucket.push(item);
  accrualsByDeal.set(item.dealId, bucket);
}

const output = {
  generatedAt: new Date().toISOString(),
  asOf: periodTo,
  conventions: {
    idr: 'ACT/365',
    foreignCurrency: 'ACT/360',
    bondCoupon: 'semi-annual, ACT/365 IDR / ACT/360 FX',
    fxSpotSettlement: 'T+2 business days',
    fxForward: 'USD/IDR = spot x (1 + IDR rate x days/365) / (1 + USD rate x days/360)',
    floatingReference: 'IndONIA 5.35%',
    rounding: 'minor units (1/100), half-up',
  },
  deals: deals.map((deal) => {
    const counterparty = COUNTERPARTIES[deal.counterpartyIndex]!;
    const spec = CATEGORY_SPECS[deal.category];
    const legs = expectedLegs(deal).map((leg, index) => ({
      legNo: index + 1,
      ...leg,
      settlementRef: `STL-${deal.dealRef}-${index + 1}`,
      status: 'SETTLED',
    }));
    const documents = spec.requiredDocs.map((docType, index) => {
      const extracted = {
        docNumber: `${deal.category.replaceAll('_', '-')}-SHOW-${index + 1}-${docType.slice(0, 3)}`,
        docType,
        dealRef: deal.dealRef,
        counterpartyId: counterpartyId(deal.counterpartyIndex),
        counterpartyName: counterparty.name,
        currency: deal.currency,
        notionalMinor: deal.notionalMinor,
        fxRate: deal.fxRate,
        rateBps: deal.rateBps,
        price: deal.price,
        tradeDate: deal.tradeDate,
        valueDate: deal.valueDate,
        maturityDate: deal.maturityDate,
      };
      return {
        docType,
        docNumber: extracted.docNumber,
        source: docType === 'CUSTODY_STATEMENT' ? 'CUSTODIAN' : 'EMAIL',
        receivedAt: deal.valueDate,
        sha256: sha256Hex(JSON.stringify(extracted)),
        extracted,
      };
    });
    return {
      id: deal.id,
      dealRef: deal.dealRef,
      category: deal.category,
      categoryLabel: CATEGORY_LABELS[deal.category],
      instrumentCode: deal.instrumentCode,
      direction: deal.direction,
      counterparty: { id: counterpartyId(deal.counterpartyIndex), ...counterparty },
      tradeDate: deal.tradeDate,
      valueDate: deal.valueDate,
      maturityDate: deal.maturityDate,
      currency: deal.currency,
      notionalMinor: deal.notionalMinor,
      notionalIdrMinor: deal.notionalIdrMinor,
      fxRate: deal.fxRate,
      rateBps: deal.rateBps,
      price: deal.price,
      couponBps: deal.couponBps,
      tenorDays: deal.tenorDays,
      portfolio: spec.portfolio,
      desk: spec.desk,
      status: deal.status,
      legs,
      documents,
      accrual: accrualsByDeal.get(deal.id) ?? [],
    };
  }),
  accrualReport: {
    period: periodFrom.slice(0, 7),
    from: periodFrom,
    to: periodTo,
    totals: {
      deals: new Set(accruals.map((item) => item.dealId)).size,
      incomeIdrMinor: accruals.filter((item) => item.kind === 'INCOME').reduce((sum, item) => sum + item.amountIdrMinor, 0),
      expenseIdrMinor: accruals.filter((item) => item.kind === 'EXPENSE').reduce((sum, item) => sum + item.amountIdrMinor, 0),
    },
    items: accruals,
  },
};

const root = join(import.meta.dirname, '..');
const jsonPath = join(root, 'data', 'sample', 'treasury', 'showcase-deals.json');
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);

const accrualTotals = output.accrualReport.totals;
const net = accrualTotals.incomeIdrMinor - accrualTotals.expenseIdrMinor;

const journalRows = new Map<string, { name: string; debit: number; credit: number }>();
for (const item of accruals) {
  const debit = journalRows.get(item.debitAccount) ?? { name: item.debitAccountName, debit: 0, credit: 0 };
  debit.debit += item.amountIdrMinor;
  journalRows.set(item.debitAccount, debit);
  const credit = journalRows.get(item.creditAccount) ?? { name: item.creditAccountName, debit: 0, credit: 0 };
  credit.credit += item.amountIdrMinor;
  journalRows.set(item.creditAccount, credit);
}
const journal = [...journalRows.entries()].sort(([a], [b]) => a.localeCompare(b));
const debitTotal = journal.reduce((sum, [, row]) => sum + row.debit, 0);
const creditTotal = journal.reduce((sum, [, row]) => sum + row.credit, 0);

const lines: string[] = [];
lines.push('# Treasury worked examples — realistic deals, calculations and month-end accrual');
lines.push('');
lines.push(`Reference portfolio as of **${periodTo}** · ${deals.length} deals · reconciled from deal, document and cashflow records.`);
lines.push('');
lines.push('## 1. Calculation conventions');
lines.push('');
lines.push('| Rule | Convention |');
lines.push('| --- | --- |');
lines.push('| IDR interest and repo | Actual/365, simple interest, day count excludes the first day |');
lines.push('| FX and USD-denominated interest | Actual/360 |');
lines.push('| Bond coupon | Semi-annual fixed coupon, accrued on ACT/365 (IDR) or ACT/360 (FX) |');
lines.push('| Bond settlement | Clean price × face + accrued coupon since the previous coupon date |');
lines.push('| FX spot | T+2 business-day value date |');
lines.push('| FX forward and swap | Forward rate = spot × (1 + IDR rate × days/365) ÷ (1 + foreign rate × days/360); premium accrues linearly over the tenor |');
lines.push('| IRS | Fixed 6.10% vs IndONIA 5.35%, net accrual on the notional |');
lines.push('| Trade finance | Fee accrual ACT/360 on the facility amount |');
lines.push('| Rounding | Minor units (1/100), half-up at the final calculation only |');
lines.push('');
lines.push('## 2. Sample deals');
lines.push('');
lines.push('| Deal | Product | Counterparty | Currency | Notional | Rate / price | Value date | Maturity |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const deal of deals) {
  const counterparty = COUNTERPARTIES[deal.counterpartyIndex]!;
  const terms = deal.rateBps !== null
    ? `${(deal.rateBps / 100).toFixed(2)}%`
    : deal.couponBps !== null
      ? `coupon ${(deal.couponBps / 100).toFixed(2)}% @ ${deal.price?.toFixed(2)}`
      : '—';
  lines.push(
    `| ${deal.dealRef} | ${CATEGORY_LABELS[deal.category]} | ${counterparty.name} | ${deal.currency} | ${formatMinor(deal.notionalMinor, deal.currency)} | ${terms} | ${deal.valueDate} | ${deal.maturityDate} |`,
  );
}
lines.push('');
lines.push('## 3. Worked examples');
lines.push('');
for (const deal of deals) {
  const counterparty = COUNTERPARTIES[deal.counterpartyIndex]!;
  const legs = expectedLegs(deal);
  lines.push(`### ${deal.dealRef} — ${CATEGORY_LABELS[deal.category]}`);
  lines.push('');
  lines.push(`**Terms.** ${deal.instrumentCode}, ${deal.direction}, ${counterparty.name} (${counterparty.rating}, ${counterparty.country}). Notional ${formatMinor(deal.notionalMinor, deal.currency)}${deal.currency === 'IDR' ? '' : ` (${formatIdr(deal.notionalIdrMinor)} at ${deal.fxRate?.toFixed(2)})`}, value ${deal.valueDate}, maturity ${deal.maturityDate}.`);
  if (deal.category === 'GOV_BOND' || deal.category === 'CORP_BOND') {
    const previous = 'coupon schedule anchored on maturity';
    lines.push(`Coupon ${(deal.couponBps! / 100).toFixed(2)}% paid semi-annually; clean price ${deal.price?.toFixed(2)}; settlement includes accrued coupon (${previous}).`);
  }
  if (deal.category === 'FX_FORWARD' || deal.category === 'FX_SWAP') {
    lines.push(`Forward rate ${fxForwardRate(deal.fxRate!, deal.currency, deal.tenorDays).toFixed(2)} for ${deal.tenorDays} days against spot ${deal.fxRate?.toFixed(2)}.`);
  }
  lines.push('');
  lines.push('| Leg | Type | Direction | Amount | Value date |');
  lines.push('| --- | --- | --- | --- | --- |');
  legs.forEach((leg, index) => {
    lines.push(`| ${index + 1} | ${leg.legType} | ${leg.direction} | ${formatMinor(leg.amountMinor, leg.currency)} | ${leg.valueDate} |`);
  });
  const items = accrualsByDeal.get(deal.id) ?? [];
  if (items.length) {
    lines.push('');
    lines.push('**Month-end accrual (1–30 Nov 2026).**');
    for (const item of items) {
      lines.push(`- ${item.accrualType}: ${item.formula} = **${formatIdr(item.amountIdrMinor)}** → Dr ${item.debitAccount} / Cr ${item.creditAccount} (${item.kind.toLowerCase()}).`);
    }
  } else {
    lines.push('');
    lines.push('No accrual at month-end (settled or matured before the reporting date).');
  }
  lines.push('');
}

lines.push('## 4. Month-end accrual report');
lines.push('');
lines.push(`Income ${formatIdr(accrualTotals.incomeIdrMinor)} · expense ${formatIdr(accrualTotals.expenseIdrMinor)} · net ${formatIdr(net)} across ${accrualTotals.deals} deals.`);
lines.push('');
lines.push('| Account | Name | Debit | Credit |');
lines.push('| --- | --- | --- | --- |');
for (const [account, row] of journal) {
  lines.push(`| ${account} | ${row.name} | ${row.debit ? formatIdr(row.debit) : '—'} | ${row.credit ? formatIdr(row.credit) : '—'} |`);
}
lines.push(`| | **Total** | **${formatIdr(debitTotal)}** | **${formatIdr(creditTotal)}** |`);
lines.push('');
lines.push(debitTotal === creditTotal ? 'The journal is balanced: total debits equal total credits.' : 'WARNING: journal does not balance.');
lines.push('');
lines.push('## 5. Verification');
lines.push('');
lines.push('```bash');
lines.push('cd 02-source/backend');
lines.push('npm run seed:treasury                       # regenerate the full book');
lines.push('curl -s -H "authorization: Bearer $TOKEN" \\');
lines.push('  "http://127.0.0.1:4100/api/treasury/accrual?period=2026-11" | jq .totals');
lines.push('curl -s -H "authorization: Bearer $TOKEN" \\');
lines.push('  "http://127.0.0.1:4100/api/treasury/accrual/export?period=2026-11" -o accrual-2026-11.csv');
lines.push('```');
lines.push('');
lines.push('The console exposes the same report under **Treasury → Month-end accrual**, including the double-entry journal and per-deal formula.');
lines.push('');
lines.push('## 6. Data-quality notes');
lines.push('');
lines.push('- The showcase deals are synthetic reference data; names and amounts are fictitious but the calculation logic is the same code used by the seeded book.');
lines.push('- Accruals are computed for deals that are live at month-end (`value_date <= month-end < maturity_date`); duplicate deals are excluded.');
lines.push('- FX forward point accrual is a linear premium amortisation for reporting; fair-value revaluation is out of scope for the pilot.');
lines.push('- Day-count conventions follow the pilot rule set; real contracts can specify 30/360 or modified following and must be mapped in the deal capture.');
lines.push('- IRS and loan records carry one representative cashflow leg per direction in this reference set; the production schedule would carry every periodic fixing and payment date.');

const markdownPath = join(root, '..', '..', '01-documents', 'TREASURY-WORKED-EXAMPLES.md');
writeFileSync(markdownPath, `${lines.join('\n')}\n`);

console.log(`Deals: ${deals.length}`);
console.log(`Legs: ${output.deals.reduce((sum, deal) => sum + deal.legs.length, 0)}`);
console.log(`Documents: ${output.deals.reduce((sum, deal) => sum + deal.documents.length, 0)}`);
console.log(`Accrual entries: ${accruals.length}`);
console.log(`Income ${formatIdr(accrualTotals.incomeIdrMinor)} · expense ${formatIdr(accrualTotals.expenseIdrMinor)} · net ${formatIdr(net)}`);
console.log(`Balanced: ${debitTotal === creditTotal}`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${markdownPath}`);
