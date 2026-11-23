import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, FilePlus2, ReceiptText, Search, ShieldAlert, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, formatMoney, formatNumber, timeAgo } from '../lib/format';
import type { Invoice, Paged, Vendor } from '../lib/types';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Pagination,
  StatusBadge,
} from '../components/ui';

type View = 'ALL' | 'ATTENTION' | 'OVERDUE' | 'PAID';

export function InvoicesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('ALL');
  const [search, setSearch] = useState('');
  const [vendor, setVendor] = useState('');
  const [sort, setSort] = useState('due');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [view, search, vendor, sort]);

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.get<{ items: Vendor[] }>('/api/vendors'),
  });

  const { data: stats } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: async () => {
      const [attention, overdue, paid] = await Promise.all([
        api.get<Paged<Invoice>>('/api/invoices?attention=true&pageSize=1'),
        api.get<Paged<Invoice>>('/api/invoices?status=OVERDUE&pageSize=1'),
        api.get<Paged<Invoice>>('/api/invoices?status=PAID&pageSize=1'),
      ]);
      return { attention: attention.total, overdue: overdue.total, paid: paid.total };
    },
  });

  const query = new URLSearchParams({ page: String(page), pageSize: '25', sort });
  if (view === 'ATTENTION') query.set('attention', 'true');
  else if (view !== 'ALL') query.set('status', view);
  if (vendor) query.set('vendor', vendor);
  if (search.trim()) query.set('q', search.trim());

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', query.toString()],
    queryFn: () => api.get<Paged<Invoice>>(`/api/invoices?${query.toString()}`),
  });

  const views: Array<{ key: View; label: string; count?: number }> = [
    { key: 'ALL', label: 'All invoices' },
    { key: 'ATTENTION', label: 'Needs attention', count: stats?.attention },
    { key: 'OVERDUE', label: 'Overdue', count: stats?.overdue },
    { key: 'PAID', label: 'Paid', count: stats?.paid },
  ];

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Vendor settlement · nominal integrity"
        title="Invoice register"
        subtitle="DPP + PPN, payment references and kuitansi totals checked for every vendor invoice before close."
        actions={
          <>
            <Link to="/imports" className="btn btn-secondary btn-sm">
              <FilePlus2 size={14} />
              <span>Import register</span>
            </Link>
            <Link to="/reports" className="btn btn-primary btn-sm">
              <ReceiptText size={14} />
              <span>Nominal accuracy</span>
            </Link>
          </>
        }
      />

      <div className="invoice-stats">
        <div className="invoice-stat">
          <span>Register</span>
          <strong>{formatNumber(data?.total ?? 0)}</strong>
          <small>invoices in scope</small>
        </div>
        <div className="invoice-stat is-warning">
          <span>Needs attention</span>
          <strong>{formatNumber(stats?.attention ?? 0)}</strong>
          <small>open checks or exceptions</small>
        </div>
        <div className="invoice-stat is-danger">
          <span>Past due</span>
          <strong>{formatNumber(stats?.overdue ?? 0)}</strong>
          <small>unsettled after due date</small>
        </div>
        <div className="invoice-stat is-success">
          <span>Paid</span>
          <strong>{formatNumber(stats?.paid ?? 0)}</strong>
          <small>matched to ledger</small>
        </div>
      </div>

      <Card padded={false}>
        <div className="segmented-row">
          <div className="segmented">
            {views.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`segmented-item ${view === item.key ? 'is-active' : ''}`}
                onClick={() => setView(item.key)}
              >
                {item.label}
                {item.count !== undefined && <span className="segmented-count">{item.count}</span>}
              </button>
            ))}
          </div>
          <div className="toolbar-filters">
            <div className="search-shell search-shell-sm">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Invoice, description or vendor…"
                aria-label="Search invoices"
              />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}
            </div>
            <select value={vendor} onChange={(event) => setVendor(event.target.value)} aria-label="Filter vendor">
              <option value="">All vendors</option>
              {(vendors?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort invoices">
              <option value="due">Due date</option>
              <option value="amount">Largest total</option>
              <option value="recent">Recently issued</option>
              <option value="exceptions">Most exceptions</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="queue-loading"><LoadingBlock rows={9} /></div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ReceiptText size={22} />}
            title="No invoices match these filters"
            message="Adjust the view or import an invoice register CSV."
            action={
              <Button variant="secondary" size="sm" onClick={() => { setView('ALL'); setVendor(''); setSearch(''); }}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table invoice-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Vendor</th>
                    <th>Due</th>
                    <th className="num">DPP</th>
                    <th className="num">PPN</th>
                    <th className="num">Total</th>
                    <th className="num">Kuitansi</th>
                    <th>Payment</th>
                    <th>Checks</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.items ?? []).map((invoice) => {
                    const receiptMismatch =
                      (invoice.receiptCount ?? 0) > 0 && Math.abs((invoice.receiptTotalMinor ?? 0) - invoice.totalMinor) > 0;
                    const hasIssue = (invoice.openExceptions ?? 0) > 0 || invoice.status === 'OVERDUE' || invoice.status === 'EXCEPTION';
                    return (
                      <tr key={invoice.id} onClick={() => navigate(`/invoices/${invoice.invoiceNumber}`)}>
                        <td>
                          <div className="cell-stack">
                            <span className="invoice-number">{invoice.invoiceNumber}</span>
                            <span className="cell-muted trunc">{invoice.description ?? 'No description'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="cell-strong">{invoice.vendorName}</span>
                          <span className="mono small block muted">{invoice.vendorCode}</span>
                        </td>
                        <td>
                          <span className={invoice.status === 'OVERDUE' ? 'text-danger' : ''}>{formatDate(invoice.dueDate)}</span>
                          <span className="small block muted">Issued {formatDate(invoice.issueDate)}</span>
                        </td>
                        <td className="num money">{formatMoney(invoice.subtotalMinor)}</td>
                        <td className="num money muted">{formatMoney(invoice.taxMinor)}</td>
                        <td className="num money strong">{formatMoney(invoice.totalMinor)}</td>
                        <td className="num">
                          {(invoice.receiptCount ?? 0) > 0 ? (
                            <>
                              <span className={`money ${receiptMismatch ? 'text-warning' : ''}`}>{formatMoney(invoice.receiptTotalMinor ?? 0)}</span>
                              <span className="small block muted">{invoice.receiptCount} kuitansi</span>
                            </>
                          ) : (
                            <span className="muted small">No kuitansi</span>
                          )}
                        </td>
                        <td>
                          <div className="cell-stack">
                            <StatusBadge status={invoice.status} />
                            {invoice.matchStatus && <span className="small muted">{invoice.matchStatus.toLowerCase()}</span>}
                          </div>
                        </td>
                        <td>
                          {hasIssue || invoice.openExceptions ? (
                            <span className="attention-pill">
                              <ShieldAlert size={13} />
                              {invoice.openExceptions ? `${invoice.openExceptions} open` : 'Review'}
                            </span>
                          ) : (
                            <Badge tone="success">Verified</Badge>
                          )}
                        </td>
                        <td className="num">
                          <Link to={`/invoices/${invoice.invoiceNumber}`} className="row-action" aria-label={`Open ${invoice.invoiceNumber}`}>
                            <ArrowUpRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
