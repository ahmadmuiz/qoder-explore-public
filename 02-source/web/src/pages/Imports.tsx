import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  RefreshCcw,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatNumber, formatPercent, timeAgo } from '../lib/format';
import type { ImportBatch, ImportPreview, SampleFile } from '../lib/types';
import { PageHeader } from '../components/Shell';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingBlock,
  StatusBadge,
  useToast,
} from '../components/ui';

type Source = 'LEDGER' | 'INVOICE' | 'RECEIPT';

const SOURCE_META: Record<Source, { label: string; blurb: string; file: string }> = {
  LEDGER: {
    label: 'Bank statement',
    blurb: 'Incoming transfers with transaction ID, amount, value date and payment reference.',
    file: 'ledger_q4_2026.csv',
  },
  INVOICE: {
    label: 'Invoice register',
    blurb: 'Vendor invoices with DPP, PPN, total, payment reference and due date.',
    file: 'invoice_register_q4_2026.csv',
  },
  RECEIPT: {
    label: 'Kuitansi register',
    blurb: 'Vendor receipts with receipt number, invoice reference and nominal.',
    file: 'receipts_q4_2026.csv',
  },
};

interface ImportOutcomeResponse {
  batchId: string;
  status: 'COMPLETED' | 'DUPLICATE_FILE' | 'REJECTED';
  summary: { rowCount: number; valid: number; duplicates: number; invalid: number };
  duplicateFile: boolean;
  runId: string | null;
  message: string;
  run: {
    exactMatches?: number;
    exceptionsOpen?: number;
    autoCleared?: number;
    matchedRate?: number;
  } | null;
}

