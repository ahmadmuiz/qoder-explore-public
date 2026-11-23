import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  Clock,
  FileText,
  Paperclip,
  Plus,
  ShieldAlert,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import type { Attachment, InvoiceDetail } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingBlock,
  SeverityBadge,
  StatusBadge,
  TypeChip,
  useToast,
} from '../components/ui';
import { AttachmentViewer } from '../components/AttachmentViewer';

const CHECK_ICON = {
  pass: <CheckCircle2 size={17} className="text-success" />,
  fail: <XCircle size={17} className="text-danger" />,
  pending: <Clock size={17} className="text-muted" />,
  skipped: <CircleSlash size={17} className="text-muted" />,
};

const MAX_BYTES = 8 * 1024 * 1024;

function UploadDocumentModal({
  invoiceNumber,
  defaultAmount,
  onClose,
}: {
  invoiceNumber: string;
  defaultAmount: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<'RECEIPT' | 'INVOICE' | 'EVIDENCE'>('RECEIPT');
  const [declared, setDeclared] = useState(String(Math.round(defaultAmount / 100)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a PDF or image document.');
      if (file.size > MAX_BYTES) throw new Error('Documents are limited to 8 MB.');
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      form.append('invoiceNumber', invoiceNumber);
      if (declared.trim()) form.append('declaredAmount', declared.trim());
      return api.upload<{ attachment: Attachment; duplicate: boolean; runId: string | null }>('/api/attachments', form);
    },
    onSuccess: async (result) => {
      toast.push({
        title: result.duplicate ? 'Document already on file' : 'Document linked',
        message: result.duplicate
          ? 'The same SHA-256 fingerprint exists, so Laras reused the stored evidence.'
          : result.runId
            ? 'Kuitansi stored and reconciliation re-run with the declared nominal.'
            : 'The supporting document is now linked to this invoice.',
        tone: result.duplicate ? 'info' : 'success',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', invoiceNumber] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions'] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    },
    onError: (cause: Error) => setError(cause.message),
  });

  return createPortal(
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="Attach supporting document">
      <button type="button" className="modal-scrim" onClick={onClose} aria-label="Close" />
      <div className="modal-panel">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Evidence</div>
            <h2>Attach invoice document</h2>
            <p>Kuitansi, transfer proof or vendor invoice supporting {invoiceNumber}.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          <label className="dropzone">
            <UploadCloud size={22} />
            <strong>{file ? file.name : 'Choose a PDF, PNG, JPG, WEBP or SVG'}</strong>
            <span>{file ? `${(file.size / 1024).toFixed(0)} KB · ready to upload` : 'Documents are fingerprinted by SHA-256 and deduplicated.'}</span>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </label>
          <div className="modal-grid">
            <label className="field">
              <span className="field-label">Document type</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="RECEIPT">Kuitansi / vendor receipt</option>
                <option value="INVOICE">Invoice copy</option>
                <option value="EVIDENCE">Other evidence</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Declared nominal (IDR)</span>
              <input
                inputMode="numeric"
                value={declared}
                onChange={(event) => setDeclared(event.target.value.replace(/[^\d.,]/g, ''))}
                placeholder={String(Math.round(defaultAmount / 100))}
              />
              <span className="field-hint">Compared with the invoice total during reconciliation.</span>
            </label>
          </div>
          <p className="modal-note">
            A kuitansi with a declared nominal triggers an automatic reconciliation run so nominal variance surfaces immediately.
          </p>
          {error && <div className="form-error">{error}</div>}
        </div>
        <footer className="modal-foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={upload.isPending} disabled={!file} onClick={() => upload.mutate()} icon={<Plus size={15} />}>
            Attach document
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function InvoiceDetailPage() {
  const { invoiceNumber = '' } = useParams();
  const { can } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice', invoiceNumber],
    queryFn: () => api.get<InvoiceDetail>(`/api/invoices/${encodeURIComponent(invoiceNumber)}`),
    enabled: Boolean(invoiceNumber),
  });

  if (isLoading) return <LoadingBlock rows={9} />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={<FileText size={22} />}
        title="Invoice not found"
        message="The invoice number is not in the register."
        action={<Link to="/invoices" className="btn btn-secondary btn-sm">Back to register</Link>}
      />
    );
  }

  const { invoice, vendor, lines, match, receipts, attachments, exceptions, integrity, overdueDays } = data;
  const receiptTotal = receipts.reduce((sum, receipt) => sum + receipt.amountMinor, 0);
  const paid = match?.amountMinor ?? 0;
  const exposure = invoice.totalMinor - paid;
  const attention = integrity.status === 'ATTENTION';
  const attachmentById = new Map(attachments.map((item) => [item.id, item]));

  return (
    <div className="stack-lg">
      <Link to="/invoices" className="back-link"><ArrowLeft size={14} /> Invoice register</Link>

      <header className="invoice-head">
        <div>
          <div className="eyebrow">{vendor.code} · {vendor.category} · issued {formatDate(invoice.issueDate)}</div>
          <h1 className="invoice-title">{invoice.invoiceNumber}</h1>
          <p className="page-subtitle">{invoice.description ?? 'Vendor invoice settlement'}</p>
          <div className="invoice-head-tags">
            <StatusBadge status={invoice.status} />
            <Badge tone="neutral">{invoice.paymentRef ?? 'No payment ref'}</Badge>
            {overdueDays > 0 && <Badge tone="danger">{formatNumber(overdueDays)} days past due</Badge>}
            {attention ? (
              integrity.failing > 0 ? (
                <Badge tone="warning">{integrity.failing} failing check{integrity.failing === 1 ? '' : 's'}</Badge>
              ) : (
                <Badge tone="warning">{exceptions.length} open exception{exceptions.length === 1 ? '' : 's'}</Badge>
              )
            ) : (
              <Badge tone="success">Integrity verified</Badge>
            )}
          </div>
        </div>
        <div className="page-actions">
          <Link to={`/exceptions?q=${encodeURIComponent(invoice.invoiceNumber)}`} className="btn btn-secondary btn-sm">
            <ShieldAlert size={14} />
            <span>Exceptions</span>
          </Link>
          {can(['ANALYST', 'SUPERVISOR']) && (
            <Button size="sm" icon={<UploadCloud size={14} />} onClick={() => setUploadOpen(true)}>
              Attach kuitansi
            </Button>
          )}
        </div>
      </header>

      <div className="amount-band">
        <div className="amount-band-main">
          <span>Invoice total</span>
          <strong>{formatMoney(invoice.totalMinor, invoice.currency)}</strong>
          <small>DPP {formatMoney(invoice.subtotalMinor)} + PPN {formatMoney(invoice.taxMinor)}</small>
        </div>
        <div>
          <span>Ledger payment</span>
          <strong>{match ? formatMoney(paid) : 'Not matched'}</strong>
          <small>{match ? match.status : 'Awaiting settlement'}</small>
        </div>
        <div>
          <span>Kuitansi evidence</span>
          <strong>{receipts.length > 0 ? formatMoney(receiptTotal) : 'None yet'}</strong>
          <small>{receipts.length} receipt{receipts.length === 1 ? '' : 's'} · {attachments.length} document{attachments.length === 1 ? '' : 's'}</small>
        </div>
        <div className={exposure > 0 && match ? 'is-warning' : ''}>
          <span>Open exposure</span>
          <strong>{match ? formatMoney(exposure) : formatMoney(invoice.totalMinor)}</strong>
          <small>{match ? (exposure === 0 ? 'Settled in full' : 'Amount still unaccounted') : 'No payment recorded'}</small>
        </div>
      </div>

      <div className="detail-columns">
        <div className="detail-col-main">
          <Card>
            <CardHeader
              eyebrow="Nominal accuracy"
              title="Integrity checks"
              subtitle="DPP + PPN, line arithmetic, ledger payment and kuitansi totals."
              action={<Badge tone={attention ? 'warning' : 'success'}>{attention ? 'Attention' : 'Verified'}</Badge>}
            />
            <div className="check-list">
              {integrity.checks.map((check) => (
                <div key={check.key} className={`check-row check-${check.state}`}>
                  <span className="check-icon">{CHECK_ICON[check.state]}</span>
                  <div className="check-meta">
                    <strong>{check.label}</strong>
                    <span>
                      Expected {formatMoney(check.expectedMinor)} · Actual {formatMoney(check.actualMinor)}
                    </span>
                  </div>
                  <span className={`check-delta ${check.deltaMinor !== 0 ? 'is-off' : ''}`}>
                    {check.state === 'skipped' ? 'No data' : check.deltaMinor === 0 ? 'In balance' : `Δ ${formatMoney(check.deltaMinor)}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="formula-note">
              <span>DPP</span>
              <strong>{formatMoney(integrity.subtotalMinor)}</strong>
              <span>+ PPN</span>
              <strong>{formatMoney(integrity.taxMinor)}</strong>
              <span>=</span>
              <strong className={integrity.subtotalMinor + integrity.taxMinor !== integrity.totalMinor ? 'text-danger' : ''}>
                {formatMoney(integrity.subtotalMinor + integrity.taxMinor)}
              </strong>
              <span>vs stated</span>
              <strong>{formatMoney(integrity.totalMinor)}</strong>
            </div>
          </Card>

          <Card padded={false}>
            <div className="card-header-inline">
              <CardHeader
                eyebrow="Billing detail"
                title="Invoice lines"
                subtitle={`${lines.length} line${lines.length === 1 ? '' : 's'} · qty × unit price`}
                action={
                  <span className={`money ${integrity.lineTotalMinor !== integrity.subtotalMinor ? 'text-warning' : ''}`}>
                    {formatMoney(integrity.lineTotalMinor)}
                  </span>
                }
              />
            </div>
            {lines.length === 0 ? (
              <EmptyState title="No line detail" message="This invoice carries a header total only." />
            ) : (
              <div className="table-wrap">
                <table className="data-table compact line-table">
                  <thead>
                    <tr><th>#</th><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.lineNo}>
                        <td className="muted mono">{String(line.lineNo).padStart(2, '0')}</td>
                        <td>{line.description}</td>
                        <td className="num">{formatNumber(line.qty)}</td>
                        <td className="num money">{formatMoney(line.unitPriceMinor)}</td>
                        <td className="num money">{formatMoney(line.amountMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Line total vs stated subtotal</td>
                      <td className="num">
                        <span className="money">{formatMoney(integrity.lineTotalMinor)}</span>
                        <span className={`small block ${integrity.lineTotalMinor === integrity.subtotalMinor ? 'muted' : 'text-danger'}`}>
                          stated {formatMoney(integrity.subtotalMinor)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              eyebrow="Evidence"
              title="Kuitansi & supporting documents"
              subtitle={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'} · declared nominal compared to invoice total ${formatMoney(invoice.totalMinor)}`}
              action={
                can(['ANALYST', 'SUPERVISOR']) ? (
                  <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setUploadOpen(true)}>
                    Add document
                  </Button>
                ) : undefined
              }
            />
            <div className="receipt-summary">
              <div>
                <span>Kuitansi total</span>
                <strong>{formatMoney(receiptTotal)}</strong>
              </div>
              <div>
                <span>Invoice total</span>
                <strong>{formatMoney(invoice.totalMinor)}</strong>
              </div>
              <div className={receiptTotal !== invoice.totalMinor && receipts.length > 0 ? 'is-warning' : ''}>
                <span>Variance</span>
                <strong>{receipts.length === 0 ? 'No receipts' : formatMoney(receiptTotal - invoice.totalMinor)}</strong>
              </div>
            </div>
            {receipts.length === 0 ? (
              <EmptyState
                title="No kuitansi recorded"
                message="Upload the vendor receipt and declare its nominal so the engine can verify it."
                icon={<Paperclip size={20} />}
              />
            ) : (
              <div className="receipt-ledger">
                {receipts.map((receipt) => {
                  const attachment = receipt.attachmentId ? attachmentById.get(receipt.attachmentId) : undefined;
                  return (
                    <div className="receipt-ledger-row" key={receipt.id}>
                      <span className="receipt-ledger-icon"><FileText size={15} /></span>
                      <div>
                        <strong>{receipt.receiptNumber}</strong>
                        <span>{formatDate(receipt.receivedDate)} · {receipt.fileName ?? 'No file linked'}</span>
                      </div>
                      <span className="money">{formatMoney(receipt.amountMinor)}</span>
                      {attachment ? (
                        <Button variant="ghost" size="sm" icon={<Paperclip size={13} />} onClick={() => setPreview(attachment)}>View</Button>
                      ) : (
                        <span className="muted small">No file</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {attachments.length > 0 && (
              <>
                <h4 className="subhead">All attached documents</h4>
                <div className="attachment-grid">
                  {attachments.map((attachment) => (
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
              </>
            )}
          </Card>
        </div>

        <aside className="detail-col-side">
          <Card>
            <CardHeader eyebrow="Match ID × amount" title="Payment match" subtitle="Ledger evidence against this invoice." />
            {match ? (
              <div className="match-card">
                <div className="match-status">
                  <StatusBadge status={match.status} />
                  <span>{match.confidence}% confidence</span>
                </div>
                <dl>
                  <div><dt>Transaction</dt><dd className="mono">{match.transactionId}</dd></div>
                  <div><dt>Value date</dt><dd>{formatDate(match.valueDate ?? '')}</dd></div>
                  <div><dt>Amount</dt><dd className="money">{formatMoney(match.amountMinor ?? 0)}</dd></div>
                  <div><dt>Delta</dt><dd className={match.deltaMinor !== 0 ? 'text-warning money' : 'money'}>{formatMoney(match.deltaMinor)}</dd></div>
                  <div><dt>Account</dt><dd className="mono">{match.accountMask}</dd></div>
                  <div><dt>Channel</dt><dd>{match.channel}</dd></div>
                </dl>
                {match.ledgerDescription && <p className="match-description">{match.ledgerDescription}</p>}
                <Link to={`/ledger?q=${encodeURIComponent(match.transactionId ?? '')}`} className="text-link">View ledger row <ArrowUpRight size={12} /></Link>
              </div>
            ) : (
              <EmptyState
                title="No payment matched"
                message="The reconciliation engine has not allocated a ledger transfer to this invoice."
                icon={<CircleSlash size={20} />}
              />
            )}
          </Card>

          <Card>
            <CardHeader eyebrow="Vendor" title={vendor.name} subtitle={`${vendor.code} · ${vendor.category}`} />
            <dl className="side-dl">
              <div><dt>Bank</dt><dd>{vendor.bankName}</dd></div>
              <div><dt>Account</dt><dd className="mono">{vendor.accountMask}</dd></div>
              <div><dt>Payment ref</dt><dd className="mono">{invoice.paymentRef ?? '—'}</dd></div>
              <div><dt>Due date</dt><dd>{formatDate(invoice.dueDate)}</dd></div>
              <div><dt>Overdue</dt><dd>{overdueDays > 0 ? `${overdueDays} days` : 'No'}</dd></div>
            </dl>
          </Card>

          <Card padded={false}>
            <div className="card-header-inline">
              <CardHeader
                eyebrow="Checks"
                title="Exceptions"
                subtitle={exceptions.length > 0 ? `${exceptions.filter((item) => item.status !== 'RESOLVED').length} open on this invoice` : 'No open exceptions'}
                action={<Badge tone={exceptions.some((item) => item.status !== 'RESOLVED') ? 'warning' : 'success'}>{exceptions.length}</Badge>}
              />
            </div>
            {exceptions.length === 0 ? (
              <EmptyState title="Clean invoice" message="No exception is linked to this invoice." icon={<CheckCircle2 size={20} />} />
            ) : (
              <div className="side-exception-list">
                {exceptions.map((item) => (
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
            )}
          </Card>

          <div className="side-note">
            <ShieldAlert size={16} />
            <p>Payment release is blocked while nominal checks fail. Resolve the exception with evidence before close.</p>
          </div>
        </aside>
      </div>

      {uploadOpen && (
        <UploadDocumentModal
          invoiceNumber={invoice.invoiceNumber}
          defaultAmount={invoice.totalMinor}
          onClose={() => setUploadOpen(false)}
        />
      )}
      {preview && <AttachmentViewer attachment={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
