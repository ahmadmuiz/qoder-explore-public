import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calculator, Clock, LockKeyhole, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
import type { AppSettings } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Badge, Button, Card, CardHeader, Checkbox, LoadingBlock, useToast } from '../components/ui';

interface SettingsResponse {
  values: AppSettings;
  items: Array<{ key: keyof AppSettings; label: string; value: number | boolean; hint: string }>;
}

function SettingsForm({ initial }: { initial: AppSettings }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editable = can(['SUPERVISOR']);
  const [tolerance, setTolerance] = useState(String(initial.amountToleranceMinor / 100));
  const [graceDays, setGraceDays] = useState(String(initial.graceDays));
  const [approval, setApproval] = useState(String(initial.approvalThresholdMinor / 100));
  const [highValue, setHighValue] = useState(String(initial.highValueMinor / 100));
  const [autoRun, setAutoRun] = useState(initial.autoRunOnImport);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTolerance(String(initial.amountToleranceMinor / 100));
    setGraceDays(String(initial.graceDays));
    setApproval(String(initial.approvalThresholdMinor / 100));
    setHighValue(String(initial.highValueMinor / 100));
    setAutoRun(initial.autoRunOnImport);
  }, [initial]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<SettingsResponse>('/api/settings', {
        amountToleranceMinor: Math.round(Number(tolerance || 0) * 100),
        graceDays: Number(graceDays || 0),
        approvalThresholdMinor: Math.round(Number(approval || 0) * 100),
        highValueMinor: Math.round(Number(highValue || 0) * 100),
        autoRunOnImport: autoRun,
      }),
    onSuccess: async () => {
      toast.push({ title: 'Controls updated', message: 'New values apply to the next reconciliation run.', tone: 'success' });
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (cause: Error) => setError(cause.message),
  });

  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!editable) return;
        const numeric = [tolerance, graceDays, approval, highValue].map(Number);
        if (numeric.some((value) => Number.isNaN(value) || value < 0)) {
          setError('All control values must be zero or a positive number.');
          return;
        }
        save.mutate();
      }}
    >
      {!editable && (
        <div className="readonly-banner">
          <LockKeyhole size={16} />
          <span>Only the operations supervisor can change controls. Current values are shown read-only.</span>
        </div>
      )}

      <Card>
        <CardHeader
          eyebrow="Matching & timing"
          title="Reconciliation thresholds"
          subtitle="How strictly the engine matches amounts and when an unpaid invoice becomes missing."
          action={<Calculator size={18} className="muted" />}
        />
        <div className="settings-fields">
          <label className="field">
            <span className="field-label">Amount tolerance (IDR)</span>
            <input
              inputMode="numeric"
              value={tolerance}
              disabled={!editable}
              onChange={(event) => setTolerance(event.target.value.replace(/[^\d.]/g, ''))}
            />
            <span className="field-hint">
              Max variance accepted as a tolerance match. At 0, only exact amounts match automatically.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Due-date grace (days)</span>
            <input
              type="number"
              min={0}
              max={60}
              value={graceDays}
              disabled={!editable}
              onChange={(event) => setGraceDays(event.target.value)}
            />
            <span className="field-hint">Days after the due date before an invoice surfaces as a missing payment.</span>
          </label>
        </div>
        <div className="setting-callout">
          <Clock size={15} />
          <span>
            Current rule: invoices unpaid <strong>{graceDays || 0} days</strong> past due are queued; ledger variance within{' '}
            <strong>{tolerance ? formatMoney(Number(tolerance) * 100) : 'Rp 0'}</strong> is accepted automatically.
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Approval & escalation"
          title="Value guardrails"
          subtitle="Segregation of duties for write-offs and high-value exposure."
          action={<ShieldCheck size={18} className="muted" />}
        />
        <div className="settings-fields">
          <label className="field">
            <span className="field-label">Supervisor approval threshold (IDR)</span>
            <input
              inputMode="numeric"
              value={approval}
              disabled={!editable}
              onChange={(event) => setApproval(event.target.value.replace(/[^\d.]/g, ''))}
            />
            <span className="field-hint">
              Analysts cannot write off or adjust exceptions at or above this amount.
            </span>
          </label>
          <label className="field">
            <span className="field-label">High-value threshold (IDR)</span>
            <input
              inputMode="numeric"
              value={highValue}
              disabled={!editable}
              onChange={(event) => setHighValue(event.target.value.replace(/[^\d.]/g, ''))}
            />
            <span className="field-hint">Exceptions above this amount are raised to a higher severity.</span>
          </label>
        </div>
        <div className="setting-callout is-warning">
          <AlertTriangle size={15} />
          <span>
            Write-offs above <strong>{formatMoney(Number(approval || 0) * 100)}</strong> need the supervisor role and are
            recorded in the audit trail.
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Automation"
          title="Run behaviour"
          subtitle="Keep the queue fresh without manual triggers."
          action={<Sparkles size={18} className="muted" />}
        />
        <div className="setting-toggle">
          <div>
            <strong>Run reconciliation after import</strong>
            <span>Runs the engine immediately after a committed statement, invoice or kuitansi register.</span>
          </div>
          <Checkbox checked={autoRun} onChange={setAutoRun} label={autoRun ? 'Enabled' : 'Disabled'} />
        </div>
        <div className="setting-toggle">
          <div>
            <strong>Duplicate-file guard</strong>
            <span>Whole-file SHA-256 checksum and per-row hashes are always enforced. This cannot be disabled.</span>
          </div>
          <Badge tone="success">Always on</Badge>
        </div>
      </Card>

      {error && <div className="form-error">{error}</div>}

      {editable && (
        <div className="settings-actions">
          <Button type="submit" icon={<Save size={15} />} loading={save.isPending}>
            Save controls
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTolerance(String(initial.amountToleranceMinor / 100));
              setGraceDays(String(initial.graceDays));
              setApproval(String(initial.approvalThresholdMinor / 100));
              setHighValue(String(initial.highValueMinor / 100));
              setAutoRun(initial.autoRunOnImport);
              setError(null);
            }}
          >
            Reset
          </Button>
        </div>
      )}
    </form>
  );
}

export function SettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsResponse>('/api/settings'),
  });

  if (isLoading || !data) return <LoadingBlock rows={8} />;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Pilot configuration · supervisor only"
        title="Reconciliation controls"
        subtitle="Tune matching tolerance, missing-payment grace, approval thresholds and automation. Changes are audited."
      />
      <div className="settings-layout">
        <SettingsForm initial={data.values} />
        <aside className="settings-side">
          <Card>
            <CardHeader eyebrow="Effective now" title="Control snapshot" />
            <dl className="side-dl">
              {data.items.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>
                    {typeof item.value === 'boolean'
                      ? item.value ? 'Enabled' : 'Disabled'
                      : item.key === 'graceDays'
                        ? `${item.value} days`
                        : formatMoney(item.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader eyebrow="Guardrails" title="Not configurable" />
            <ul className="checklist">
              <li><ShieldCheck size={14} /> JWT session expiry after 12 hours</li>
              <li><ShieldCheck size={14} /> Scrypt password hashing</li>
              <li><ShieldCheck size={14} /> SHA-256 document deduplication</li>
              <li><ShieldCheck size={14} /> Audit event on every disposition</li>
              <li><ShieldCheck size={14} /> Auditor read-only access</li>
              <li><ShieldCheck size={14} /> Maximum 8 MB per document</li>
            </ul>
          </Card>
          <div className="side-note">
            <ShieldCheck size={16} />
            <p>Changing tolerance does not retract existing exceptions until the next reconciliation run.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
