export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDateInput(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (isIsoDate(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = dmy[1]!.padStart(2, '0');
    const month = dmy[2]!.padStart(2, '0');
    const iso = `${dmy[3]}-${month}-${day}`;
    return isIsoDate(iso) ? iso : null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return todayIso(parsed);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return todayIso(date);
}

export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function nowIso(): string {
  return new Date().toISOString();
}
