import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowUpRight, Search, ShieldAlert, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, formatMoney, formatNumber, timeAgo } from '../lib/format';
import type { ExceptionType, LedgerRow, Paged, Severity } from '../lib/types';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  LoadingBlock,
  Pagination,
  SeverityBadge,
  StatusBadge,
  TypeChip,
} from '../components/ui';

interface LedgerDetail {
  transaction: LedgerRow & {
    normalizedRef: string;
    vendorId?: string | null;
    createdAt?: string;
    batchFile?: string | null;
    importedAt?: string | null;
  };
  match: {
    status: string;
    deltaMinor: number;
    confidence: number;
    invoiceNumber: string;
    invoiceTotalMinor: number;
    dueDate: string;
    invoiceStatus: string;
    paymentRef: string | null;
  } | null;
  exceptions: Array<{
    id: string;
    type: ExceptionType;
    severity: Severity;
    status: string;
    title: string;
    invoiceNumber: string | null;
    amountMinor: number;
    deltaMinor: number;
    createdAt: string;
  }>;
  relatedPayments: Array<{ id: string; transactionId: string; amountMinor: number; valueDate: string; accountMask: string; status: string }>;
}

function LedgerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api.get<LedgerDetail>(`/api/transactions/${id}`),
  });

  return (
    <Drawer open onClose={onClose} width={620} label="Ledger transaction">
      {isLoading || !data ? (
        <div className="drawer-loading"><LoadingBlock rows={7} /></div>
      ) : (
        <div className="ledger-drawer">
          <div className="eyebrow">Incoming transfer</div>
          <h2 className="drawer-title mono">{data.transaction.transactionId}</h2>
          <div className="case-tags">
            <StatusBadge status={data.transaction.status} />
            {data.match && <Badge tone={data.match.status === 'EXACT' ? 'success' : 'warning'}>{data.match.status} match</Badge>}
            <Badge tone="neutral">{data.transaction.channel ?? 'Channel n/a'}</Badge>
          </div>

          <div className="case-amount-band is-compact">
            <div><span>Amount</span><strong>{formatMoney(data.transaction.amountMinor, data.transaction.currency)}</strong></div>
            <div><span>Value date</span><strong>{formatDate(data.transaction.valueDate)}</strong></div>
            <div><span>Account</span><strong className="mono">{data.transaction.accountMask ?? '—'}</strong></div>
            <div><span>Normalized ref</span><strong className="mono">{data.transaction.normalizedRef}</strong></div>
          </div>

          <section className="case-section">
            <h3>Description</h3>
            <p className="muted">{data.transaction.description ?? 'No narrative on the statement row.'}</p>
            <dl className="side-dl">
              <div><dt>Vendor</dt><dd>{data.transaction.vendorName ?? '—'} {data.transaction.vendorCode ? `(${data.transaction.vendorCode})` : ''}</dd></div>
              <div><dt>Invoice on statement</dt><dd className="mono">{data.transaction.invoiceNumber ?? '—'}</dd></div>
              <div><dt>Imported</dt><dd>{data.transaction.importedAt ? `${timeAgo(data.transaction.importedAt)} · ${data.transaction.batchFile ?? ''}` : '—'}</dd></div>
            </dl>
          </section>

          <section className="case-section">
            <h3>Invoice match</h3>
            {data.match ? (
              <div className="match-card">
                <div className="match-status">
                  <StatusBadge status={data.match.status} />
                  <span>{data.match.confidence}% confidence</span>
                </div>
                <dl>
                  <div><dt>Invoice</dt><dd><Link to={`/invoices/${data.match.invoiceNumber}`} className="text-link">{data.match.invoiceNumber} <ArrowUpRight size={11} /></Link></dd></div>
                  <div><dt>Invoice total</dt><dd className="money">{formatMoney(data.match.invoiceTotalMinor)}</dd></div>
                  <div><dt>Payment delta</dt><dd className={`money ${data.match.deltaMinor !== 0 ? 'text-warning' : ''}`}>{formatMoney(data.match.deltaMinor)}</dd></div>
                  <div><dt>Invoice due</dt><dd>{formatDate(data.match.dueDate)}</dd></div>
                </dl>
              </div>
            ) : (
              <EmptyState title="No invoice allocated" message="This transfer is not matched to any invoice." icon={<ArrowLeftRight size={20} />} />
            )}
          </section>

          {data.exceptions.length > 0 && (
            <section className="case-section">
              <h3>Exceptions raised from this row</h3>
              <div className="side-exception-list">
                {data.exceptions.map((item) => (
                  <Link to={`/exceptions?case=${item.id}`} key={item.id} className="side-exception">
                    <div className="side-exception-top">
                      <TypeChip type={item.type} />
                      <SeverityBadge severity={item.severity} showLabel={false} />
                    </div>
                    <strong>{item.title}</strong>
                    <span>{formatMoney(item.amountMinor)} · {formatDate(item.createdAt)}</span>
                    <div className="side-exception-foot">
                      <StatusBadge status={item.status} />
                      <ArrowUpRight size={14} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.relatedPayments.length > 0 && (
            <section className="case-section">
              <h3>Same payment reference</h3>
              <p className="section-hint">Repeated references are treated as potential duplicate disbursements.</p>
              <div className="related-payments">
                {data.relatedPayments.map((payment) => (
                  <div key={payment.id} className="related-payment-row">
                    <span className="mono small">{payment.transactionId}</span>
                    <span>{formatDate(payment.valueDate)}</span>
                    <span className="money">{formatMoney(payment.amountMinor)}</span>
                    <StatusBadge status={payment.status} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function LedgerPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('newest');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, status, sort, from, to]);

  const query = new URLSearchParams({ page: String(page), pageSize: '25', sort });
  if (status !== 'ALL') query.set('status', status);
  if (search.trim()) query.set('q', search.trim());
  if (from) query.set('from', from);
  if (to) query.set('to', to);

  const { data, isLoading } = useQuery({
    queryKey: ['ledger', query.toString()],
    queryFn: () => api.get<Paged<LedgerRow>>(`/api/transactions?${query.toString()}`),
  });

  const rows = data?.items ?? [];
  const matched = rows.filter((row) => row.matchStatus).length;
  const flagged = rows.filter((row) => (row.openExceptions ?? 0) > 0).length;
  const value = rows.reduce((sum, row) => sum + row.amountMinor, 0);

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Bank statement · incoming transfers"
        title="Ledger explorer"
        subtitle="Every incoming rupiah with its normalized payment reference, invoice allocation and exception linkage."
      />

      <div className="mini-stats">
        <div><span>Rows in view</span><strong>{formatNumber(data?.total ?? 0)}</strong></div>
        <div><span>Value in view</span><strong>{formatMoney(value)}</strong></div>
        <div><span>Matched on page</span><strong>{matched}/{rows.length}</strong></div>
        <div><span>Flagged on page</span><strong>{flagged}</strong></div>
      </div>

      <Card padded={false}>
        <div className="queue-toolbar">
          <div className="search-shell">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search transaction, invoice, vendor or narrative…"
              aria-label="Search ledger"
            />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
          </div>
          <div className="toolbar-filters">
            <label className="date-group">
              <span>From</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From value date" />
            </label>
            <label className="date-group">
              <span>To</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To value date" />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter ledger status">
              <option value="ALL">All statuses</option>
              <option value="MATCHED">Matched</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="DUPLICATE">Duplicate</option>
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort ledger">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount">Largest amount</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="queue-loading"><LoadingBlock rows={9} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={22} />}
            title="No ledger rows match"
            message="Adjust filters or import a bank statement."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table ledger-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Value date</th>
                    <th>Vendor / narrative</th>
                    <th className="num">Amount</th>
                    <th>Reference</th>
                    <th>Match</th>
                    <th>Exceptions</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} onClick={() => setDetailId(row.id)}>
                      <td>
                        <span className="mono small">{row.transactionId}</span>
                        <span className="small block muted">{row.channel} · {row.accountMask}</span>
                      </td>
                      <td>{formatDate(row.valueDate)}</td>
                      <td>
                        <span className="cell-strong">{row.vendorName ?? 'Unknown vendor'}</span>
                        <span className="cell-muted trunc block">{row.description ?? '—'}</span>
                      </td>
                      <td className="num">
                        <span className="money">{formatMoney(row.amountMinor, row.currency)}</span>
                        {row.matchStatus === 'PROVISIONAL' && row.matchedInvoiceNumber && <span className="small block text-warning">provisional</span>}
                      </td>
                      <td>
                        <span className="mono small">{row.invoiceNumber ?? '—'}</span>
                        <span className="mono small block muted">{row.normalizedRef ?? ''}</span>
                      </td>
                      <td>
                        {row.matchStatus ? (
                          <div className="cell-stack">
                            <StatusBadge status={row.matchStatus} />
                            <span className="small muted mono">{row.matchedInvoiceNumber}</span>
                          </div>
                        ) : (
                          <span className="muted small">Unallocated</span>
                        )}
                      </td>
                      <td>
                        {(row.openExceptions ?? 0) > 0 ? (
                          <span className="attention-pill"><ShieldAlert size={13} />{row.openExceptions}</span>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="row-action"
                          onClick={(event) => { event.stopPropagation(); setDetailId(row.id); }}
                          aria-label={`Open ${row.transactionId}`}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </Card>

      {detailId && <LedgerDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
