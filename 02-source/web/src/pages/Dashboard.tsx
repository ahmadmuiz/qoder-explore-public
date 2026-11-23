import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileWarning,
  Inbox,
  Landmark,
  ScanLine,
  ShieldAlert,
  Timer,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import {
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTime,
  timeAgo,
  TYPE_SHORT,
} from '../lib/format';
import type { Dashboard } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { AgingBars, Donut, ProgressRing, ThroughputChart, typeColor } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingBlock,
  SeverityBadge,
  TypeChip,
  useToast,
} from '../components/ui';

function KpiCard({
  label,
  value,
  foot,
  icon,
  dark = false,
  children,
}: {
  label: string;
  value: string;
  foot: React.ReactNode;
  icon: React.ReactNode;
  dark?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`kpi-card ${dark ? 'is-dark' : ''}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon">{icon}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">{foot}</div>
      {children}
    </div>
  );
}

export function DashboardPage() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/api/dashboard'),
    refetchInterval: 60_000,
  });

  async function exportClosePack() {
    try {
      await downloadFile('/api/reports/close-pack', 'laras-close-pack.csv');
      toast.push({ title: 'Close pack exported', message: 'CSV includes invoice, ledger and kuitansi positions.', tone: 'success' });
    } catch (cause) {
      toast.push({ title: 'Export failed', message: cause instanceof Error ? cause.message : 'Try again.', tone: 'error' });
    }
  }

  if (isLoading) return <LoadingBlock rows={7} />;
  if (isError || !data) {
    return <EmptyState title="Control room unavailable" message={error instanceof Error ? error.message : 'The API did not respond.'} />;
  }

  const { kpis, breakdown, trend, severity, aging, topVendors, recentExceptions, upcoming, lastRun } = data;
  const openTotal = kpis.openExceptions;
  const segments = breakdown
    .filter((item) => item.count > 0)
    .map((item) => ({ ...item, value: item.count, label: TYPE_SHORT[item.type] ?? item.type, type: item.type }));
  const severityCounts = new Map(severity.map((item) => [item.severity, item.count]));
  const trendMatched = trend.reduce((sum, point) => sum + point.matchedValueMinor, 0);

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={`Operations · as of ${formatDate(data.asOf)} · period ${formatDate(data.period.from)} – ${formatDate(data.period.to)}`}
        title="Reconciliation control room"
        subtitle="Invoice settlement, incoming transfers and vendor kuitansi — matched by reference and amount, with every exception evidenced."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportClosePack}>
              Close pack
            </Button>
            <Link to="/imports" className="btn btn-primary btn-sm">
              <UploadCloud size={14} />
              <span>Import statement</span>
            </Link>
          </>
        }
      />

      <section className="kpi-grid">
        <KpiCard
          label="Reconciliation coverage"
          value={formatPercent(kpis.matchedRate)}
          icon={<ScanLine size={17} />}
          foot={
            <span>
              <strong>{formatNumber(kpis.ledgerRows)}</strong> ledger rows · <strong>{formatNumber(kpis.invoices)}</strong> invoices
            </span>
          }
        >
          <div className="kpi-ring">
            <ProgressRing value={kpis.matchedRate} size={72} stroke={7} />
          </div>
        </KpiCard>

        <KpiCard
          dark
          label="Value at risk"
          value={formatCompactMoney(kpis.valueAtRiskMinor)}
          icon={<ShieldAlert size={17} />}
          foot={
            <span>
              {formatMoney(kpis.unresolvedValueMinor)} tied to open exceptions
            </span>
          }
        >
          <div className="kpi-dark-meta">
            <span className="live-dot" />
            {lastRun ? `Last run ${formatTime(lastRun.finishedAt)} · ${lastRun.stats.exactMatches} exact hits` : 'Awaiting first run'}
          </div>
        </KpiCard>

        <KpiCard
          label="Open exceptions"
          value={formatNumber(kpis.openExceptions)}
          icon={<Inbox size={17} />}
          foot={
            <div className="kpi-split">
              <span><strong>{kpis.missingPayments ?? 0}</strong> missing</span>
              <span><strong>{kpis.duplicates ?? 0}</strong> duplicates</span>
            </div>
          }
        >
          <div className="kpi-severity">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
              <span key={level} className={`severity-count severity-count-${level.toLowerCase()}`}>
                {severityCounts.get(level) ?? 0}
              </span>
            ))}
          </div>
        </KpiCard>

        <KpiCard
          label="Reconciled this period"
          value={formatCompactMoney(kpis.reconciledValueMinor)}
          icon={<Wallet size={17} />}
          foot={
            <span className="kpi-inline">
              <CheckCircle2 size={13} />
              {formatNumber(kpis.resolved7d)} closed in 7 days{kpis.avgResolutionHours ? ` · avg ${kpis.avgResolutionHours.toFixed(1)}h` : ''}
            </span>
          }
        >
          <div className="kpi-substats">
            <span><strong>{formatNumber(kpis.importsSkipped)}</strong> duplicate rows skipped</span>
            <span><strong>{formatCompactMoney(upcoming.valueMinor)}</strong> due next 7 days</span>
          </div>
        </KpiCard>
      </section>

      <div className="dash-columns">
        <div className="dash-col-main">
          <Card>
            <CardHeader
              eyebrow="Liquidity vs match"
              title="Statement throughput"
              subtitle="Daily incoming ledger value against value matched to invoices."
              action={
                <div className="legend">
                  <span className="legend-item"><span className="legend-swatch" style={{ background: '#CFE3D8' }} /> Ledger</span>
                  <span className="legend-item"><span className="legend-swatch" style={{ background: '#0B5C4B' }} /> Matched</span>
                </div>
              }
            />
            {trend.length > 1 ? (
              <ThroughputChart data={trend} height={250} />
            ) : (
              <EmptyState title="Not enough ledger history" message="Import a bank statement to populate the throughput view." />
            )}
            <div className="chart-foot">
              <span>{formatDate(data.period.from)} — {formatDate(data.period.to)}</span>
              <span>{formatCompactMoney(trendMatched)} matched across {formatNumber(trend.reduce((sum, point) => sum + point.ledgerCount, 0))} transfers</span>
            </div>
          </Card>

          <Card padded={false}>
            <div className="card-header-inline">
              <CardHeader
                eyebrow="Triage"
                title="Priority queue"
                subtitle="Newest unresolved exceptions, ordered by exposure."
                action={<Link to="/exceptions" className="text-link">Open queue <ArrowUpRight size={13} /></Link>}
              />
            </div>
            {recentExceptions.length === 0 ? (
              <EmptyState title="Queue is clear" message="No open exceptions in the current period." icon={<CheckCircle2 size={22} />} />
            ) : (
              <div className="table-wrap">
                <table className="data-table queue-table">
                  <thead>
                    <tr>
                      <th>Exception</th>
                      <th>Vendor / invoice</th>
                      <th className="num">Amount</th>
                      <th>Age</th>
                      <th aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentExceptions.slice(0, 6).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="cell-stack">
                            <TypeChip type={item.type} />
                            <span className="cell-title">{item.title}</span>
                          </div>
                        </td>
                        <td>
                          <div className="cell-stack">
                            <span className="cell-muted">{item.vendorName ?? 'Unassigned vendor'}</span>
                            <span className="mono small">{item.invoiceNumber ?? 'No invoice ref'}</span>
                          </div>
                        </td>
                        <td className="num">
                          <span className="money">{formatMoney(item.amountMinor)}</span>
                          <SeverityBadge severity={item.severity} />
                        </td>
                        <td className="cell-muted">{timeAgo(item.createdAt)}</td>
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

        <div className="dash-col-side">
          <Card>
            <CardHeader eyebrow="Composition" title="Exception mix" subtitle="Open cases by type." />
            <div className="donut-block">
              <Donut segments={segments} size={164} centerLabel="open cases" centerValue={String(openTotal)} />
              <div className="donut-legend">
                {breakdown.map((item) => (
                  <div className="donut-legend-row" key={item.type}>
                    <span className="legend-swatch" style={{ background: typeColor(item.type) }} />
                    <span className="donut-legend-label">{TYPE_SHORT[item.type]}</span>
                    <span className="donut-legend-count">{item.count}</span>
                    <span className="donut-legend-value">{formatCompactMoney(item.valueMinor)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Exposure" title="Vendor concentration" subtitle="Open exception value by vendor." />
            {topVendors.length === 0 ? (
              <EmptyState title="No vendor exposure" message="All vendor positions are clean." />
            ) : (
              <div className="vendor-risk-list">
                {topVendors.slice(0, 5).map((vendor, index) => (
                  <div className="vendor-risk-row" key={vendor.id}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="vendor-risk-meta">
                      <strong>{vendor.name}</strong>
                      <span>{vendor.code} · {vendor.count} open case{vendor.count === 1 ? '' : 's'}</span>
                    </div>
                    <span className="vendor-risk-value">{formatCompactMoney(vendor.valueMinor)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              eyebrow="Service level"
              title="Aging"
              subtitle="Open exceptions by age bucket."
              action={<Badge tone={aging.some((bucket) => bucket.bucket.startsWith('> 7') && bucket.count > 0) ? 'warning' : 'success'}>{aging.reduce((sum, bucket) => sum + bucket.count, 0)} active</Badge>}
            />
            <AgingBars data={aging} />
            <div className="aging-foot">
              <Timer size={14} />
              <span>Target: 90% of cases closed within 3 business days.</span>
            </div>
          </Card>

          <div className="upcoming-card">
            <div className="upcoming-icon"><Landmark size={18} /></div>
            <div>
              <div className="eyebrow">Upcoming settlement</div>
              <strong>{upcoming.count} invoices · {formatMoney(upcoming.valueMinor)}</strong>
              <p>Due in the next 7 days. Confirm kuitansi before releasing funds.</p>
            </div>
            <Link to="/invoices" className="text-link">View <ArrowUpRight size={12} /></Link>
          </div>

          <div className="run-footnote">
            <FileWarning size={14} />
            <span>
              {kpis.importsSkipped > 0
                ? `${formatNumber(kpis.importsSkipped)} duplicate lines were skipped on re-import — no reconciliation impact.`
                : 'Duplicate detection active on every statement import.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
