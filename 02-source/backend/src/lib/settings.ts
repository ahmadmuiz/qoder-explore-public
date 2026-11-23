import { getDb, one } from '../db/index.js';
import { nowIso } from './dates.js';

export interface AppSettings {
  amountToleranceMinor: number;
  graceDays: number;
  approvalThresholdMinor: number;
  highValueMinor: number;
  autoRunOnImport: boolean;
}

const DEFAULTS: AppSettings = {
  amountToleranceMinor: 0,
  graceDays: 3,
  approvalThresholdMinor: 250_000_000,
  highValueMinor: 500_000_000,
  autoRunOnImport: true,
};

const KEY_MAP: Record<keyof AppSettings, string> = {
  amountToleranceMinor: 'amount_tolerance_minor',
  graceDays: 'grace_days',
  approvalThresholdMinor: 'approval_threshold_minor',
  highValueMinor: 'high_value_minor',
  autoRunOnImport: 'auto_run_on_import',
};

let cache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cache) return cache;
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  cache = {
    amountToleranceMinor: Number(stored.get(KEY_MAP.amountToleranceMinor) ?? DEFAULTS.amountToleranceMinor),
    graceDays: Number(stored.get(KEY_MAP.graceDays) ?? DEFAULTS.graceDays),
    approvalThresholdMinor: Number(stored.get(KEY_MAP.approvalThresholdMinor) ?? DEFAULTS.approvalThresholdMinor),
    highValueMinor: Number(stored.get(KEY_MAP.highValueMinor) ?? DEFAULTS.highValueMinor),
    autoRunOnImport: (stored.get(KEY_MAP.autoRunOnImport) ?? String(DEFAULTS.autoRunOnImport)) === 'true',
  };
  return cache;
}

export function updateSettings(patch: Partial<AppSettings>, actorId: string): AppSettings {
  const conn = getDb();
  const statement = conn.prepare(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  );
  const at = nowIso();
  for (const [key, value] of Object.entries(patch)) {
    const mapped = KEY_MAP[key as keyof AppSettings];
    if (mapped && value !== undefined) statement.run(mapped, String(value), actorId, at);
  }
  cache = null;
  return getSettings();
}

export function seedSettings(): void {
  const conn = getDb();
  const statement = conn.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, NULL, ?)',
  );
  const at = nowIso();
  statement.run(KEY_MAP.amountToleranceMinor, String(DEFAULTS.amountToleranceMinor), at);
  statement.run(KEY_MAP.graceDays, String(DEFAULTS.graceDays), at);
  statement.run(KEY_MAP.approvalThresholdMinor, String(DEFAULTS.approvalThresholdMinor), at);
  statement.run(KEY_MAP.highValueMinor, String(DEFAULTS.highValueMinor), at);
  statement.run(KEY_MAP.autoRunOnImport, String(DEFAULTS.autoRunOnImport), at);
  cache = null;
}

export function settingsForDisplay(): Array<{ key: keyof AppSettings; label: string; value: number | boolean; hint: string }> {
  const settings = getSettings();
  return [
    { key: 'amountToleranceMinor', label: 'Amount tolerance', value: settings.amountToleranceMinor, hint: 'Maximum variance auto-accepted between ledger and invoice, in minor units.' },
    { key: 'graceDays', label: 'Due-date grace', value: settings.graceDays, hint: 'Days after due date before an unpaid invoice becomes a missing payment.' },
    { key: 'approvalThresholdMinor', label: 'Supervisor approval', value: settings.approvalThresholdMinor, hint: 'Resolutions at or above this value require supervisor approval.' },
    { key: 'highValueMinor', label: 'High-value threshold', value: settings.highValueMinor, hint: 'Payments above this amount are escalated in severity.' },
    { key: 'autoRunOnImport', label: 'Auto-run after import', value: settings.autoRunOnImport, hint: 'Run reconciliation immediately after a successful import.' },
  ];
}

export function readSettingRow(key: string): string | undefined {
  return (one<{ value: string }>('SELECT value FROM settings WHERE key = ?', key) ?? undefined)?.value;
}
