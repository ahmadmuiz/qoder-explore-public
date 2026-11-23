/** Amounts are stored as integer minor units (sen). IDR values therefore use cents internally. */
export function parseAmountToMinor(input: unknown): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const minor = Math.round(input * 100);
    return Number.isSafeInteger(minor) ? minor : null;
  }
  let raw = String(input ?? '').trim();
  if (!raw) return null;

  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }
  raw = raw.replace(/[\s\u00a0]/g, '').replace(/^Rp\.?/i, '').replace(/^IDR/i, '');
  raw = raw.replace(/[^0-9.,-]/g, '');
  if (raw.startsWith('-')) {
    negative = true;
    raw = raw.slice(1);
  }
  if (!raw || !/\d/.test(raw)) return null;

  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  let normalized = raw;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = raw.split(thousandSep).join('');
    const cut = normalized.lastIndexOf(decimalSep);
    normalized = normalized.slice(0, cut) + '.' + normalized.slice(cut + 1);
  } else if (lastComma >= 0) {
    const parts = raw.split(',');
    const last = parts[parts.length - 1] ?? '';
    normalized = parts.length === 2 && last.length > 0 && last.length <= 2 ? `${parts[0]}.${last}` : parts.join('');
  } else if (lastDot >= 0) {
    const parts = raw.split('.');
    const last = parts[parts.length - 1] ?? '';
    normalized = parts.length === 2 && last.length > 0 && last.length <= 2 ? raw : parts.join('');
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

export function formatMinor(minor: number, currency = 'IDR'): string {
  const value = minor / 100;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(value);
}

export function sumMinor(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
