import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Briefcase,
  CalendarDays,
  Download,
  FileCheck2,
  FileWarning,
  Landmark,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { api, getToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCompactMoney, formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format';
import type {
  Paged,
  TreasuryAccrualReport,
  TreasuryBreak,
  TreasuryCategory,
  TreasuryDeal,
  TreasuryDealDetail,
  TreasurySummary,
} from '../lib/types';
import { PageHeader } from '../components/Shell';
import { HorizontalBars, ProgressRing } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Drawer,
  EmptyState,
  LoadingBlock,
  Pagination,
  SeverityBadge,
  useToast,
} from '../components/ui';

const CATEGORY_OPTIONS: Array<{ value: TreasuryCategory; label: string }> = [
  { value: 'MM_CALL', label: 'Money market call' },
  { value: 'TIME_DEPOSIT', label: 'Time deposit' },
  { value: 'REPO', label: 'Repo' },
  { value: 'GOV_BOND', label: 'Government bond' },
  { value: 'CORP_BOND', label: 'Corporate bond' },
  { value: 'FX_SPOT', label: 'FX spot' },
  { value: 'FX_FORWARD', label: 'FX forward' },
  { value: 'FX_SWAP', label: 'FX swap' },
  { value: 'IRS', label: 'Interest rate swap' },
  { value: 'CORPORATE_LOAN', label: 'Corporate loan' },
  { value: 'SYNDICATED_LOAN', label: 'Syndicated loan' },
  { value: 'PROJECT_FINANCE', label: 'Project finance' },
  { value: 'TRADE_FINANCE', label: 'Trade finance' },
];

const MATCH_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  FULL: 'success',
  PARTIAL: 'warning',
  UNMATCHED: 'danger',
};

