import { config } from '../../config.js';
import { getDb, tx } from '../../db/index.js';
import { addDays, daysBetween, nowIso } from '../../lib/dates.js';
import { sha256Hex } from '../../lib/ids.js';
import {
  CATEGORY_SPECS,
  COUNTERPARTIES,
  FX_RATES,
  REQUIRED_LEGS,
  TREASURY_CATEGORIES,
  type TreasuryCategory,
  type TreasuryDocType,
} from './catalog.js';
import { addBusinessDays, addMonths, endOfMonth, expectedLegs } from './calc.js';

type Anomaly =
  | 'NONE'
  | 'MISSING_DOC'
  | 'DOC_NOTIONAL'
  | 'DOC_RATE'
  | 'DOC_DATE'
  | 'MISSING_LEG'
  | 'LEG_AMOUNT'
  | 'DUPLICATE'
  | 'CUSTODY'
  | 'COUNTERPARTY'
  | 'MATURITY'
  | 'FX_RATE';

const ANOMALY_WEIGHTS: Array<[Anomaly, number]> = [
  ['NONE', 0.935],
  ['MISSING_DOC', 0.012],
  ['DOC_NOTIONAL', 0.008],
  ['DOC_RATE', 0.007],
  ['DOC_DATE', 0.006],
  ['MISSING_LEG', 0.009],
  ['LEG_AMOUNT', 0.005],
  ['DUPLICATE', 0.003],
  ['CUSTODY', 0.004],
  ['COUNTERPARTY', 0.003],
  ['MATURITY', 0.003],
  ['FX_RATE', 0.005],
];

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

