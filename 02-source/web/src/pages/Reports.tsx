import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { formatCompactMoney, formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format';
import type { Dashboard, NominalReport } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Donut, HorizontalBars, ProgressRing } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingBlock,
  SeverityBadge,
  StatusBadge,
  useToast,
} from '../components/ui';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: nominal, isLoading } = useQuery({
    queryKey: ['nominal-report'],
    queryFn: () => api.get<NominalReport>('/api/reports/nominal-accuracy'),
  });
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/api/dashboard'),
  });

  async function download(path: string, name: string) {
    try {
      await downloadFile(path, name);
      toast.push({ title: 'Report downloaded', message: name, tone: 'success' });
    } catch (cause) {
      toast.push({ title: 'Download failed', message: cause instanceof Error ? cause.message : 'Try again.', tone: 'error' });
    }
  }

  if (isLoading || !nominal) return <LoadingBlock rows={8} />;

  const matchTotal = nominal.matchStats.exact + nominal.matchStats.tolerance + nominal.matchStats.provisional;
  const openExceptions = dashboard?.kpis.openExceptions ?? 0;
  const missing = dashboard?.kpis.missingPayments ?? 0;
  const unallocated = dashboard?.breakdown.find((item) => item.type === 'UNALLOCATED_PAYMENT')?.count ?? 0;
  const variantOpen = dashboard?.breakdown.find((item) => item.type === 'NOMINAL_VARIANCE')?.count ?? 0;

  const checks = [
    { label: 'Nominal accuracy at or above 99.5%', pass: nominal.accuracyRate >= 99.5, detail: `${formatPercent(nominal.accuracyRate)} of invoices recompute exactly` },
    { label: 'No missing settlements', pass: missing === 0, detail: missing > 0 ? `${missing} past-due invoices with no payment` : 'Every overdue invoice has a ledger match' },
    { label: 'No unallocated transfers', pass: unallocated === 0, detail: unallocated > 0 ? `${unallocated} incoming transfers need an invoice` : 'All ledger rows allocated' },
    { label: 'Nominal variances closed', pass: variantOpen === 0, detail: variantOpen > 0 ? `${variantOpen} open nominal checks` : 'DPP + PPN and kuitansi totals reconciled' },
  ];
  const passed = checks.filter((check) => check.pass).length;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Month close · controls and evidence"
        title="Close & controls"
        subtitle="A defensible close pack for vendor settlement: nominal accuracy, ledger coverage and every open exception."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => download(`/api/reports/exceptions.csv`, 'laras-exceptions.csv')}
          >
            Exception register
          </Button>
        }
      />

      <div className="report-hero">
        <div className="report-hero-ring">
          <ProgressRing value={nominal.accuracyRate} size={138} stroke={11} label="accuracy" />
        </div>
        <div className="report-hero-copy">
          <div className="eyebrow">Nominal integrity</div>
          <h2>{formatNumber(nominal.invoiceCount)} invoices checked, {nominal.formulaFailures} with formula breaks.</h2>
          <p>
            DPP + PPN is recomputed for every invoice; line sums, kuitansi totals and declared receipt nominals are compared
            against the stated total. Matching quality is measured separately from nominal accuracy.
          </p>
          <div className="report-hero-stats">
            <div><span>Total open variance</span><strong>{formatMoney(nominal.totalVarianceMinor)}</strong></div>
            <div><span>Matched value</span><strong>{formatCompactMoney(nominal.matchStats.matchedValueMinor)}</strong></div>
            <div><span>Match records</span><strong>{formatNumber(matchTotal)}</strong></div>
          </div>
        </div>
        <div className="report-hero-actions">
          <div className="date-range">
            <label className="field">
              <span className="field-label">From issue date</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">To issue date</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
          <Button
            icon={<FileSpreadsheet size={15} />}
            onClick={() => download(`/api/reports/close-pack?from=${from}&to=${to}`, `laras-close-pack-${from}-to-${to}.csv`)}
          >
            Export close pack
          </Button>
          <span className="report-hero-note">IDR columns · invoice, payment, kuitansi variance · open exceptions</span>
        </div>
      </div>

      <div className="report-grid">
        <Card>
          <CardHeader
            eyebrow="Matching quality"
            title="How payments were matched"
            subtitle="Exact, tolerance and provisional allocations from the latest run."
            action={<Badge tone={nominal.matchStats.provisional > 0 ? 'warning' : 'success'}>{matchTotal} matches</Badge>}
          />
          <div className="quality-block">
            <Donut
              segments={[
                { label: 'Exact', value: nominal.matchStats.exact, color: '#0B5C4B' },
                { label: 'Tolerance', value: nominal.matchStats.tolerance, color: '#9DBE6C' },
                { label: 'Provisional', value: nominal.matchStats.provisional, color: '#D97706' },
              ]}
              size={176}
              centerLabel="matches"
              centerValue={String(matchTotal)}
            />
            <div className="quality-legend">
              <div><span className="legend-swatch" style={{ background: '#0B5C4B' }} /><span>Exact</span><strong>{formatNumber(nominal.matchStats.exact)}</strong></div>
              <div><span className="legend-swatch" style={{ background: '#9DBE6C' }} /><span>Tolerance</span><strong>{formatNumber(nominal.matchStats.tolerance)}</strong></div>
              <div><span className="legend-swatch" style={{ background: '#D97706' }} /><span>Provisional</span><strong>{formatNumber(nominal.matchStats.provisional)}</strong></div>
              <p>Provisional matches keep the reference link but raise an amount mismatch for review.</p>
            </div>
          </div>
          <div className="quality-bars">
            <HorizontalBars
              items={nominal.byVendor.map((vendor) => ({
                label: vendor.vendorName,
                sub: `${vendor.exceptions} nominal case${vendor.exceptions === 1 ? '' : 's'}`,
                value: vendor.varianceMinor,
                color: '#7C3AED',
              }))}
            />
            {nominal.byVendor.length === 0 && <p className="muted small">No open nominal variance by vendor.</p>}
          </div>
        </Card>

        <div className="report-side">
          <Card>
            <CardHeader
              eyebrow="Close gate"
              title="Readiness"
              subtitle="Automated checks that block a clean close."
              action={<Badge tone={passed === checks.length ? 'success' : 'warning'}>{passed}/{checks.length} passed</Badge>}
            />
            <div className="gate-list">
              {checks.map((check) => (
                <div className={`gate-row ${check.pass ? 'is-pass' : 'is-fail'}`} key={check.label}>
                  {check.pass ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            {openExceptions > 0 && (
              <div className="gate-foot">
                <Link to="/exceptions" className="text-link">Clear {openExceptions} open exception{openExceptions === 1 ? '' : 's'} <ArrowUpRight size={12} /></Link>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader eyebrow="Report library" title="Evidence exports" subtitle="CSV files for finance, audit and treasury." />
            <div className="report-files">
              <div className="report-file">
                <span className="report-file-icon"><FileSpreadsheet size={17} /></span>
                <div>
                  <strong>Close pack</strong>
                  <span>Invoice-level totals, matched transfer, payment variance and kuitansi variance.</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Download size={13} />}
                  onClick={() => download(`/api/reports/close-pack?from=${from}&to=${to}`, `laras-close-pack-${from}-to-${to}.csv`)}
                >
                  CSV
                </Button>
              </div>
              <div className="report-file">
                <span className="report-file-icon"><FileSpreadsheet size={17} /></span>
                <div>
                  <strong>Exception register</strong>
                  <span>Every case with type, severity, vendor, resolution and audit timestamps.</span>
                </div>
                <Button variant="ghost" size="sm" icon={<Download size={13} />} onClick={() => download('/api/reports/exceptions.csv', 'laras-exceptions.csv')}>
                  CSV
                </Button>
              </div>
            </div>
            <div className="report-note">
              <ShieldCheck size={15} />
              <span>Exports honour the same scoped data as the console and are recorded in the audit trail.</span>
            </div>
          </Card>
        </div>
      </div>

      <Card padded={false}>
        <div className="card-header-inline">
          <CardHeader
            eyebrow="Nominal controls"
            title="Recent nominal variances"
            subtitle={`${nominal.formulaFailures} formula · ${nominal.lineFailures} line · ${nominal.receiptFailures} kuitansi · ${nominal.attachmentFailures} document`}
            action={<Link to="/exceptions?type=NOMINAL_VARIANCE" className="text-link">Open in queue <ArrowUpRight size={12} /></Link>}
          />
        </div>
        {nominal.recent.length === 0 ? (
          <EmptyState title="No nominal variances" message="All invoices recompute to their stated total." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Invoice</th><th>Vendor</th><th>Check</th><th className="num">Variance</th><th>Severity</th><th>Status</th><th>Raised</th><th aria-label="Open" /></tr>
              </thead>
              <tbody>
                {nominal.recent.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.invoiceNumber}</td>
                    <td>{item.vendorName}</td>
                    <td>{item.title}</td>
                    <td className={`num money ${item.deltaMinor !== 0 ? 'text-danger' : ''}`}>{formatMoney(item.deltaMinor)}</td>
                    <td><SeverityBadge severity={item.severity} /></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="muted small">{formatDate(item.createdAt)}</td>
                    <td className="num">
                      <Link to={`/exceptions?case=${item.id}`} className="row-action" aria-label={`Open ${item.title}`}>
                        <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