export function ImportsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>('LEDGER');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcomeResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    setPreview(null);
    setOutcome(null);
  }, [source]);

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () =>
      api.get<{ items: ImportBatch[]; stats: { batches: number; rows: number; skipped: number; lastAt: string | null } }>(
        '/api/imports?pageSize=40',
      ),
  });

  const { data: samples } = useQuery({
    queryKey: ['import-samples'],
    queryFn: () => api.get<{ items: SampleFile[] }>('/api/imports/samples'),
  });

  function pickFile(next: File | null) {
    if (!next) return;
    if (!/\.csv$/i.test(next.name) && next.type !== 'text/csv') {
      toast.push({ title: 'Unsupported file', message: 'Upload a CSV bank statement.', tone: 'error' });
      return;
    }
    if (next.size > 8 * 1024 * 1024) {
      toast.push({ title: 'File too large', message: 'Imports are limited to 8 MB.', tone: 'error' });
      return;
    }
    setPreview(null);
    setOutcome(null);
    setFile(next);
  }

  const buildUpload = () => {
    if (!file) throw new Error('Choose a CSV file first.');
    const form = new FormData();
    form.append('source', source);
    form.append('file', file);
    return form;
  };

  const runPreview = useMutation<ImportPreview>({
    mutationFn: () => api.upload<ImportPreview>('/api/imports/preview', buildUpload()),
    onSuccess: (result) => setPreview(result),
    onError: (error: Error) => toast.push({ title: 'Preview failed', message: error.message, tone: 'error' }),
  });

  const commit = useMutation<ImportOutcomeResponse>({
    mutationFn: () => api.upload<ImportOutcomeResponse>('/api/imports/commit', buildUpload()),
    onSuccess: async (result) => {
      setOutcome(result);
      setPreview(null);
      if (result.status === 'COMPLETED') {
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
      }
      toast.push({
        title:
          result.status === 'DUPLICATE_FILE'
            ? 'Already imported — no rows added'
            : result.status === 'COMPLETED'
              ? 'Import committed'
              : 'Import rejected',
        message: result.message,
        tone: result.status === 'COMPLETED' ? 'success' : result.status === 'DUPLICATE_FILE' ? 'info' : 'error',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions'] }),
        queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['runs'] }),
      ]);
    },
    onError: (error: Error) => toast.push({ title: 'Commit failed', message: error.message, tone: 'error' }),
  });

  async function download(path: string, name: string) {
    try {
      await downloadFile(path, name);
    } catch (cause) {
      toast.push({ title: 'Download failed', message: cause instanceof Error ? cause.message : 'Try again.', tone: 'error' });
    }
  }

  const stats = batches?.stats;
  const meta = SOURCE_META[source];

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Idempotent ingestion · checksum + row hash"
        title="Reconciliation imports"
        subtitle="Bring in bank statements, invoice registers and kuitansi. Re-importing the same CSV never adds duplicate rows."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => download(`/api/imports/templates/${source}`, `laras-${source.toLowerCase()}-template.csv`)}
          >
            Download template
          </Button>
        }
      />

      <div className="import-stats">
        <div><span>Batches</span><strong>{formatNumber(stats?.batches ?? 0)}</strong></div>
        <div><span>Rows inserted</span><strong>{formatNumber(stats?.rows ?? 0)}</strong></div>
        <div className="is-mint"><span>Duplicate rows skipped</span><strong>{formatNumber(stats?.skipped ?? 0)}</strong></div>
        <div><span>Last import</span><strong>{stats?.lastAt ? timeAgo(stats.lastAt) : 'Never'}</strong></div>
      </div>

      <div className="import-layout">
        <Card>
          <CardHeader
            eyebrow="Step 1 · select source"
            title="Import a CSV"
            subtitle={meta.blurb}
          />
          <div className="source-tabs">
            {(Object.keys(SOURCE_META) as Source[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`source-tab ${source === key ? 'is-active' : ''}`}
                onClick={() => setSource(key)}
              >
                <FileSpreadsheet size={16} />
                <span>
                  <strong>{SOURCE_META[key].label}</strong>
                  <small>{key}</small>
                </span>
              </button>
            ))}
          </div>

          {!can(['ANALYST', 'SUPERVISOR']) ? (
            <div className="readonly-banner">
              <ShieldCheck size={16} />
              <span>Auditors can review batches but cannot import data. Sign in as an analyst to commit files.</span>
            </div>
          ) : (
            <>
              <label
                className={`upload-drop ${dragActive ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  pickFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <span className="upload-file-icon"><FileSpreadsheet size={22} /></span>
                    <strong>{file.name}</strong>
                    <span>{(file.size / 1024).toFixed(1)} KB · {source} source · ready to validate</span>
                    <button
                      type="button"
                      className="upload-clear"
                      onClick={(event) => {
                        event.preventDefault();
                        setFile(null);
                        setPreview(null);
                        setOutcome(null);
                        if (fileInput.current) fileInput.current.value = '';
                      }}
                      aria-label="Remove file"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <UploadCloud size={24} />
                    <strong>Drop a CSV here, or browse</strong>
                    <span>UTF-8 CSV · max 8 MB · Indonesian headers such as nominal, tanggal and no_invoice are recognised.</span>
                  </>
                )}
              </label>

              <div className="import-actions">
                <Button
                  variant="secondary"
                  icon={<RefreshCcw size={14} />}
                  loading={runPreview.isPending}
                  disabled={!file}
                  onClick={() => runPreview.mutate()}
                >
                  Validate file
                </Button>
                <Button
                  icon={<ArrowRight size={14} />}
                  loading={commit.isPending}
                  disabled={!file || !preview || (preview.summary.valid === 0 && !preview.duplicateFile)}
                  onClick={() => commit.mutate()}
                >
                  {preview?.duplicateFile ? 'Record duplicate attempt' : `Commit ${preview ? formatNumber(preview.summary.valid) : ''} rows`}
                </Button>
              </div>
            </>
          )}

          {outcome && (
            <div className={`import-outcome outcome-${outcome.status.toLowerCase()}`}>
              <div className="outcome-icon">
                {outcome.status === 'COMPLETED' ? <CheckCircle2 size={20} /> : outcome.status === 'DUPLICATE_FILE' ? <ShieldCheck size={20} /> : <FileWarning size={20} />}
              </div>
              <div>
                <strong>
                  {outcome.status === 'DUPLICATE_FILE'
                    ? 'This exact file is already reconciled'
                    : outcome.status === 'COMPLETED'
                      ? 'Import committed'
                      : 'File rejected'}
                </strong>
                <p>{outcome.message}</p>
                <div className="outcome-meta">
                  <span>{formatNumber(outcome.summary.rowCount)} rows read</span>
                  <span>{formatNumber(outcome.summary.valid)} valid</span>
                  <span>{formatNumber(outcome.summary.duplicates)} duplicates</span>
                  <span>{formatNumber(outcome.summary.invalid)} invalid</span>
                  {outcome.run?.autoCleared ? <span className="text-success">{outcome.run.autoCleared} auto-cleared</span> : null}
                  {outcome.run?.matchedRate !== undefined ? <span>{formatPercent(outcome.run.matchedRate)} coverage</span> : null}
                </div>
              </div>
            </div>
          )}
        </Card>

        <div className="import-side">
          <Card>
            <CardHeader eyebrow="Step 2 · validate" title="What the importer checks" />
            <ul className="checklist">
              <li><CheckCircle2 size={14} /> Column aliases and header order</li>
              <li><CheckCircle2 size={14} /> Amount parsing for Rp, thousand separators</li>
              <li><CheckCircle2 size={14} /> Vendor codes against the register</li>
              <li><CheckCircle2 size={14} /> Duplicate file checksum (SHA-256)</li>
              <li><CheckCircle2 size={14} /> Per-row hash to skip re-imported lines</li>
              <li><CheckCircle2 size={14} /> All-or-nothing validation, partial commit of valid rows</li>
            </ul>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Sample data"
              title="Pilot files"
              subtitle="Synthetic statements generated with the seed."
            />
            {!samples || samples.items.length === 0 ? (
              <p className="muted small">Sample files appear after seeding the backend.</p>
            ) : (
              <div className="sample-list">
                {samples.items.map((sample) => (
                  <div className="sample-row" key={sample.name}>
                    <FileSpreadsheet size={16} />
                    <div>
                      <strong>{sample.label}</strong>
                      <span>{sample.source} · {(sample.sizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Download size={13} />}
                      onClick={() => download(`/api/imports/samples/${encodeURIComponent(sample.name)}`, sample.name)}
                    >
                      CSV
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="sample-note">
              Demo tip: import <span className="mono">ledger_q4_2026.csv</span> a second time. Laras will respond with
              “already imported” and add zero rows.
            </p>
          </Card>

          <div className="idempotency-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Duplicate-safe by design</strong>
              <p>
                A file checksum blocks whole-file replays; a row hash blocks overlapping statements. The importer records
                skipped rows instead of silently double counting settlement.
              </p>
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <Card padded={false}>
          <div className="card-header-inline">
            <CardHeader
              eyebrow="Step 3 · review"
              title="Validation preview"
              subtitle={`${preview.fileName} · checksum ${preview.checksum.slice(0, 12)} · ${preview.headers.length} columns`}
              action={
                preview.duplicateFile ? (
                  <Badge tone="info">Exact file seen before</Badge>
                ) : (
                  <Badge tone={preview.summary.invalid > 0 ? 'warning' : 'success'}>
                    {formatNumber(preview.summary.valid)} ready
                  </Badge>
                )
              }
            />
          </div>
          {preview.duplicateFile && (
            <div className="duplicate-banner">
              <ShieldCheck size={18} />
              <div>
                <strong>This file was imported before</strong>
                <p>Committing will create a DUPLICATE_FILE batch with zero inserts. Existing matches and exceptions stay untouched.</p>
              </div>
            </div>
          )}
          <div className="preview-summary">
            <div><span>Rows</span><strong>{formatNumber(preview.summary.rowCount)}</strong></div>
            <div className="is-success"><span>Valid</span><strong>{formatNumber(preview.summary.valid)}</strong></div>
            <div className="is-warning"><span>Duplicate rows</span><strong>{formatNumber(preview.summary.duplicates)}</strong></div>
            <div className="is-danger"><span>Invalid</span><strong>{formatNumber(preview.summary.invalid)}</strong></div>
          </div>
          <div className="table-wrap">
            <table className="data-table compact preview-table">
              <thead>
                <tr><th>Line</th><th>Status</th><th>Row</th><th className="num">Amount</th><th>Issues</th></tr>
              </thead>
              <tbody>
                {preview.previewRows.slice(0, 40).map((row) => (
                  <tr key={row.line}>
                    <td className="mono">{row.line}</td>
                    <td><Badge tone={row.status === 'VALID' ? 'success' : row.status === 'DUPLICATE' ? 'info' : 'danger'}>{row.status}</Badge></td>
                    <td className="mono small">{row.label}</td>
                    <td className="num money">{row.amountMinor !== null ? formatNumber(row.amountMinor / 100) : '—'}</td>
                    <td className="small muted">
                      {row.issues.length === 0 ? '—' : row.issues.map((issue) => issue.message).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.previewRows.length > 40 && <p className="preview-more">Showing the first 40 of {formatNumber(preview.previewRows.length)} rows.</p>}
          {preview.errors.length > 0 && (
            <div className="preview-errors">
              <strong>{preview.errors.length} validation issues</strong>
              <ul>
                {preview.errors.slice(0, 12).map((error, index) => (
                  <li key={`${error.line}-${index}`}>Line {error.line}{error.field ? ` · ${error.field}` : ''}: {error.message}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card padded={false}>
        <div className="card-header-inline">
          <CardHeader
            eyebrow="History"
            title="Import batches"
            subtitle="Every batch records the checksum, counts and whether reconciliation was triggered."
            action={<Badge tone="neutral">{formatNumber(batches?.items.length ?? 0)} shown</Badge>}
          />
        </div>
        {batchesLoading ? (
          <div className="queue-loading"><LoadingBlock rows={5} /></div>
        ) : (batches?.items.length ?? 0) === 0 ? (
          <EmptyState title="No imports yet" message="Commit a sample statement to start reconciliation." icon={<UploadCloud size={20} />} />
        ) : (
          <div className="table-wrap">
            <table className="data-table import-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th className="num">Rows</th>
                  <th className="num">Inserted</th>
                  <th className="num">Skipped</th>
                  <th className="num">Invalid</th>
                  <th>Checksum</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {(batches?.items ?? []).map((batch) => (
                  <tr key={batch.id}>
                    <td className="mono small">{batch.fileName}</td>
                    <td><Badge tone="neutral">{batch.source}</Badge></td>
                    <td><StatusBadge status={batch.status} /></td>
                    <td className="num">{formatNumber(batch.rowCount)}</td>
                    <td className="num">{formatNumber(batch.insertedCount)}</td>
                    <td className={`num ${batch.skippedCount > 0 ? 'text-warning' : ''}`}>{formatNumber(batch.skippedCount)}</td>
                    <td className={`num ${batch.invalidCount > 0 ? 'text-danger' : ''}`}>{formatNumber(batch.invalidCount)}</td>
                    <td className="mono small muted">{batch.checksum}</td>
                    <td className="small">{batch.importedByName ?? '—'}</td>
                    <td className="small muted">{timeAgo(batch.createdAt)}<span className="block">{formatDate(batch.createdAt)}</span></td>
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
