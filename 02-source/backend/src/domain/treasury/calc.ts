import { addDays, daysBetween } from '../../lib/dates.js';
import type { TreasuryCategory } from './catalog.js';

export type DayBasis = 'ACT/365' | 'ACT/360';

const DENOMINATOR: Record<DayBasis, number> = { 'ACT/365': 365, 'ACT/360': 360 };

export function basisFor(category: TreasuryCategory, currency: string): DayBasis {
  if (category === 'GOV_BOND' || category === 'CORP_BOND') return currency === 'IDR' ? 'ACT/365' : 'ACT/360';
  if (currency === 'IDR') return 'ACT/365';
  return 'ACT/360';
}

export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function isEndOfMonth(isoDate: string): boolean {
  return addDays(isoDate, 1).slice(8, 10) === '01';
}

export function endOfMonth(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

export function isBusinessDay(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function addBusinessDays(isoDate: string, days: number): string {
  let cursor = isoDate;
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isBusinessDay(cursor)) remaining -= 1;
  }
  return cursor;
}

export function nextBusinessDay(isoDate: string): string {
  let cursor = isoDate;
  while (!isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

export const COUPON_FREQUENCY_MONTHS = 6;

export function couponOnOrBefore(maturityDate: string, onOrBefore: string, months = COUPON_FREQUENCY_MONTHS): string {
  let previous = maturityDate;
  for (let period = 1; period <= 240; period += 1) {
    const coupon = addMonths(maturityDate, -months * period);
    if (coupon <= onOrBefore) return coupon;
    previous = coupon;
    if (coupon < '1990-01-01') break;
  }
  return previous;
}

export function nextCouponAfter(maturityDate: string, after: string, months = COUPON_FREQUENCY_MONTHS): string {
  if (after >= maturityDate) return maturityDate;
  let next = maturityDate;
  for (let period = 1; period <= 240; period += 1) {
    const coupon = addMonths(maturityDate, -months * period);
    if (coupon <= after) break;
    next = coupon;
  }
  return next;
}

export function interestMinor(
  notionalMinor: number,
  rateBps: number,
  from: string,
  to: string,
  basis: DayBasis,
): number {
  const days = Math.max(daysBetween(from, to), 0);
  return Math.round((notionalMinor * (rateBps / 10_000) * days) / DENOMINATOR[basis]);
}

export function couponAmountMinor(notionalMinor: number, couponBps: number): number {
  return Math.round((notionalMinor * (couponBps / 10_000)) / (12 / COUPON_FREQUENCY_MONTHS));
}

export const FX_INTEREST_RATES: Record<string, number> = {
  IDR: 0.0575,
  USD: 0.0435,
  SGD: 0.032,
  EUR: 0.0375,
  JPY: 0.006,
};

export const FLOATING_REFERENCE_BPS = 535;

export function fxForwardRate(spot: number, currency: string, days: number): number {
  const yearFraction = Math.max(days, 0) / 365;
  const domestic = FX_INTEREST_RATES.IDR ?? 0.0575;
  const foreign = FX_INTEREST_RATES[currency] ?? 0.04;
  return Math.round(spot * ((1 + domestic * yearFraction) / (1 + foreign * yearFraction)) * 100) / 100;
}

export interface CalcDeal {
  category: TreasuryCategory;
  direction: string;
  currency: string;
  notionalMinor: number;
  notionalIdrMinor: number;
  fxRate: number | null;
  rateBps: number | null;
  price: number | null;
  couponBps: number | null;
  tradeDate: string;
  valueDate: string;
  maturityDate: string;
  tenorDays: number;
}

export interface ExpectedLeg {
  legType: string;
  direction: 'RECEIVE' | 'PAY';
  currency: string;
  amountMinor: number;
  amountIdrMinor: number;
  valueDate: string;
}

export function firstInterestPaymentDate(valueDate: string, maturityDate: string): string {
  const quarter = addMonths(valueDate, 3);
  return quarter < maturityDate ? quarter : maturityDate;
}

export function loanAccrualPeriod(deal: Pick<CalcDeal, 'valueDate' | 'maturityDate'>): { from: string; to: string } {
  return { from: deal.valueDate, to: firstInterestPaymentDate(deal.valueDate, deal.maturityDate) };
}

export function expectedLegs(deal: CalcDeal): ExpectedLeg[] {
  const notional = deal.notionalMinor;
  const rate = deal.rateBps ?? 0;
  const spot = deal.fxRate ?? 1;
  const idr = (amountMinor: number) => Math.round(amountMinor * spot);
  const basis = basisFor(deal.category, deal.currency);
  const inflow = ['TAKE', 'RECEIVE', 'SELL', 'REPAY', 'RECEIVE_FIXED', 'ADVISE'].includes(deal.direction);
  const principalDirection: 'RECEIVE' | 'PAY' = inflow ? 'RECEIVE' : 'PAY';
  const opposite: 'RECEIVE' | 'PAY' = principalDirection === 'RECEIVE' ? 'PAY' : 'RECEIVE';
  const leg = (
    legType: string,
    direction: 'RECEIVE' | 'PAY',
    amountMinor: number,
    currency: string,
    valueDate: string,
  ): ExpectedLeg => ({
    legType,
    direction,
    currency,
    amountMinor,
    amountIdrMinor: currency === 'IDR' ? amountMinor : idr(amountMinor),
    valueDate,
  });

  switch (deal.category) {
    case 'MM_CALL':
      return [leg('PRINCIPAL', principalDirection, notional, deal.currency, deal.valueDate)];
    case 'TIME_DEPOSIT': {
      const interest = interestMinor(notional, rate, deal.valueDate, deal.maturityDate, basis);
      return [
        leg('PRINCIPAL', principalDirection, notional, deal.currency, deal.valueDate),
        leg('INTEREST', opposite, interest, deal.currency, deal.maturityDate),
      ];
    }
    case 'REPO': {
      const interest = interestMinor(notional, rate, deal.valueDate, deal.maturityDate, 'ACT/365');
      const startDirection: 'RECEIVE' | 'PAY' = deal.direction === 'REPO' ? 'RECEIVE' : 'PAY';
      const endDirection: 'RECEIVE' | 'PAY' = startDirection === 'RECEIVE' ? 'PAY' : 'RECEIVE';
      return [
        leg('PRINCIPAL', startDirection, notional, deal.currency, deal.valueDate),
        leg('REPAYMENT', endDirection, notional + interest, deal.currency, deal.maturityDate),
      ];
    }
    case 'GOV_BOND':
    case 'CORP_BOND': {
      const previousCoupon = couponOnOrBefore(deal.maturityDate, deal.valueDate);
      const accrued = interestMinor(notional, deal.couponBps ?? 0, previousCoupon, deal.valueDate, basis);
      const settlement = Math.round((notional * (deal.price ?? 100)) / 100) + accrued;
      const nextCoupon = nextCouponAfter(deal.maturityDate, deal.valueDate);
      const couponValue = deal.direction === 'BUY' ? nextCoupon : deal.valueDate;
      const couponAmount = deal.direction === 'BUY' ? couponAmountMinor(notional, deal.couponBps ?? 0) : accrued;
      return [
        leg('PRINCIPAL', principalDirection, settlement, deal.currency, deal.valueDate),
        leg('COUPON', 'RECEIVE', couponAmount, deal.currency, couponValue),
      ];
    }
    case 'FX_SPOT':
      return [
        leg('PRINCIPAL', principalDirection, notional, deal.currency, deal.valueDate),
        leg('PRINCIPAL', opposite, deal.notionalIdrMinor, 'IDR', deal.valueDate),
      ];
    case 'FX_FORWARD': {
      const forward = fxForwardRate(spot, deal.currency, deal.tenorDays);
      return [
        leg('PRINCIPAL', principalDirection, notional, deal.currency, deal.maturityDate),
        leg('PRINCIPAL', opposite, Math.round(notional * forward), 'IDR', deal.maturityDate),
      ];
    }
    case 'FX_SWAP': {
      const forward = fxForwardRate(spot, deal.currency, deal.tenorDays);
      const nearDirection: 'RECEIVE' | 'PAY' = deal.direction === 'BUY_SELL' ? 'RECEIVE' : 'PAY';
      const farDirection: 'RECEIVE' | 'PAY' = nearDirection === 'RECEIVE' ? 'PAY' : 'RECEIVE';
      return [
        leg('FX_NEAR', nearDirection, notional, deal.currency, deal.valueDate),
        leg('FX_FAR', farDirection, Math.round(notional * forward), 'IDR', deal.maturityDate),
      ];
    }
    case 'IRS': {
      const fixed = interestMinor(notional, rate, deal.valueDate, deal.maturityDate, basis);
      const floating = interestMinor(notional, FLOATING_REFERENCE_BPS, deal.valueDate, deal.maturityDate, basis);
      const fixedDirection: 'RECEIVE' | 'PAY' = deal.direction === 'RECEIVE_FIXED' ? 'RECEIVE' : 'PAY';
      return [
        leg('INTEREST', fixedDirection, fixed, deal.currency, deal.maturityDate),
        leg('INTEREST', fixedDirection === 'RECEIVE' ? 'PAY' : 'RECEIVE', floating, deal.currency, deal.maturityDate),
      ];
    }
    case 'CORPORATE_LOAN':
    case 'SYNDICATED_LOAN':
    case 'PROJECT_FINANCE': {
      const period = loanAccrualPeriod(deal);
      const interest = interestMinor(notional, rate, period.from, period.to, basis);
      return [
        leg('DRAWDOWN', principalDirection, notional, deal.currency, deal.valueDate),
        leg('INTEREST', opposite, interest, deal.currency, period.to),
      ];
    }
    case 'TRADE_FINANCE': {
      const fee = interestMinor(notional, rate, deal.valueDate, deal.maturityDate, 'ACT/360');
      return [
        leg('PRINCIPAL', principalDirection, notional, deal.currency, deal.valueDate),
        leg('FEE', opposite, fee, deal.currency, deal.valueDate),
      ];
    }
    default:
      return [leg('PRINCIPAL', principalDirection, notional, deal.currency, deal.valueDate)];
  }
}
