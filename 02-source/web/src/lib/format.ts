const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  if (currency === 'IDR') return rupiahFormatter;
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 2 });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

export function formatMoney(minor: number, currency = 'IDR'): string {
  return formatterFor(currency).format(minor / 100);
}

export function formatCompactMoney(minor: number, currency = 'IDR'): string {
  const value = minor / 100;
  const prefix = currency === 'IDR' ? 'Rp ' : `${currency} `;
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000_000) return `${prefix}${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (absolute >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${prefix}${(value / 1_000).toFixed(0)}K`;
  return `${prefix}${value.toFixed(0)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

export function formatDate(value: string | null | undefined, options: { short?: boolean; time?: boolean } = {}): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: options.short ? 'short' : 'short',
    year: 'numeric',
    ...(options.time ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
  return formatted;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '—';
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function daysSince(value: string): number {
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return 0;
  return Math.max(0, Math.floor((Date.now() - date) / 86_400_000));
}

export function ageLabel(value: string): string {
  const days = daysSince(value);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export const TYPE_LABELS: Record<string, string> = {
  DUPLICATE_PAYMENT: 'Duplicate payment',
  AMOUNT_MISMATCH: 'Amount mismatch',
  MISSING_PAYMENT: 'Missing payment',
  UNALLOCATED_PAYMENT: 'Unallocated payment',
  NOMINAL_VARIANCE: 'Nominal variance',
  ORPHAN_RECEIPT: 'Orphan receipt',
  DUPLICATE_RECEIPT: 'Duplicate receipt',
};

export const TYPE_SHORT: Record<string, string> = {
  DUPLICATE_PAYMENT: 'Duplicate',
  AMOUNT_MISMATCH: 'Mismatch',
  MISSING_PAYMENT: 'Missing',
  UNALLOCATED_PAYMENT: 'Unallocated',
  NOMINAL_VARIANCE: 'Nominal',
  ORPHAN_RECEIPT: 'Orphan doc',
  DUPLICATE_RECEIPT: 'Duplicate doc',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
  IGNORED: 'Ignored',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  EXCEPTION: 'Exception',
  PARTIAL: 'Partial',
  MATCHED: 'Matched',
  UNMATCHED: 'Unmatched',
  DUPLICATE: 'Duplicate',
  COMPLETED: 'Completed',
  DUPLICATE_FILE: 'Duplicate file',
  REJECTED: 'Rejected',
};

export const RESOLUTION_LABELS: Record<string, string> = {
  CONFIRMED_DUPLICATE: 'Confirmed duplicate — recovery started',
  REFUND_INITIATED: 'Refund initiated to operating account',
  ADJUSTED: 'Ledger adjusted after verification',
  EVIDENCE_ACCEPTED: 'Supporting evidence accepted',
  WRITTEN_OFF: 'Written off (supervisor approval)',
  FALSE_POSITIVE: 'False positive — no action needed',
  ESCALATED: 'Escalated to treasury',
};

export function truncateMiddle(value: string, max = 28): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 10)}…${value.slice(-8)}`;
}