function Stat({
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

function MatchBadge({ status }: { status: string | null }) {
  if (!status) return <Badge tone="neutral">Not run</Badge>;
  return <Badge tone={MATCH_TONE[status] ?? 'neutral'} dot>{status === 'FULL' ? 'Full' : status === 'PARTIAL' ? 'Partial' : 'Unmatched'}</Badge>;
}

function DealDrawer({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['treasury-deal', dealId],
    queryFn: () => api.get<TreasuryDealDetail>(`/api/treasury/deals/${dealId}`),
  });

  return (
    <Drawer open onClose={onClose} width={720} label="Treasury deal">
      {isLoading || !data ? (
        <div className="drawer-loading"><LoadingBlock rows={8} /></div>
      ) : (
        <div className="ledger-drawer">
          <div className="eyebrow">{data.deal.categoryLabel} · {data.deal.portfolio}</div>
          <h2 className="drawer-title mono">{data.deal.dealRef}</h2>
          <div className="case-tags">
            <Badge tone="info">{data.deal.direction}</Badge>
            <Badge tone="neutral">{data.deal.instrumentCode}</Badge>
            {data.match && <MatchBadge status={data.match.status} />}
            {data.breaks.length > 0 && <Badge tone="danger">{data.breaks.length} break{data.breaks.length === 1 ? '' : 's'}</Badge>}
            {data.deal.duplicateOf && <Badge tone="danger">Duplicate of {data.deal.duplicateOf}</Badge>}
          </div>

          <div className="case-amount-band is-compact">
            <div><span>Notional</span><strong>{formatMoney(data.deal.notionalMinor, data.deal.currency)}</strong></div>
            <div><span>IDR equivalent</span><strong>{formatCompactMoney(data.deal.notionalIdrMinor)}</strong></div>
            <div><span>Trade date</span><strong>{formatDate(data.deal.tradeDate)}</strong></div>
            <div><span>Maturity</span><strong>{formatDate(data.deal.maturityDate)}</strong></div>
          </div>

          <section className="case-section">
            <h3>Deal terms</h3>
            <dl className="side-dl">
              <div><dt>Counterparty</dt><dd>{data.deal.counterpartyName} ({data.deal.counterpartyCode}) · {data.deal.rating ?? 'NR'}</dd></div>
              <div><dt>Desk / portfolio</dt><dd>{data.deal.desk} · {data.deal.portfolio}</dd></div>
              <div><dt>Value date</dt><dd>{formatDate(data.deal.valueDate)}</dd></div>
              <div><dt>Tenor</dt><dd>{data.deal.tenorDays} days</dd></div>
              <div><dt>Rate</dt><dd>{data.deal.rateBps === null ? '—' : `${(data.deal.rateBps / 100).toFixed(2)}%`}</dd></div>
              <div><dt>Price</dt><dd>{data.deal.price === null ? '—' : data.deal.price.toFixed(2)}</dd></div>
              <div><dt>Coupon</dt><dd>{data.deal.couponBps === null ? '—' : `${(data.deal.couponBps / 100).toFixed(2)}%`}</dd></div>
              <div><dt>FX rate</dt><dd>{data.deal.fxRate === null ? 'IDR' : formatNumber(data.deal.fxRate)}</dd></div>
            </dl>
          </section>

          {data.match && (
            <section className="case-section">
              <h3>Reconciliation result</h3>
              <div className="match-card">
                <div className="match-status">
                  <MatchBadge status={data.match.status} />
                  <span>{data.match.confidence}% confidence</span>
                </div>
                <dl>
                  <div><dt>Documents</dt><dd>{data.match.docsReceived} of {data.match.docsExpected} received</dd></div>
                  <div><dt>Cashflows</dt><dd>{data.match.legsMatched} of {data.match.legsExpected} matched</dd></div>
                  <div><dt>Matched at</dt><dd>{formatDate(data.match.matchedAt, { time: true })}</dd></div>
                </dl>
              </div>
            </section>
          )}

          <section className="case-section">
            <h3>Supporting documents</h3>
            {data.documents.length === 0 ? (
              <p className="muted small">No supporting document received for this deal.</p>
            ) : (
              <div className="receipt-list">
                {data.documents.map((doc) => (
                  <div className="receipt-row" key={doc.id}>
                    <div className="receipt-icon"><FileCheck2 size={15} /></div>
                    <div className="receipt-meta">
                      <strong>{doc.label}</strong>
                      <span className="mono small">{doc.docNumber} · {doc.source} · {formatDate(doc.receivedAt)}</span>
                    </div>
                    <span className="money">{formatMoney(doc.notionalMinor, doc.currency)}</span>
                    <Badge tone={doc.status === 'RECEIVED' ? 'success' : 'warning'}>{doc.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="case-section">
            <h3>Cashflow legs</h3>
            <div className="table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Leg</th>
                    <th>Direction</th>
                    <th className="num">Amount</th>
                    <th>Value date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.legs.map((leg) => (
                    <tr key={leg.id}>
                      <td>{leg.legNo}</td>
                      <td>{leg.legType}</td>
                      <td>
                        <span className="cell-muted">
                          {leg.direction === 'RECEIVE' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />} {leg.direction}
                        </span>
                      </td>
                      <td className="num"><span className="money">{formatMoney(leg.amountMinor, leg.currency)}</span></td>
                      <td>{formatDate(leg.valueDate)}</td>
                      <td><Badge tone={leg.status === 'SETTLED' ? 'success' : leg.status === 'FAILED' ? 'danger' : 'neutral'}>{leg.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="case-section">
            <h3>Breaks</h3>
            {data.breaks.length === 0 ? (
              <p className="muted small">No breaks. Deal fully evidenced and settled.</p>
            ) : (
              <div className="side-exception-list">
                {data.breaks.map((item) => (
                  <div className="side-exception" key={item.id}>
                    <div className="side-exception-top">
                      <strong>{item.label}</strong>
                      <SeverityBadge severity={item.severity} />
                    </div>
                    <span className="cell-muted small">
                      {item.fieldName ? `${item.fieldName}: ` : ''}
                      {item.expectedValue ?? '—'} → {item.actualValue ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

export function TreasuryPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedDeal = params.get('deal');
  const [tab, setTab] = useState<'deals' | 'breaks' | 'accrual'>('deals');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [matchStatus, setMatchStatus] = useState('');
  const [breaksOnly, setBreaksOnly] = useState(false);
  const [dealPage, setDealPage] = useState(1);
  const [breakSeverity, setBreakSeverity] = useState('');
  const [breakType, setBreakType] = useState('');
  const [breakPage, setBreakPage] = useState(1);
  const [accrualPeriod, setAccrualPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [accrualCategory, setAccrualCategory] = useState('');
  const [accrualKind, setAccrualKind] = useState('');
  const [accrualPage, setAccrualPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: ['treasury-summary'],
    queryFn: () => api.get<TreasurySummary>('/api/treasury/summary'),
    refetchInterval: 120_000,
  });

  const dealQuery = useQuery({
    queryKey: ['treasury-deals', { search, category, matchStatus, breaksOnly, dealPage }],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(dealPage), pageSize: '25', sort: 'notional' });
      if (search) query.set('q', search);
      if (category) query.set('category', category);
      if (matchStatus) query.set('matchStatus', matchStatus);
      if (breaksOnly) query.set('breaks', '1');
      return api.get<Paged<TreasuryDeal>>(`/api/treasury/deals?${query.toString()}`);
    },
    enabled: tab === 'deals',
  });

  const breakQuery = useQuery({
    queryKey: ['treasury-breaks', { breakSeverity, breakType, breakPage }],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(breakPage), pageSize: '25', status: 'ACTIVE' });
      if (breakSeverity) query.set('severity', breakSeverity);
      if (breakType) query.set('type', breakType);
      return api.get<Paged<TreasuryBreak>>(`/api/treasury/breaks?${query.toString()}`);
    },
    enabled: tab === 'breaks',
  });

  const accrualQuery = useQuery({
    queryKey: ['treasury-accrual', { accrualPeriod, accrualCategory, accrualKind, accrualPage }],
    queryFn: () => {
      const query = new URLSearchParams({ period: accrualPeriod, page: String(accrualPage), pageSize: '25' });
      if (accrualCategory) query.set('category', accrualCategory);
      if (accrualKind) query.set('kind', accrualKind);
      return api.get<TreasuryAccrualReport>(`/api/treasury/accrual?${query.toString()}`);
    },
    enabled: tab === 'accrual',
  });

  async function downloadAccrual() {
    const params = new URLSearchParams({ period: accrualPeriod });
    const token = getToken();
    const response = await fetch(`/api/treasury/accrual/export?${params.toString()}`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      toast.push({ title: 'Export failed', message: 'The accrual report could not be exported.', tone: 'error' });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `laras-accrual-${accrualPeriod}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const runReconciliation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; stats: { coverage: number; openBreaks: number; full: number } }>('/api/treasury/run'),
    onSuccess: async (result) => {
      toast.push({
        title: 'Treasury reconciliation complete',
        message: `${result.stats.full.toLocaleString('en-US')} fully matched · ${result.stats.coverage.toFixed(1)}% coverage · ${result.stats.openBreaks.toLocaleString('en-US')} open breaks.`,
        tone: 'success',
      });
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.push({ title: 'Run failed', message: error.message, tone: 'error' }),
  });

  const summary = summaryQuery.data;
  const totals = summary?.totals;

  function openDeal(id: string) {
    const next = new URLSearchParams(params);
    next.set('deal', id);
    setParams(next);
  }
  function closeDeal() {
    const next = new URLSearchParams(params);
    next.delete('deal');
    setParams(next);
  }

  if (summaryQuery.isLoading) return <LoadingBlock rows={8} />;
  if (summaryQuery.isError || !summary || !totals) {
    return <EmptyState title="Treasury control unavailable" message="The treasury dataset has not been seeded or the API did not respond." />;
  }

  const coverage = totals.coverage;
  const breakTotal = summary.breaksByType.reduce((sum, row) => sum + row.count, 0);
  const severityMap = new Map(summary.breaksBySeverity.map((row) => [row.severity, row.count]));

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={`Deal-level control · as of ${formatDate(summary.asOf)}${summary.latestRun ? ` · last run ${formatDate(summary.latestRun.finishedAt, { time: true })}` : ''}`}
        title="Treasury & corporate financing"
        subtitle="Money market, securities, FX and financing deals reconciled against trade confirmations, custody statements and settlement cashflows."
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<RefreshCcw size={14} className={summaryQuery.isFetching ? 'spin' : ''} />} onClick={() => summaryQuery.refetch()}>
              Refresh
            </Button>
            {can(['ANALYST', 'SUPERVISOR']) && (
              <Button size="sm" icon={<Play size={14} />} loading={runReconciliation.isPending} onClick={() => runReconciliation.mutate()}>
                Run treasury recon
              </Button>
            )}
          </>
        }
      />

      <section className="kpi-grid">
        <Stat
          label="Deal coverage"
          value={formatPercent(coverage)}
          icon={<FileCheck2 size={17} />}
          foot={<span><strong>{formatNumber(totals.full)}</strong> full · <strong>{formatNumber(totals.partial)}</strong> partial · <strong>{formatNumber(totals.unmatched)}</strong> unmatched</span>}
        >
          <div className="kpi-ring"><ProgressRing value={coverage} size={72} stroke={7} /></div>
        </Stat>

        <Stat
          dark
          label="Deal notional"
          value={formatCompactMoney(totals.notionalIdrMinor)}
          icon={<Landmark size={17} />}
          foot={<span>{formatNumber(totals.deals)} deals across {summary.categories.length} product lines</span>}
        >
          <div className="kpi-dark-meta">
            <span className="live-dot" />
            {summary.latestRun ? `${formatNumber(summary.latestRun.stats.docsReceived)} of ${formatNumber(summary.latestRun.stats.docsExpected)} documents received` : 'Awaiting first run'}
          </div>
        </Stat>

        <Stat
          label="Open breaks"
          value={formatNumber(breakTotal)}
          icon={<ShieldAlert size={17} />}
          foot={<span>Across {summary.breaksByType.length} break types</span>}
        >
          <div className="kpi-severity">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
              <span key={level} className={`severity-count severity-count-${level.toLowerCase()}`}>
                {severityMap.get(level) ?? 0}
              </span>
            ))}
          </div>
        </Stat>

        <Stat
          label="Supporting evidence"
          value={formatNumber(totals.documents)}
          icon={<FileWarning size={17} />}
          foot={<span><strong>{formatNumber(totals.legs)}</strong> cashflow legs · <strong>{formatNumber(totals.failedLegs)}</strong> failed settlements</span>}
        >
          <div className="kpi-substats">
            <span><strong>{summary.latestRun ? formatNumber(summary.latestRun.stats.docsMissing) : 0}</strong> documents outstanding</span>
            <span><strong>{summary.latestRun ? formatCompactMoney(summary.latestRun.stats.valueAtRiskIdrMinor) : '—'}</strong> exposed notional</span>
          </div>
        </Stat>
      </section>

      <Card padded={false}>
        <div className="card-header-inline">
          <CardHeader
            eyebrow="Coverage"
            title="Product lines"
            subtitle="Deals, notional and reconciliation status per treasury or financing product."
          />
        </div>
        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Deals</th>
                <th className="num">Notional</th>
                <th className="num">Full</th>
                <th className="num">Partial</th>
                <th className="num">Unmatched</th>
                <th className="num">Open breaks</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {summary.categories.map((row) => {
                const coveragePct = row.deals ? (row.full / row.deals) * 100 : 0;
                return (
                  <tr
                    key={row.category}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setCategory(row.category);
                      setDealPage(1);
                      setTab('deals');
                      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    }}
                  >
                    <td><span className="cell-title">{row.label}</span></td>
                    <td className="num">{formatNumber(row.deals)}</td>
                    <td className="num"><span className="money">{formatCompactMoney(row.notionalIdrMinor)}</span></td>
                    <td className="num">{formatNumber(row.full)}</td>
                    <td className="num">{formatNumber(row.partial)}</td>
                    <td className="num">{formatNumber(row.unmatched)}</td>
                    <td className="num">{row.openBreaks > 0 ? <Badge tone="warning">{formatNumber(row.openBreaks)}</Badge> : '—'}</td>
                    <td>
                      <div className="h-bar-track" style={{ minWidth: 110 }}>
                        <div className="h-bar-fill" style={{ width: `${Math.max(2, coveragePct)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="dash-columns">
        <div className="dash-col-main">
          <Card>
            <div className="segmented-row">
              <div className="segmented segmented-sm" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'deals'} className={`segmented-item ${tab === 'deals' ? 'is-active' : ''}`} onClick={() => setTab('deals')}>
                  Deals <span className="segmented-count">{formatNumber(totals.deals)}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === 'breaks'} className={`segmented-item ${tab === 'breaks' ? 'is-active' : ''}`} onClick={() => setTab('breaks')}>
                  Breaks <span className="segmented-count">{formatNumber(breakTotal)}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === 'accrual'} className={`segmented-item ${tab === 'accrual' ? 'is-active' : ''}`} onClick={() => setTab('accrual')}>
                  Month-end accrual
                </button>
              </div>
            </div>

            {tab === 'deals' ? (
              <>
                <div className="queue-toolbar">
                  <div className="search-shell">
                    <Search size={15} />
                    <input
                      value={search}
                      onChange={(event) => { setSearch(event.target.value); setDealPage(1); }}
                      placeholder="Search deal ref, instrument or counterparty…"
                      aria-label="Search treasury deals"
                    />
                    {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
                  </div>
                  <div className="toolbar-filters">
                    <select value={category} onChange={(event) => { setCategory(event.target.value); setDealPage(1); }} aria-label="Filter product">
                      <option value="">All products</option>
                      {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select value={matchStatus} onChange={(event) => { setMatchStatus(event.target.value); setDealPage(1); }} aria-label="Filter match status">
                      <option value="">All statuses</option>
                      <option value="FULL">Full match</option>
                      <option value="PARTIAL">Partial</option>
                      <option value="UNMATCHED">Unmatched</option>
                      <option value="NONE">Not reconciled</option>
                    </select>
                    <Checkbox
                      checked={breaksOnly}
                      onChange={(checked) => { setBreaksOnly(checked); setDealPage(1); }}
                      label="With breaks"
                    />
                  </div>
                </div>

                {dealQuery.isLoading ? (
                  <div className="queue-loading"><LoadingBlock rows={8} /></div>
                ) : (dealQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState title="No deals match these filters" message="Clear the filters or seed the treasury dataset." />
                ) : (
                  <>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Deal</th>
                            <th>Product</th>
                            <th>Counterparty</th>
                            <th className="num">Notional</th>
                            <th>Maturity</th>
                            <th>Match</th>
                            <th className="num">Breaks</th>
                            <th aria-label="Open" />
                          </tr>
                        </thead>
                        <tbody>
                          {dealQuery.data!.items.map((deal) => (
                            <tr key={deal.id} onClick={() => openDeal(deal.id)}>
                              <td>
                                <div className="cell-stack">
                                  <span className="cell-title mono">{deal.dealRef}</span>
                                  <span className="cell-muted small">{deal.instrumentCode} · {deal.direction}</span>
                                </div>
                              </td>
                              <td className="cell-muted">{CATEGORY_OPTIONS.find((option) => option.value === deal.category)?.label ?? deal.category}</td>
                              <td>
                                <div className="cell-stack">
                                  <span>{deal.counterpartyName}</span>
                                  <span className="cell-muted small">{deal.counterpartyCode} · {deal.partyType}</span>
                                </div>
                              </td>
                              <td className="num">
                                <span className="money">{formatMoney(deal.notionalMinor, deal.currency)}</span>
                                {deal.currency !== 'IDR' && <span className="cell-muted small">{formatCompactMoney(deal.notionalIdrMinor)}</span>}
                              </td>
                              <td className="cell-muted">{formatDate(deal.maturityDate)}</td>
                              <td><MatchBadge status={deal.matchStatus} /></td>
                              <td className="num">{deal.openBreaks > 0 ? <Badge tone="danger">{deal.openBreaks}</Badge> : '—'}</td>
                              <td className="num"><ArrowUpRight size={15} className="cell-muted" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={dealQuery.data!.page}
                      totalPages={dealQuery.data!.totalPages}
                      total={dealQuery.data!.total}
                      onChange={setDealPage}
                    />
                  </>
                )}
              </>
            ) : tab === 'breaks' ? (
              <>
                <div className="queue-toolbar">
                  <div className="toolbar-filters">
                    <select value={breakSeverity} onChange={(event) => { setBreakSeverity(event.target.value); setBreakPage(1); }} aria-label="Filter severity">
                      <option value="">All severities</option>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                    <select value={breakType} onChange={(event) => { setBreakType(event.target.value); setBreakPage(1); }} aria-label="Filter break type">
                      <option value="">All break types</option>
                      {summary.breaksByType.map((row) => <option key={row.type} value={row.type}>{row.label}</option>)}
                    </select>
                  </div>
                </div>

                {breakQuery.isLoading ? (
                  <div className="queue-loading"><LoadingBlock rows={8} /></div>
                ) : (breakQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState title="No open breaks" message="Every deal is fully evidenced and settled." icon={<FileCheck2 size={22} />} />
                ) : (
                  <>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Break</th>
                            <th>Deal</th>
                            <th>Counterparty</th>
                            <th>Expected → actual</th>
                            <th>Severity</th>
                            <th className="num">Deal notional</th>
                            <th aria-label="Open" />
                          </tr>
                        </thead>
                        <tbody>
                          {breakQuery.data!.items.map((item) => (
                            <tr key={item.id} onClick={() => openDeal(item.dealId)}>
                              <td>
                                <div className="cell-stack">
                                  <span className="cell-title">{item.label}</span>
                                  <span className="cell-muted small">{item.categoryLabel}</span>
                                </div>
                              </td>
                              <td className="mono small">{item.dealRef}</td>
                              <td className="cell-muted">{item.counterpartyName}</td>
                              <td>
                                <span className="mono small">
                                  {item.expectedValue ?? '—'} <span className="cell-muted">→</span> {item.actualValue ?? '—'}
                                </span>
                              </td>
                              <td><SeverityBadge severity={item.severity} /></td>
                              <td className="num"><span className="money">{formatCompactMoney(item.notionalIdrMinor)}</span></td>
                              <td className="num"><ArrowUpRight size={15} className="cell-muted" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={breakQuery.data!.page}
                      totalPages={breakQuery.data!.totalPages}
                      total={breakQuery.data!.total}
                      onChange={setBreakPage}
                    />
                  </>
                )}
              </>
            ) : (
              <div className="accrual-panel">
                <div className="queue-toolbar">
                  <div className="toolbar-filters">
                    <label className="inline-field">
                      <CalendarDays size={15} />
                      <input
                        type="month"
                        value={accrualPeriod}
                        onChange={(event) => { setAccrualPeriod(event.target.value); setAccrualPage(1); }}
                        aria-label="Accrual period"
                      />
                    </label>
                    <select value={accrualCategory} onChange={(event) => { setAccrualCategory(event.target.value); setAccrualPage(1); }} aria-label="Filter accrual product">
                      <option value="">All products</option>
                      {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select value={accrualKind} onChange={(event) => { setAccrualKind(event.target.value); setAccrualPage(1); }} aria-label="Filter accrual direction">
                      <option value="">Income & expense</option>
                      <option value="INCOME">Income only</option>
                      <option value="EXPENSE">Expense only</option>
                    </select>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={downloadAccrual} disabled={accrualQuery.isLoading}>
                    Export CSV
                  </Button>
                </div>

                {accrualQuery.isLoading ? (
                  <div className="queue-loading"><LoadingBlock rows={8} /></div>
                ) : accrualQuery.isError || !accrualQuery.data ? (
                  <EmptyState title="Accrual report unavailable" message="Choose a valid month and try again." />
                ) : (
                  <>
                    <div className="kpi-substats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, padding: '4px 0 16px' }}>
                      <div>
                        <div className="eyebrow">Net accrual</div>
                        <strong className="money">{formatCompactMoney(accrualQuery.data.totals.netIdrMinor)}</strong>
                        <div className="cell-muted small">{formatDate(accrualQuery.data.from)} – {formatDate(accrualQuery.data.to)}</div>
                      </div>
                      <div>
                        <div className="eyebrow">Income</div>
                        <strong className="money">{formatCompactMoney(accrualQuery.data.totals.incomeIdrMinor)}</strong>
                        <div className="cell-muted small">Interest, coupon, fee and point income</div>
                      </div>
                      <div>
                        <div className="eyebrow">Expense</div>
                        <strong className="money">{formatCompactMoney(accrualQuery.data.totals.expenseIdrMinor)}</strong>
                        <div className="cell-muted small">Funding, swap and forward premium</div>
                      </div>
                      <div>
                        <div className="eyebrow">Deals accrued</div>
                        <strong>{formatNumber(accrualQuery.data.totals.deals)}</strong>
                        <div className="cell-muted small">{formatCompactMoney(accrualQuery.data.totals.principalIdrMinor)} principal base</div>
                      </div>
                    </div>

                    <div className="card-header-inline" style={{ paddingBottom: 8 }}>
                      <div>
                        <div className="eyebrow">Journal</div>
                        <strong>Month-end double-entry posting</strong>
                      </div>
                      <Badge tone={accrualQuery.data.balanced ? 'success' : 'danger'} dot>
                        {accrualQuery.data.balanced ? 'Debits = credits' : 'Out of balance'}
                      </Badge>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th>Name</th>
                            <th className="num">Debit</th>
                            <th className="num">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accrualQuery.data.journal.map((row) => (
                            <tr key={row.account}>
                              <td className="mono small">{row.account}</td>
                              <td>{row.name}</td>
                              <td className="num">{row.debitIdrMinor ? <span className="money">{formatCompactMoney(row.debitIdrMinor)}</span> : <span className="cell-muted">—</span>}</td>
                              <td className="num">{row.creditIdrMinor ? <span className="money">{formatCompactMoney(row.creditIdrMinor)}</span> : <span className="cell-muted">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="card-header-inline" style={{ paddingTop: 20, paddingBottom: 8 }}>
                      <div>
                        <div className="eyebrow">Calculation</div>
                        <strong>Accrual per deal and convention</strong>
                      </div>
                      <span className="cell-muted small">{formatNumber(accrualQuery.data.total)} accrual entries</span>
                    </div>
                    {accrualQuery.data.items.length === 0 ? (
                      <EmptyState title="No accruals in this period" message="Choose another month or product filter." />
                    ) : (
                      <>
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Deal</th>
                                <th>Type</th>
                                <th>Period</th>
                                <th>Calculation</th>
                                <th className="num">Accrued (IDR)</th>
                                <th>Journal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accrualQuery.data.items.map((item) => (
                                <tr key={`${item.dealId}-${item.accrualType}-${item.from}`} onClick={() => openDeal(item.dealId)}>
                                  <td>
                                    <div className="cell-stack">
                                      <span className="cell-title mono">{item.dealRef}</span>
                                      <span className="cell-muted small">{item.categoryLabel} · {item.counterparty}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <Badge tone={item.kind === 'INCOME' ? 'success' : 'warning'}>{item.accrualType.replace('_', ' ')}</Badge>
                                  </td>
                                  <td className="cell-muted small">{formatDate(item.from)} → {formatDate(item.to)}<br />{item.days} days · {item.dayBasis}</td>
                                  <td className="cell-muted small mono">{item.formula}</td>
                                  <td className="num">
                                    <span className="money">{formatCompactMoney(item.amountIdrMinor)}</span>
                                    {item.currency !== 'IDR' && <span className="cell-muted small">{formatMoney(item.amountMinor, item.currency)}</span>}
                                  </td>
                                  <td className="mono small">Dr {item.debitAccount}<br />Cr {item.creditAccount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pagination
                          page={accrualQuery.data.page}
                          totalPages={accrualQuery.data.totalPages}
                          total={accrualQuery.data.total}
                          onChange={setAccrualPage}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="dash-col-side">
          <Card>
            <CardHeader eyebrow="Evidence" title="Break mix" subtitle="Open breaks by type and exposed notional." />
            {summary.breaksByType.length === 0 ? (
              <EmptyState title="No breaks" message="All deals are clean." icon={<FileCheck2 size={20} />} />
            ) : (
              <>
                <HorizontalBars
                  items={summary.breaksByType.slice(0, 8).map((row) => ({
                    label: row.label,
                    sub: `${formatNumber(row.count)} cases`,
                    value: row.valueMinor,
                    color: row.count > 0 ? '#B45309' : '#0B5C4B',
                  }))}
                />
                <div className="aging-foot">
                  <FileWarning size={14} />
                  <span>{formatNumber(breakTotal)} open breaks across the current portfolio.</span>
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader eyebrow="Concentration" title="Counterparties at risk" subtitle="Open breaks by counterparty." />
            {summary.topCounterparties.length === 0 ? (
              <EmptyState title="No counterparty exposure" message="Every counterparty position is clean." />
            ) : (
              <div className="vendor-risk-list">
                {summary.topCounterparties.map((party, index) => (
                  <div className="vendor-risk-row" key={party.id}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="vendor-risk-meta">
                      <strong>{party.name}</strong>
                      <span>{party.code} · {party.party_type} · {party.breaks} break{party.breaks === 1 ? '' : 's'}</span>
                    </div>
                    <span className="vendor-risk-value">{formatCompactMoney(party.exposure)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="upcoming-card">
            <div className="upcoming-icon"><Banknote size={18} /></div>
            <div>
              <div className="eyebrow">Supporting documents</div>
              <strong>{formatNumber(totals.documents)} documents on file</strong>
              <p>Trade confirmations, custody statements and settlement advices are matched per deal.</p>
            </div>
          </div>

          <div className="run-footnote">
            <Briefcase size={14} />
            <span>
              {can(['ANALYST', 'SUPERVISOR'])
                ? 'Manual runs capture a fresh evidence snapshot; seed runs are recorded as SEED.'
                : 'Auditor view is read-only. Runs are recorded in the treasury run history.'}
            </span>
          </div>
        </div>
      </div>

      {selectedDeal && <DealDrawer dealId={selectedDeal} onClose={closeDeal} />}
    </div>
  );
}
