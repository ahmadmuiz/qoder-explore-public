import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Inbox,
  Paperclip,
  RefreshCcw,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatNumber,
  RESOLUTION_LABELS,
  timeAgo,
  TYPE_SHORT,
} from '../lib/format';
import type {
  Attachment,
  ExceptionDetailResponse,
  ExceptionItem,
  ExceptionSummary,
  ExceptionType,
  Paged,
  ReceiptRow,
  Severity,
} from '../lib/types';
import { PageHeader } from '../components/Shell';
import { AttachmentViewer } from '../components/AttachmentViewer';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  LoadingBlock,
  Pagination,
  SeverityBadge,
  StatusBadge,
  TypeChip,
  useToast,
} from '../components/ui';

const TYPE_OPTIONS: ExceptionType[] = [
  'DUPLICATE_PAYMENT',
  'AMOUNT_MISMATCH',
  'MISSING_PAYMENT',
  'UNALLOCATED_PAYMENT',
  'NOMINAL_VARIANCE',
  'ORPHAN_RECEIPT',
  'DUPLICATE_RECEIPT',
];

const SEVERITY_OPTIONS: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const RESOLUTION_OPTIONS = [
  'CONFIRMED_DUPLICATE',
  'REFUND_INITIATED',
  'ADJUSTED',
  'EVIDENCE_ACCEPTED',
  'WRITTEN_OFF',
  'FALSE_POSITIVE',
  'ESCALATED',
] as const;

const MONEY_KEYS = /Minor$/;