const pick = <T,>(random: Random, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const int = (random: Random, min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

function chooseAnomaly(random: Random, category: TreasuryCategory): Anomaly {
  const draw = random();
  let cursor = 0;
  for (const [anomaly, weight] of ANOMALY_WEIGHTS) {
    cursor += weight;
    if (draw <= cursor) {
      if (anomaly === 'CUSTODY' && !CATEGORY_SPECS[category].requiredDocs.includes('CUSTODY_STATEMENT')) return 'NONE';
      if (anomaly === 'DOC_RATE' && CATEGORY_SPECS[category].rateRange === undefined) return 'NONE';
      if (anomaly === 'FX_RATE' && !CATEGORY_SPECS[category].currencies.some((currency) => currency !== 'IDR')) return 'NONE';
      return anomaly;
    }
  }
  return 'NONE';
}

export interface DealDraft {
  id: string;
  dealRef: string;
  category: TreasuryCategory;
  instrumentCode: string;
  direction: string;
  counterpartyId: string;
  tradeDate: string;
  valueDate: string;
  maturityDate: string;
  currency: string;
  notionalMinor: number;
  notionalIdrMinor: number;
  fxRate: number | null;
  rateBps: number | null;
  price: number | null;
  couponBps: number | null;
  tenorDays: number;
  portfolio: string;
  desk: string;
  status: string;
  economicKey: string;
  duplicateOf: string | null;
  anomaly: Anomaly;
}

interface LegDraft {
  id: string;
  dealId: string;
  legNo: number;
  legType: string;
  direction: string;
  currency: string;
  amountMinor: number;
  amountIdrMinor: number;
  valueDate: string;
  accountMask: string;
  settlementRef: string;
  status: string;
}

interface DocDraft {
  id: string;
  dealId: string;
  docType: TreasuryDocType;
  docNumber: string;
  counterpartyId: string;
  receivedAt: string;
  notionalMinor: number;
  currency: string;
  fxRate: number | null;
  rateBps: number | null;
  price: number | null;
  tradeDate: string;
  valueDate: string;
  maturityDate: string;
  source: string;
  fileName: string;
  sha256: string;
  extractedJson: string;
}

const ACCOUNTS = ['7010-01-****-1104', '7010-01-****-2288', '7020-08-****-4410', '8890-02-****-7701'];
const DOC_SOURCES = ['EMAIL', 'SFTP', 'PORTAL', 'CUSTODIAN'];

function buildLegs(random: Random, deal: DealDraft): LegDraft[] {
  const legs = expectedLegs(deal).slice(0, Math.max(REQUIRED_LEGS[deal.category], 1));
  return legs.map((leg, index) => ({
    id: `tleg_${deal.id}_${index + 1}`,
    dealId: deal.id,
    legNo: index + 1,
    legType: leg.legType,
    direction: leg.direction,
    currency: leg.currency,
    amountMinor: leg.amountMinor,
    amountIdrMinor: leg.amountIdrMinor,
    valueDate: leg.valueDate,
    accountMask: pick(random, ACCOUNTS),
    settlementRef: `STL-${deal.dealRef}-${index + 1}`,
    status: 'SETTLED',
  }));
}

function buildDocuments(random: Random, deal: DealDraft, sequence: number): DocDraft[] {
  const spec = CATEGORY_SPECS[deal.category];
  const docs: DocDraft[] = [];
  let missingIndex = -1;
  if (deal.anomaly === 'MISSING_DOC') missingIndex = int(random, 0, spec.requiredDocs.length - 1);

  spec.requiredDocs.forEach((docType, index) => {
    if (index === missingIndex) return;

    let notional = deal.notionalMinor;
    let rateBps = deal.rateBps;
    let price = deal.price;
    let fxRate = deal.fxRate;
    let valueDate = deal.valueDate;
    let maturityDate = deal.maturityDate;
    let counterpartyId = deal.counterpartyId;

    const isCustody = docType === 'CUSTODY_STATEMENT';
    if (deal.anomaly === 'DOC_NOTIONAL' || (deal.anomaly === 'CUSTODY' && isCustody)) {
      const factor = deal.anomaly === 'CUSTODY' ? 0.985 + random() * 0.03 : 0.995 + random() * 0.02;
      notional = Math.round(notional * factor);
    }
    if (deal.anomaly === 'DOC_RATE' && index === Math.min(1, spec.requiredDocs.length - 1)) {
      rateBps = rateBps === null ? null : rateBps + int(random, -25, 25);
    }
    if (deal.anomaly === 'DOC_DATE' && index === 0) valueDate = addDays(valueDate, int(random, 1, 3));
    if (deal.anomaly === 'MATURITY' && index === 0) maturityDate = addDays(maturityDate, int(random, 7, 30));
    if (deal.anomaly === 'COUNTERPARTY' && index === 0) {
      const other = pick(random, COUNTERPARTIES);
      counterpartyId = `tcp_${String(COUNTERPARTIES.indexOf(other) + 1).padStart(3, '0')}`;
    }
    if (deal.anomaly === 'FX_RATE' && fxRate !== null && index === 0) {
      fxRate = Math.round(fxRate * (0.997 + random() * 0.006) * 100) / 100;
    }

    const docNumber = `${deal.category.replaceAll('_', '-')}-${String(sequence).padStart(6, '0')}-${docType.slice(0, 3)}`;
    const fileName = `${docNumber}.pdf`;
    const extracted = {
      docNumber,
      docType,
      dealRef: deal.dealRef,
      counterpartyId,
      currency: deal.currency,
      notionalMinor: notional,
      fxRate,
      rateBps,
      price,
      tradeDate: deal.tradeDate,
      valueDate,
      maturityDate,
    };
    docs.push({
      id: `tdoc_${deal.id}_${index + 1}`,
      dealId: deal.id,
      docType,
      docNumber,
      counterpartyId,
      receivedAt: addDays(valueDate, -int(random, 0, 2)),
      notionalMinor: notional,
      currency: deal.currency,
      fxRate,
      rateBps,
      price,
      tradeDate: deal.tradeDate,
      valueDate,
      maturityDate,
      source: isCustody ? 'CUSTODIAN' : pick(random, DOC_SOURCES.slice(0, 3)),
      fileName,
      sha256: sha256Hex(JSON.stringify(extracted)),
      extractedJson: JSON.stringify(extracted),
    });
  });

  return docs;
}

export interface TreasurySeedResult {
  counterparties: number;
  deals: number;
  legs: number;
  documents: number;
  byCategory: Array<{ category: TreasuryCategory; deals: number; notionalIdrMinor: number }>;
  duplicates: number;
}

export function seedTreasury(options: { perCategory?: number; seed?: number; today?: string } = {}): TreasurySeedResult {
  const perCategory = Math.max(1, options.perCategory ?? 1200);
  const random = mulberry32(options.seed ?? 20261119);
  const today = options.today ?? config.today;
  const now = nowIso();
  const db = getDb();

  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of [
    'treasury_breaks',
    'treasury_matches',
    'treasury_runs',
    'treasury_documents',
    'treasury_legs',
    'treasury_deals',
    'treasury_counterparties',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec('PRAGMA foreign_keys = ON');

  const insertCounterparty = db.prepare(
    'INSERT INTO treasury_counterparties (id, code, name, party_type, rating, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertDeal = db.prepare(
    `INSERT INTO treasury_deals (
       id, deal_ref, category, instrument_code, direction, counterparty_id, trade_date, value_date, maturity_date,
       currency, notional_minor, notional_idr_minor, fx_rate, rate_bps, price, coupon_bps, tenor_days,
       portfolio, desk, status, source_system, economic_key, duplicate_of, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUANTUM', ?, ?, ?)`,
  );
  const insertLeg = db.prepare(
    `INSERT INTO treasury_legs (
       id, deal_id, leg_no, leg_type, direction, currency, amount_minor, amount_idr_minor,
       value_date, account_mask, settlement_ref, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDoc = db.prepare(
    `INSERT INTO treasury_documents (
       id, deal_id, doc_type, doc_number, doc_version, counterparty_id, received_at, status,
       notional_minor, currency, fx_rate, rate_bps, price, trade_date, value_date, maturity_date,
       source, file_name, mime, sha256, extracted_json, created_at
     ) VALUES (?, ?, ?, ?, 1, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?)`,
  );

  let dealCount = 0;
  let legCount = 0;
  let docCount = 0;
  let duplicates = 0;
  const categoryTotals = new Map<TreasuryCategory, { deals: number; notionalIdrMinor: number }>();

  tx(() => {
    COUNTERPARTIES.forEach((party, index) => {
      insertCounterparty.run(
        `tcp_${String(index + 1).padStart(3, '0')}`,
        party.code,
        party.name,
        party.partyType,
        party.rating,
        party.country,
        now,
      );
    });

    const persist = (deal: DealDraft, sequence: number) => {
      insertDeal.run(
        deal.id, deal.dealRef, deal.category, deal.instrumentCode, deal.direction, deal.counterpartyId,
        deal.tradeDate, deal.valueDate, deal.maturityDate, deal.currency, deal.notionalMinor,
        deal.notionalIdrMinor, deal.fxRate, deal.rateBps, deal.price, deal.couponBps, deal.tenorDays,
        deal.portfolio, deal.desk, deal.status, deal.economicKey, deal.duplicateOf, now,
      );
      dealCount += 1;

      let legs = buildLegs(random, deal);
      if (deal.anomaly === 'MISSING_LEG' && legs.length > 1) legs = legs.slice(0, -1);
      if (deal.anomaly === 'LEG_AMOUNT' && legs.length > 0) {
        const target = legs[0]!;
        target.amountMinor = Math.round(target.amountMinor * (0.995 + random() * 0.01));
        target.amountIdrMinor = Math.round(target.amountMinor * (deal.fxRate ?? 1));
      }
      for (const leg of legs) {
        insertLeg.run(
          leg.id, leg.dealId, leg.legNo, leg.legType, leg.direction, leg.currency, leg.amountMinor,
          leg.amountIdrMinor, leg.valueDate, leg.accountMask, leg.settlementRef, leg.status, now,
        );
        legCount += 1;
      }

      const docs = buildDocuments(random, deal, sequence);
      for (const doc of docs) {
        insertDoc.run(
          doc.id, doc.dealId, doc.docType, doc.docNumber, doc.counterpartyId, doc.receivedAt,
          doc.notionalMinor, doc.currency, doc.fxRate, doc.rateBps, doc.price, doc.tradeDate,
          doc.valueDate, doc.maturityDate, doc.source, doc.fileName, doc.sha256, doc.extractedJson, now,
        );
        docCount += 1;
      }

      const totals = categoryTotals.get(deal.category)!;
      totals.deals += 1;
      totals.notionalIdrMinor += deal.notionalIdrMinor;
    };

    let sequence = 0;
    for (const category of TREASURY_CATEGORIES) {
      categoryTotals.set(category, { deals: 0, notionalIdrMinor: 0 });

      for (let index = 0; index < perCategory; index += 1) {
        sequence += 1;
        const deal = makeDeal(random, category, sequence, today);
        persist(deal, sequence);

        if (deal.anomaly === 'DUPLICATE') {
          const duplicate: DealDraft = {
            ...deal,
            id: `${deal.id}D`,
            dealRef: `${deal.dealRef}-D`,
            duplicateOf: deal.id,
            anomaly: 'NONE',
          };
          persist(duplicate, sequence);
          duplicates += 1;
        }
      }
    }
  });

  return {
    counterparties: COUNTERPARTIES.length,
    deals: dealCount,
    legs: legCount,
    documents: docCount,
    byCategory: TREASURY_CATEGORIES.map((category) => ({
      category,
      deals: categoryTotals.get(category)?.deals ?? 0,
      notionalIdrMinor: categoryTotals.get(category)?.notionalIdrMinor ?? 0,
    })),
    duplicates,
  };
}

function makeDeal(random: Random, category: TreasuryCategory, sequence: number, today: string): DealDraft {
  const spec = CATEGORY_SPECS[category];
  const id = `tdl_${String(sequence).padStart(6, '0')}`;
  const dealRef = `${category.replaceAll('_', '-')}-2026-${String(sequence).padStart(6, '0')}`;
  const currency = pick(random, spec.currencies);
  const fxRate = currency === 'IDR' ? null : Math.round(FX_RATES[currency]! * (0.995 + random() * 0.01) * 100) / 100;
  const direction = pick(random, spec.directions);
  const tenorDays = int(random, spec.tenorRange[0], spec.tenorRange[1]);
  const tradeDate = addDays(today, -int(random, 1, 90));
  const isFx = category.startsWith('FX_');
  const valueDate = isFx ? addBusinessDays(tradeDate, 2) : addDays(tradeDate, int(random, 0, 2));
  let maturityDate = addDays(valueDate, tenorDays);
  if (category === 'GOV_BOND' || category === 'CORP_BOND') {
    const tenorMonths = Math.max(6, Math.round(tenorDays / 30 / 6) * 6);
    maturityDate = addMonths(valueDate, tenorMonths);
    if (random() < 0.35) maturityDate = endOfMonth(maturityDate);
  }
  if (category === 'FX_SPOT') maturityDate = valueDate;
  const effectiveTenorDays = Math.max(daysBetween(valueDate, maturityDate), 1);

  const notionalIdr = Math.round(spec.notionalRange[0] + random() * (spec.notionalRange[1] - spec.notionalRange[0]));
  const notionalMinor = currency === 'IDR' ? notionalIdr * 100 : Math.round((notionalIdr / (fxRate ?? 1)) * 100);
  const notionalIdrMinor = currency === 'IDR' ? notionalMinor : Math.round(notionalMinor * (fxRate ?? 1));

  const rateBps = spec.rateRange ? int(random, spec.rateRange[0], spec.rateRange[1]) : null;
  const price = spec.priceRange ? Math.round((spec.priceRange[0] + random() * (spec.priceRange[1] - spec.priceRange[0])) * 100) / 100 : null;
  const couponBps = spec.couponRange ? int(random, spec.couponRange[0], spec.couponRange[1]) : null;
  const instrumentCode = pick(random, spec.instruments);
  const counterpartyIndex = pickCounterpartyIndex(random, category);
  const counterpartyId = `tcp_${String(counterpartyIndex + 1).padStart(3, '0')}`;
  const status = maturityDate < today ? (valueDate < today ? 'SETTLED' : 'MATURED') : 'OPEN';
  const anomaly = chooseAnomaly(random, category);

  return {
    id,
    dealRef,
    category,
    instrumentCode,
    direction,
    counterpartyId,
    tradeDate,
    valueDate,
    maturityDate,
    currency,
    notionalMinor,
    notionalIdrMinor,
    fxRate,
    rateBps,
    price,
    couponBps,
    tenorDays: effectiveTenorDays,
    portfolio: spec.portfolio,
    desk: spec.desk,
    status,
    economicKey: `${category}|${counterpartyId}|${direction}|${notionalMinor}|${valueDate}|${instrumentCode}`,
    duplicateOf: null,
    anomaly,
  };
}

function pickCounterpartyIndex(random: Random, category: TreasuryCategory): number {
  const groups: Record<string, number[]> = {
    BANK: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    CORPORATE: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    GOVERNMENT: [28, 29, 30],
    BROKER: [31, 32, 33, 34],
    CUSTODIAN: [35, 36],
    MULTILATERAL: [37, 38],
  };
  if (category === 'GOV_BOND') return pick(random, [...groups.GOVERNMENT!, ...groups.BANK!, ...groups.BROKER!]);
  if (category === 'REPO') return pick(random, [...groups.BANK!, ...groups.BROKER!]);
  if (category === 'CORP_BOND') return pick(random, [...groups.CORPORATE!, ...groups.BROKER!]);
  if (category === 'SYNDICATED_LOAN' || category === 'PROJECT_FINANCE') {
    return pick(random, [...groups.CORPORATE!, ...groups.BANK!, ...groups.MULTILATERAL!]);
  }
  if (category === 'CORPORATE_LOAN' || category === 'TRADE_FINANCE') return pick(random, groups.CORPORATE!);
  return pick(random, groups.BANK!);
}
