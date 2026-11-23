export function groupDigits(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function money(minor: number | null | undefined, currency = 'IDR'): string {
  if (minor === null || minor === undefined) return '—';
  return `${currency === 'IDR' ? 'Rp' : currency} ${groupDigits(minor / 100)}`;
}

export function compactMoney(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  const value = Math.abs(minor) / 100;
  const sign = minor < 0 ? '−' : '';
  if (value >= 1_000_000_000) return `${sign}Rp ${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${sign}Rp ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sign}Rp ${(value / 1_000).toFixed(0)}K`;
  return `${sign}Rp ${groupDigits(value)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return `${parsed.getDate()} ${MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function humanize(key: string): string {
  return key
    .replace(/Minor$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