function humanize(key: string): string {
  return key
    .replace(/Minor$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function DetailValue({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  const isMoney = MONEY_KEYS.test(label.replace(/\s/g, '')) || /amount|total|nominal|delta|subtotal|tax|receipt/i.test(label);
  const rendered =
    isMoney && typeof value === 'number'
      ? formatMoney(value)
      : typeof value === 'number'
        ? formatNumber(value)
        : String(value);
  return (
    <div className="detail-cell">
      <span>{label}</span>
      <strong className={isMoney ? 'money' : ''}>{rendered}</strong>
    </div>
  );
}

function ReceiptList({ receipts, attachments }: { receipts: ReceiptRow[]; attachments: Attachment[] }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (receipts.length === 0) return <p className="muted small">No kuitansi recorded for this invoice.</p>;
  return (
    <div className="receipt-list">
      {receipts.map((receipt) => {
        const attachment = receipt.attachmentId ? attachments.find((item) => item.id === receipt.attachmentId) : undefined;
        return (
          <div className="receipt-row" key={receipt.id}>
            <div className="receipt-icon"><FileText size={15} /></div>
            <div className="receipt-meta">
              <strong>{receipt.receiptNumber}</strong>
              <span>{formatDate(receipt.receivedDate)} · kuitansi</span>
            </div>
            <span className="money">{formatMoney(receipt.amountMinor, receipt.currency)}</span>
            {attachment ? (
              <Button variant="ghost" size="sm" icon={<Paperclip size={13} />} onClick={() => setPreview(attachment)}>
                View
              </Button>
            ) : (
              <span className="muted small">No file</span>
            )}
          </div>
        );
      })}
      {preview && <AttachmentViewer attachment={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ExceptionDrawer({
  caseId,
  onClose,
  onNavigate,
  position,
  total,
}: {
  caseId: string;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
  position: number;
  total: number;
}) {
  const { user, can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [resolutionCode, setResolutionCode] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Attachment | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['exception', caseId],
    queryFn: () => api.get<ExceptionDetailResponse>(`/api/exceptions/${caseId}`),
  });

  useEffect(() => {
    setResolutionCode('');
    setNote('');
    setPreview(null);
  }, [caseId]);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<{ ok: boolean }>(`/api/exceptions/${caseId}`, body),
    onSuccess: async (_result, variables) => {
      const status = String(variables.status ?? 'UPDATED');
      toast.push({ title: status === 'RESOLVED' ? 'Exception resolved' : 'Exception updated', message: 'The audit trail has been updated.', tone: 'success' });
      setResolutionCode('');
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exception', caseId] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions'] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error: Error) => toast.push({ title: 'Update failed', message: error.message, tone: 'error' }),
  });

  const exception = data?.exception;
  const detail = data?.detail ?? {};
  const invoice = data?.invoice;
  const editable = can(['ANALYST', 'SUPERVISOR']);
  const status = exception?.status ?? 'OPEN';

  const evidencePairs = useMemo(
    () =>
      Object.entries(detail)
        .filter(([key]) => !['reason', 'guidance'].includes(key))
        .map(([key, value]) => [humanize(key), value] as const),
    [detail],
  );

  const guidance = typeof detail.guidance === 'string' ? detail.guidance : null;
  const reason = typeof detail.reason === 'string' ? detail.reason : null;

  return (
    <Drawer open onClose={onClose} width={760} label="Exception detail">
      {isLoading || !exception ? (
        <div className="drawer-loading"><LoadingBlock rows={8} /></div>
      ) : (
        <div className="exception-drawer">
          <div className="drawer-nav">
            <span>Case {position > 0 ? position : '—'} of {total || '—'}</span>
            <div>
              <button type="button" className="icon-btn" onClick={() => onNavigate(-1)} aria-label="Previous case">
                <ArrowLeft size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => onNavigate(1)} aria-label="Next case">
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          <header className="case-head">
            <div className="case-tags">
              <TypeChip type={exception.type} />
              <SeverityBadge severity={exception.severity} />
              <StatusBadge status={exception.status} />
            </div>
            <h2>{exception.title}</h2>
            <div className="case-subline">
              <span className="mono">{exception.id}</span>
              <span>·</span>
              <span>{data.vendor?.name ?? 'Vendor unavailable'}</span>
              {data.assignee && <><span>·</span><span>Assigned to {data.assignee.name}</span></>}
              <span>·</span>
              <span>Opened {timeAgo(exception.createdAt)}</span>
            </div>
            <div className="case-amount-band">
              <div>
                <span>Exception amount</span>
                <strong>{formatMoney(exception.amountMinor, exception.currency)}</strong>
              </div>
              <div>
                <span>Nominal delta</span>
                <strong className={exception.deltaMinor !== 0 ? 'text-danger' : ''}>
                  {exception.deltaMinor === 0 ? '—' : formatMoney(exception.deltaMinor, exception.currency)}
                </strong>
              </div>
              <div>
                <span>Transaction reference</span>
                <strong className="mono">{exception.transactionRef ?? 'No ledger ref'}</strong>
              </div>
              <div>
                <span>Invoice</span>
                {invoice ? (
                  <Link to={`/invoices/${invoice.invoiceNumber}`} className="case-invoice-link">
                    {invoice.invoiceNumber} <ArrowUpRight size={12} />
                  </Link>
                ) : (
                  <strong>{exception.invoiceNumber ?? '—'}</strong>
                )}
              </div>
            </div>
          </header>

          {(reason || guidance) && (
            <section className={`case-callout ${exception.severity === 'CRITICAL' ? 'is-critical' : ''}`}>
              <div className="case-callout-icon"><Filter size={16} /></div>
              <div>
                {reason && <strong>{reason}</strong>}
                {guidance && <p>{guidance}</p>}
              </div>
            </section>
          )}

          {evidencePairs.length > 0 && (
            <section className="case-section">
              <h3>Evidence values</h3>
              <div className="detail-grid">
                {evidencePairs.map(([key, value]) => (
                  <DetailValue key={key} label={key} value={value} />
                ))}
              </div>
            </section>
          )}

          <section className="case-section">
            <h3>Ledger evidence</h3>
            {(data.evidenceLedger.length > 0 || data.relatedLedger.length > 0) ? (
              <div className="table-wrap">
                <table className="data-table compact">
                  <thead>
                    <tr><th>Transaction</th><th>Value date</th><th>Account / channel</th><th className="num">Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {[...data.evidenceLedger, ...data.relatedLedger]
                      .filter((row, index, rows) => rows.findIndex((item) => item.id === row.id) === index)
                      .map((row) => (
                        <tr key={row.id}>
                          <td className="mono small">{row.transactionId}</td>
                          <td>{formatDate(row.valueDate)}</td>
                          <td><span className="mono small">{row.accountMask}</span><span className="cell-muted block">{row.channel}</span></td>
                          <td className="num money">{formatMoney(row.amountMinor)}</td>
                          <td><StatusBadge status={row.status} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">No ledger row is attached to this exception. The engine detected it from the invoice or receipt register.</p>
            )}
          </section>

          {invoice && (
            <section className="case-section">
              <div className="section-head">
                <h3>Invoice & kuitansi</h3>
                <Link to={`/invoices/${invoice.invoiceNumber}`} className="text-link">Open invoice <ArrowUpRight size={12} /></Link>
              </div>
              <div className="invoice-snapshot">
                <div>
                  <span>Invoice total</span>
                  <strong>{formatMoney(invoice.totalMinor, invoice.currency)}</strong>
                </div>
                <div>
                  <span>DPP + PPN</span>
                  <strong>{formatMoney(invoice.subtotalMinor + invoice.taxMinor, invoice.currency)}</strong>
                </div>
                <div>
                  <span>Kuitansi total</span>
                  <strong>{formatMoney(invoice.receipts.reduce((sum, receipt) => sum + receipt.amountMinor, 0), invoice.currency)}</strong>
                </div>
                <div>
                  <span>Due date</span>
                  <strong>{formatDate(invoice.dueDate)}</strong>
                </div>
              </div>
              {invoice.match && (
                <div className="match-strip">
                  <StatusBadge status={invoice.match.status} />
                  <span className="mono">{invoice.match.transactionId}</span>
                  <span>{formatMoney(invoice.match.amountMinor ?? 0)}</span>
                  <span>delta {formatMoney(invoice.match.deltaMinor)}</span>
                  <span>{invoice.match.channel}</span>
                  <span>{formatDate(invoice.match.valueDate ?? '')}</span>
                </div>
              )}
              <ReceiptList receipts={invoice.receipts} attachments={data.attachments} />
            </section>
          )}

          {data.suggestions.length > 0 && (
            <section className="case-section">
              <h3>{exception.type === 'MISSING_PAYMENT' ? 'Candidate ledger matches' : 'Candidate invoices'}</h3>
              <p className="section-hint">
                {exception.type === 'MISSING_PAYMENT'
                  ? 'Transfers near the invoice amount and due date. Confirm the reference before allocating.'
                  : 'Invoices with a similar nominal. Allocate only after confirming the vendor and reference.'}
              </p>
              <div className="suggestion-list">
                {data.suggestions.map((suggestion, index) => {
                  const ref = String(suggestion.transactionId ?? suggestion.invoiceNumber ?? `candidate-${index}`);
                  return (
                    <div className="suggestion-row" key={ref}>
                      <span className="suggestion-score">{Number(suggestion.score ?? 0)}</span>
                      <div className="suggestion-meta">
                        <strong className="mono">{ref}</strong>
                        <span>{String(suggestion.vendorName ?? 'Unknown vendor')} · {formatDate(String(suggestion.valueDate ?? suggestion.dueDate ?? ''))}</span>
                      </div>
                      <div className="suggestion-amount">
                        <span className="money">{formatMoney(Number(suggestion.amountMinor ?? 0))}</span>
                        <small>diff {formatMoney(Number(suggestion.amountDiff ?? 0))}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="case-section">
            <div className="section-head">
              <h3>Attachments</h3>
              <Badge tone="neutral">{data.attachments.length}</Badge>
            </div>
            {data.attachments.length === 0 ? (
              <p className="muted small">No supporting document is linked yet. Upload a kuitansi from any invoice page.</p>
            ) : (
              <div className="attachment-grid">
                {data.attachments.map((attachment) => (
                  <button type="button" key={attachment.id} className="attachment-card" onClick={() => setPreview(attachment)}>
                    <span className={`attachment-icon kind-${attachment.kind.toLowerCase()}`}><Paperclip size={15} /></span>
                    <span className="attachment-meta">
                      <strong>{attachment.fileName}</strong>
                      <span>{attachment.kind} · {attachment.declaredAmountMinor !== null ? formatMoney(attachment.declaredAmountMinor) : 'No nominal'}</span>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="case-section">
            <h3>Audit history</h3>
            {data.history.length === 0 ? (
              <p className="muted small">No actions recorded yet.</p>
            ) : (
              <ol className="timeline">
                {data.history.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{event.summary}</strong>
                      <span>{event.actorName} · {formatDate(event.at, { time: true })}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {editable ? (
            <section className="case-action-panel">
              <div className="action-panel-head">
                <h3>Disposition</h3>
                <div className="action-panel-tools">
                  {exception.assigneeId !== user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UserCheck size={14} />}
                      loading={patch.isPending}
                      onClick={() => patch.mutate({ assigneeId: user?.id, status: status === 'OPEN' ? 'IN_REVIEW' : status })}
                    >
                      Assign to me
                    </Button>
                  )}
                  {exception.assigneeId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={patch.isPending}
                      onClick={() => patch.mutate({ assigneeId: null })}
                    >
                      Unassign
                    </Button>
                  )}
                </div>
              </div>

              {status === 'OPEN' && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={patch.isPending}
                  onClick={() => patch.mutate({ status: 'IN_REVIEW' })}
                >
                  Start review
                </Button>
              )}

              {status !== 'RESOLVED' && status !== 'IGNORED' ? (
                <>
                  <label className="field">
                    <span className="field-label">Resolution code</span>
                    <select value={resolutionCode} onChange={(event) => setResolutionCode(event.target.value)}>
                      <option value="">Choose a disposition…</option>
                      {RESOLUTION_OPTIONS.map((code) => (
                        <option key={code} value={code}>{RESOLUTION_LABELS[code]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Resolution note</span>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Summarise the check performed, evidence reviewed and next step (min. 8 characters)."
                    />
                    <span className="field-hint">{note.trim().length}/8 minimum characters</span>
                  </label>
                  <div className="action-panel-buttons">
                    <Button
                      loading={patch.isPending}
                      disabled={!resolutionCode || note.trim().length < 8}
                      onClick={() => patch.mutate({ status: 'RESOLVED', resolutionCode, note })}
                    >
                      Resolve exception
                    </Button>
                    <Button
                      variant="ghost"
                      loading={patch.isPending}
                      disabled={note.trim().length < 8}
                      onClick={() => patch.mutate({ status: 'IGNORED', note })}
                    >
                      Ignore with note
                    </Button>
                  </div>
                  <p className="action-hint">
                    Write-offs and adjustments above the approval threshold require a supervisor. Every disposition is
                    written to the audit trail.
                  </p>
                </>
              ) : (
                <div className="resolved-summary">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>{status === 'RESOLVED' ? 'Resolved' : 'Ignored'}</strong>
                    <span>{exception.resolutionCode ? RESOLUTION_LABELS[exception.resolutionCode] ?? exception.resolutionCode : 'No code recorded'} · {formatDate(exception.resolvedAt ?? exception.updatedAt, { time: true })}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={patch.isPending}
                    onClick={() => patch.mutate({ status: 'OPEN', note: note || 'Reopened after additional review.' })}
                  >
                    Reopen
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <section className="readonly-banner">
              <Inbox size={16} />
              <span>Auditor access is read-only. Dispositions are performed by payment operations.</span>
            </section>
          )}
        </div>
      )}
      {preview && <AttachmentViewer attachment={preview} onClose={() => setPreview(null)} />}
    </Drawer>
  );
}

export function ExceptionsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const caseId = params.get('case');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [assignee, setAssignee] = useState<'ALL' | 'UNASSIGNED' | 'ME'>('ALL');
  const [status, setStatus] = useState<'ACTIVE' | 'ALL' | 'RESOLVED'>('ACTIVE');
  const [sort, setSort] = useState('risk');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { can, user } = useAuth();

  const { data: summary } = useQuery({
    queryKey: ['exceptions-summary'],
    queryFn: () => api.get<ExceptionSummary>('/api/exceptions/summary'),
  });

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('pageSize', '25');
  query.set('status', status);
  query.set('sort', sort);
  if (type) query.set('type', type);
  if (severity) query.set('severity', severity);
  if (assignee === 'UNASSIGNED') query.set('assignee', 'unassigned');
  if (assignee === 'ME') query.set('assignee', 'me');
  if (search.trim()) query.set('q', search.trim());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['exceptions', query.toString()],
    queryFn: () => api.get<Paged<ExceptionItem>>(`/api/exceptions?${query.toString()}`),
  });

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [type, severity, assignee, status, sort, search]);

  const items = data?.items ?? [];
  const position = caseId ? items.findIndex((item) => item.id === caseId) + 1 : 0;

  const bulkAssign = useMutation({
    mutationFn: (ids: string[]) => api.post<{ updated: number }>('/api/exceptions/bulk-assign', { ids, assigneeId: user?.id }),
    onSuccess: async (result) => {
      toast.push({ title: `${result.updated} case(s) assigned`, message: 'Moved to in review and assigned to you.', tone: 'success' });
      setSelected(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exceptions'] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (error: Error) => toast.push({ title: 'Assignment failed', message: error.message, tone: 'error' }),
  });

  function setParam(next: { case?: string | null }) {
    const updated = new URLSearchParams(params);
    if (next.case === null) updated.delete('case');
    else if (next.case) updated.set('case', next.case);
    setParams(updated, { replace: true });
  }

  function navigateCase(direction: -1 | 1) {
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.id === caseId);
    const current = index === -1 ? 0 : index;
    const next = (current + direction + items.length) % items.length;
    setParam({ case: items[next]!.id });
  }

  async function exportCsv() {
    try {
      await downloadFile('/api/reports/exceptions.csv', 'laras-exceptions.csv');
      toast.push({ title: 'Exception register exported', tone: 'success' });
    } catch (cause) {
      toast.push({ title: 'Export failed', message: cause instanceof Error ? cause.message : 'Try again.', tone: 'error' });
    }
  }

  const typeCounts = new Map((summary?.types ?? []).map((item) => [item.type, item.open + item.inReview]));
  const totalActive = summary ? summary.totals.open + summary.totals.inReview : 0;
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Manual checks · exceptions need a disposition"
        title="Exception queue"
        subtitle="Duplicates, mismatches and missing settlements, ranked by exposure with the evidence needed to close them."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportCsv}>
              Export register
            </Button>
            <Button variant="ghost" size="sm" icon={<RefreshCcw size={14} className={isFetching ? 'spin' : ''} />} onClick={() => refetch()}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="queue-summary">
        <div className="queue-summary-total">
          <span>Active queue</span>
          <strong>{formatNumber(totalActive)}</strong>
          <small>{formatCompactMoney(summary?.totals.valueMinor ?? 0)} exposure · {summary?.totals.assigned ?? 0} assigned</small>
        </div>
        <div className="queue-type-chips">
          <button type="button" className={`summary-chip ${type === '' ? 'is-active' : ''}`} onClick={() => setType('')}>
            <span>All types</span>
            <strong>{formatNumber(totalActive)}</strong>
          </button>
          {TYPE_OPTIONS.map((option) => (
            <button
              type="button"
              key={option}
              className={`summary-chip type-chip-${option.toLowerCase()} ${type === option ? 'is-active' : ''}`}
              onClick={() => setType(type === option ? '' : option)}
            >
              <span>{TYPE_SHORT[option]}</span>
              <strong>{formatNumber(typeCounts.get(option) ?? 0)}</strong>
            </button>
          ))}
        </div>
      </div>

      <Card padded={false}>
        <div className="queue-toolbar">
          <div className="search-shell">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, invoice or transaction ref…"
              aria-label="Search exceptions"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>
            )}
          </div>
          <div className="toolbar-filters">
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter severity">
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select
              value={assignee}
              onChange={(event) => setAssignee(event.target.value as 'ALL' | 'UNASSIGNED' | 'ME')}
              aria-label="Filter assignee"
            >
              <option value="ALL">All assignees</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="ME">Assigned to me</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter status">
              <option value="ACTIVE">Active cases</option>
              <option value="ALL">All statuses</option>
              <option value="RESOLVED">Resolved</option>
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort exceptions">
              <option value="risk">Risk first</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount">Largest amount</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
        </div>

        {can(['ANALYST', 'SUPERVISOR']) && selected.size > 0 && (
          <div className="bulk-bar">
            <span>{selected.size} selected</span>
            <div>
              <Button size="sm" icon={<UserCheck size={14} />} loading={bulkAssign.isPending} onClick={() => bulkAssign.mutate([...selected])}>
                Assign to me
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="queue-loading"><LoadingBlock rows={8} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="No exceptions match these filters"
            message="Clear the filters or run reconciliation to refresh the queue."
            action={<Button variant="secondary" size="sm" onClick={() => { setType(''); setSeverity(''); setAssignee('ALL'); setSearch(''); setStatus('ACTIVE'); }}>Reset filters</Button>}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table exception-table">
                <thead>
                  <tr>
                    {can(['ANALYST', 'SUPERVISOR']) && (
                      <th className="check-col">
                        <Checkbox
                          checked={allSelected}
                          onChange={(checked) =>
                            setSelected(checked ? new Set(items.map((item) => item.id)) : new Set())
                          }
                        />
                      </th>
                    )}
                    <th>Exception</th>
                    <th>Vendor</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                    <th>Owner</th>
                    <th>Age</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`${caseId === item.id ? 'is-active' : ''} ${selected.has(item.id) ? 'is-selected' : ''}`}
                      onClick={() => setParam({ case: item.id })}
                    >
                      {can(['ANALYST', 'SUPERVISOR']) && (
                        <td className="check-col" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(item.id)}
                            onChange={(checked) => {
                              setSelected((current) => {
                                const next = new Set(current);
                                if (checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                      )}
                      <td>
                        <div className="cell-stack">
                          <div className="cell-inline">
                            <TypeChip type={item.type} />
                            <SeverityBadge severity={item.severity} showLabel={false} />
                            {item.status === 'IN_REVIEW' && <StatusBadge status={item.status} />}
                          </div>
                          <span className="cell-title">{item.title}</span>
                        </div>
                      </td>
                      <td>
                        <span className="cell-muted">{item.vendorName ?? '—'}</span>
                        <span className="mono small block">{item.vendorCode ?? ''}</span>
                      </td>
                      <td>
                        <span className="mono small">{item.invoiceNumber ?? '—'}</span>
                        <span className="mono small block muted">{item.transactionRef ?? ''}</span>
                      </td>
                      <td className="num">
                        <span className="money">{formatMoney(item.amountMinor, item.currency)}</span>
                        {item.deltaMinor !== 0 && <span className="delta small block">Δ {formatMoney(item.deltaMinor, item.currency)}</span>}
                      </td>
                      <td className="cell-muted">{item.assigneeName ?? <span className="unassigned">Unassigned</span>}</td>
                      <td className="cell-muted">{timeAgo(item.createdAt)}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="row-action"
                          onClick={(event) => { event.stopPropagation(); setParam({ case: item.id }); }}
                          aria-label={`Open ${item.title}`}
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

      {caseId && (
        <ExceptionDrawer
          caseId={caseId}
          onClose={() => setParam({ case: null })}
          onNavigate={navigateCase}
          position={position}
          total={items.length}
        />
      )}
    </div>
  );
}
