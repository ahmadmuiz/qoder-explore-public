import { one, run, getDb, tx } from '../db/index.js';
import { config } from '../config.js';
import { parseCsv, requireHeaders, type ParsedCsv } from '../lib/csv.js';
import { parseDateInput } from '../lib/dates.js';
import { normalizeInvoiceNumber, normalizeRef, newId, sha256Hex } from '../lib/ids.js';
import { parseAmountToMinor } from '../lib/money.js';
import { ApiError } from '../lib/http.js';
import { nowIso } from '../lib/dates.js';
import { writeAudit } from '../lib/audit.js';
import type { AuthUser } from '../lib/security.js';
import { runReconciliation } from './engine.js';

export type ImportSource = 'LEDGER' | 'INVOICE' | 'RECEIPT';

export interface RowIssue {
  line: number;
  field?: string;
  code: string;
  message: string;
}

export interface PreparedRow<T> {
  line: number;
  status: 'VALID' | 'DUPLICATE' | 'ERROR';
  hash: string;
  data?: T;
  issues: RowIssue[];
}

export interface LedgerRowData {
  transactionId: string;
  normalizedRef: string;
  amountMinor: number;
  currency: string;
  valueDate: string;
  vendorId: string | null;
  invoiceNumber: string | null;
  accountMask: string;
  channel: string;
  description: string;
}

export interface InvoiceRowData {
  invoiceNumber: string;
  vendorId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentRef: string | null;
  description: string;
}

export interface ReceiptRowData {
  receiptNumber: string;
  invoiceNumber: string;
  vendorId: string;
  amountMinor: number;
  currency: string;
  receivedDate: string;
}

type VendorRow = { id: string; code: string };

export interface PreparedImport {
  source: ImportSource;
  fileName: string;
  checksum: string;
  parsed: ParsedCsv;
  rows: Array<PreparedRow<LedgerRowData | InvoiceRowData | ReceiptRowData>>;
  summary: { rowCount: number; valid: number; duplicates: number; invalid: number };
  duplicateFileBatchId: string | null;
}

const REQUIRED: Record<ImportSource, string[]> = {
  LEDGER: ['transaction_id', 'amount', 'value_date'],
  INVOICE: ['invoice_number', 'vendor_code', 'issue_date', 'due_date', 'subtotal', 'total'],
  RECEIPT: ['receipt_number', 'invoice_number', 'vendor_code', 'amount', 'received_date'],
};

function vendorMap(): Map<string, VendorRow> {
  const rows = getDb().prepare('SELECT id, code FROM vendors').all() as VendorRow[];
  return new Map(rows.map((row) => [row.code.toUpperCase(), row]));
}

function pushIssue(issues: RowIssue[], line: number, field: string, code: string, message: string) {
  issues.push({ line, field, code, message });
}

export function prepareImport(source: ImportSource, fileName: string, buffer: Buffer): PreparedImport {
  const text = buffer.toString('utf8');
  if (!text.trim()) throw new ApiError(400, 'CSV_EMPTY', 'The uploaded file is empty.');
  const parsed = parseCsv(text, config.maxCsvRows);
  requireHeaders(parsed.headers, REQUIRED[source]);
  const checksum = sha256Hex(buffer);
  const priorBatch = one<{ id: string }>('SELECT id FROM import_batches WHERE checksum = ? LIMIT 1', checksum);
  const vendors = vendorMap();
  const seenHashes = new Set<string>();
  const seenInvoiceNumbers = new Set<string>();

  const rows = parsed.rows.map(({ line, values }): PreparedRow<LedgerRowData | InvoiceRowData | ReceiptRowData> => {
    const issues: RowIssue[] = [];

    if (source === 'LEDGER') {
      const transactionId = values.transaction_id?.trim() ?? '';
      const amountMinor = parseAmountToMinor(values.amount);
      const valueDate = parseDateInput(values.value_date);
      const currency = (values.currency || 'IDR').toUpperCase();
      const vendorCode = (values.vendor_code || '').trim().toUpperCase();
      const invoiceNumber = values.invoice_number?.trim() || null;
      const accountMask = values.account_mask || '8820-01-****-4471';
      const channel = values.channel || 'BCN Transfer';
      const description = values.description || '';

      if (!transactionId) pushIssue(issues, line, 'transaction_id', 'REQUIRED', 'Transaction ID is required.');
      if (!normalizeRef(transactionId)) pushIssue(issues, line, 'transaction_id', 'INVALID_REF', 'Transaction ID must contain letters or digits.');
      if (amountMinor === null || amountMinor <= 0) pushIssue(issues, line, 'amount', 'INVALID_AMOUNT', 'Amount must be a positive number.');
      if (!valueDate) pushIssue(issues, line, 'value_date', 'INVALID_DATE', 'Value date must be YYYY-MM-DD or DD/MM/YYYY.');
      let vendorId: string | null = null;
      if (vendorCode) {
        const vendor = vendors.get(vendorCode);
        if (!vendor) pushIssue(issues, line, 'vendor_code', 'UNKNOWN_VENDOR', `Vendor code ${vendorCode} is not registered.`);
        else vendorId = vendor.id;
      }
      if (!/^[A-Z]{3}$/.test(currency)) pushIssue(issues, line, 'currency', 'INVALID_CURRENCY', 'Currency must be a 3-letter ISO code.');

      const hash = sha256Hex(
        ['LEDGER', normalizeRef(transactionId), amountMinor, currency, valueDate, vendorCode, normalizeInvoiceNumber(invoiceNumber ?? ''), accountMask, channel, description].join('|'),
      );
      if (issues.length === 0) {
        if (seenHashes.has(hash) || one('SELECT 1 FROM ledger_transactions WHERE row_hash = ?', hash)) {
          pushIssue(issues, line, undefined as unknown as string, 'DUPLICATE_ROW', 'This exact ledger row was already imported.');
        }
      }
      seenHashes.add(hash);

      const data: LedgerRowData | undefined =
        issues.length === 0
          ? {
              transactionId,
              normalizedRef: normalizeRef(transactionId),
              amountMinor: amountMinor!,
              currency,
              valueDate: valueDate!,
              vendorId,
              invoiceNumber,
              accountMask,
              channel,
              description,
            }
          : undefined;

      return {
        line,
        hash,
        status: issues.some((issue) => issue.code === 'DUPLICATE_ROW') ? 'DUPLICATE' : issues.length ? 'ERROR' : 'VALID',
        data,
        issues,
      };
    }

    if (source === 'INVOICE') {
      const invoiceNumber = values.invoice_number?.trim() ?? '';
      const vendorCode = (values.vendor_code || '').trim().toUpperCase();
      const issueDate = parseDateInput(values.issue_date);
      const dueDate = parseDateInput(values.due_date);
      const currency = (values.currency || 'IDR').toUpperCase();
      const subtotalMinor = parseAmountToMinor(values.subtotal);
      const taxMinor = parseAmountToMinor(values.tax || '0');
      const totalMinor = parseAmountToMinor(values.total);
      const paymentRef = values.payment_ref?.trim() || null;
      const description = values.description || '';

      if (!invoiceNumber) pushIssue(issues, line, 'invoice_number', 'REQUIRED', 'Invoice number is required.');
      const vendor = vendors.get(vendorCode);
      if (!vendorCode) pushIssue(issues, line, 'vendor_code', 'REQUIRED', 'Vendor code is required.');
      else if (!vendor) pushIssue(issues, line, 'vendor_code', 'UNKNOWN_VENDOR', `Vendor code ${vendorCode} is not registered.`);
      if (!issueDate) pushIssue(issues, line, 'issue_date', 'INVALID_DATE', 'Issue date must be YYYY-MM-DD or DD/MM/YYYY.');
      if (!dueDate) pushIssue(issues, line, 'due_date', 'INVALID_DATE', 'Due date must be YYYY-MM-DD or DD/MM/YYYY.');
      if (subtotalMinor === null) pushIssue(issues, line, 'subtotal', 'INVALID_AMOUNT', 'Subtotal must be numeric.');
      if (taxMinor === null) pushIssue(issues, line, 'tax', 'INVALID_AMOUNT', 'Tax must be numeric.');
      if (totalMinor === null || totalMinor <= 0) pushIssue(issues, line, 'total', 'INVALID_AMOUNT', 'Total must be a positive number.');

      const existing = invoiceNumber
        ? one<{ total_minor: number; vendor_id: string }>('SELECT total_minor, vendor_id FROM invoices WHERE invoice_number = ?', invoiceNumber)
        : undefined;
      if (existing) {
        if (existing.total_minor !== totalMinor || existing.vendor_id !== vendor?.id) {
          pushIssue(issues, line, 'invoice_number', 'INVOICE_CONFLICT', 'Invoice number already exists with a different vendor or total.');
        } else {
          pushIssue(issues, line, 'invoice_number', 'DUPLICATE_INVOICE', 'Invoice number is already in the register.');
        }
      }
      if (invoiceNumber && seenInvoiceNumbers.has(invoiceNumber)) {
        pushIssue(issues, line, 'invoice_number', 'DUPLICATE_INVOICE', 'Invoice number appears more than once in this file.');
      }
      seenInvoiceNumbers.add(invoiceNumber);

      const hash = sha256Hex(
        ['INVOICE', invoiceNumber, vendorCode, issueDate, dueDate, currency, subtotalMinor, taxMinor, totalMinor, normalizeRef(paymentRef ?? '')].join('|'),
      );
      const data: InvoiceRowData | undefined =
        issues.length === 0
          ? {
              invoiceNumber,
              vendorId: vendor!.id,
              issueDate: issueDate!,
              dueDate: dueDate!,
              currency,
              subtotalMinor: subtotalMinor!,
              taxMinor: taxMinor!,
              totalMinor: totalMinor!,
              paymentRef,
              description,
            }
          : undefined;
      return {
        line,
        hash,
        status: issues.some((issue) => issue.code === 'DUPLICATE_INVOICE') ? 'DUPLICATE' : issues.length ? 'ERROR' : 'VALID',
        data,
        issues,
      };
    }

    const receiptNumber = values.receipt_number?.trim() ?? '';
    const invoiceNumber = values.invoice_number?.trim() ?? '';
    const vendorCode = (values.vendor_code || '').trim().toUpperCase();
    const amountMinor = parseAmountToMinor(values.amount);
    const currency = (values.currency || 'IDR').toUpperCase();
    const receivedDate = parseDateInput(values.received_date);

    if (!receiptNumber) pushIssue(issues, line, 'receipt_number', 'REQUIRED', 'Receipt number is required.');
    if (!invoiceNumber) pushIssue(issues, line, 'invoice_number', 'REQUIRED', 'Invoice number is required.');
    const vendor = vendors.get(vendorCode);
    if (!vendorCode) pushIssue(issues, line, 'vendor_code', 'REQUIRED', 'Vendor code is required.');
    else if (!vendor) pushIssue(issues, line, 'vendor_code', 'UNKNOWN_VENDOR', `Vendor code ${vendorCode} is not registered.`);
    if (amountMinor === null || amountMinor <= 0) pushIssue(issues, line, 'amount', 'INVALID_AMOUNT', 'Amount must be a positive number.');
    if (!receivedDate) pushIssue(issues, line, 'received_date', 'INVALID_DATE', 'Received date must be YYYY-MM-DD or DD/MM/YYYY.');

    const hash = sha256Hex(['RECEIPT', vendorCode, receiptNumber, invoiceNumber, amountMinor, currency, receivedDate].join('|'));
    if (issues.length === 0 && (seenHashes.has(hash) || one('SELECT 1 FROM receipts WHERE row_hash = ?', hash))) {
      pushIssue(issues, line, undefined as unknown as string, 'DUPLICATE_ROW', 'This exact receipt row was already imported.');
    }
    seenHashes.add(hash);

    const data: ReceiptRowData | undefined =
      issues.length === 0
        ? {
            receiptNumber,
            invoiceNumber,
            vendorId: vendor!.id,
            amountMinor: amountMinor!,
            currency,
            receivedDate: receivedDate!,
          }
        : undefined;
    return {
      line,
      hash,
      status: issues.some((issue) => issue.code === 'DUPLICATE_ROW') ? 'DUPLICATE' : issues.length ? 'ERROR' : 'VALID',
      data,
      issues,
    };
  });

  const valid = rows.filter((row) => row.status === 'VALID').length;
  const duplicates = rows.filter((row) => row.status === 'DUPLICATE').length;
  const invalid = rows.filter((row) => row.status === 'ERROR').length;

  return {
    source,
    fileName,
    checksum,
    parsed,
    rows,
    summary: { rowCount: rows.length, valid, duplicates, invalid },
    duplicateFileBatchId: priorBatch?.id ?? null,
  };
}

export interface ImportPreview {
  source: ImportSource;
  fileName: string;
  checksum: string;
  headers: string[];
  summary: PreparedImport['summary'];
  duplicateFile: boolean;
  previewRows: Array<{
    line: number;
    status: PreparedRow<unknown>['status'];
    amountMinor: number | null;
    label: string;
    issues: RowIssue[];
  }>;
  errors: RowIssue[];
}

function labelFor(source: ImportSource, data: Record<string, unknown>): string {
  if (source === 'LEDGER') return String(data.transactionId ?? '');
  if (source === 'INVOICE') return String(data.invoiceNumber ?? '');
  return String(data.receiptNumber ?? '');
}

export function previewImport(source: ImportSource, fileName: string, buffer: Buffer): ImportPreview {
  const prepared = prepareImport(source, fileName, buffer);
  const previewRows = prepared.rows.slice(0, 100).map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const amount =
      source === 'INVOICE'
        ? (data.totalMinor as number | undefined)
        : (data.amountMinor as number | undefined);
    return {
      line: row.line,
      status: row.status,
      amountMinor: amount ?? null,
      label: labelFor(source, data) || `Line ${row.line}`,
      issues: row.issues,
    };
  });
  return {
    source,
    fileName,
    checksum: prepared.checksum,
    headers: prepared.parsed.headers,
    summary: prepared.summary,
    duplicateFile: Boolean(prepared.duplicateFileBatchId),
    previewRows,
    errors: prepared.rows.flatMap((row) => row.issues).slice(0, 200),
  };
}

export interface ImportOutcome {
  batchId: string;
  status: 'COMPLETED' | 'DUPLICATE_FILE' | 'REJECTED';
  summary: PreparedImport['summary'];
  duplicateFile: boolean;
  runId: string | null;
  message: string;
}

export function commitImport(input: {
  source: ImportSource;
  fileName: string;
  buffer: Buffer;
  actor: AuthUser;
  autoRun?: boolean;
}): ImportOutcome {
  const prepared = prepareImport(input.source, input.fileName, input.buffer);
  const batchId = newId('bat');
  const createdAt = nowIso();

  if (prepared.duplicateFileBatchId) {
    run(
      `INSERT INTO import_batches (id, source, file_name, checksum, row_count, inserted_count, skipped_count, invalid_count, status, imported_by, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, 'DUPLICATE_FILE', ?, NULL, ?)`,
      batchId,
      input.source,
      input.fileName,
      prepared.checksum,
      prepared.summary.rowCount,
      prepared.summary.rowCount,
      input.actor.id,
      createdAt,
    );
    writeAudit({
      actorId: input.actor.id,
      actorName: input.actor.name,
      action: 'IMPORT_DUPLICATE_FILE',
      entityType: 'IMPORT_BATCH',
      entityId: batchId,
      summary: `Re-import of ${input.fileName} skipped: identical file checksum.`,
      meta: { checksum: prepared.checksum, source: input.source, rows: prepared.summary.rowCount },
    });
    return {
      batchId,
      status: 'DUPLICATE_FILE',
      summary: prepared.summary,
      duplicateFile: true,
      runId: null,
      message: 'This exact file was imported before. No rows were added.',
    };
  }

  if (prepared.summary.valid === 0) {
    run(
      `INSERT INTO import_batches (id, source, file_name, checksum, row_count, inserted_count, skipped_count, invalid_count, status, imported_by, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'REJECTED', ?, NULL, ?)`,
      batchId,
      input.source,
      input.fileName,
      prepared.checksum,
      prepared.summary.rowCount,
      prepared.summary.duplicates,
      prepared.summary.invalid,
      input.actor.id,
      createdAt,
    );
    return {
      batchId,
      status: 'REJECTED',
      summary: prepared.summary,
      duplicateFile: false,
      runId: null,
      message: 'No valid rows were found. Nothing was imported.',
    };
  }

  tx(() => {
    run(
      `INSERT INTO import_batches (id, source, file_name, checksum, row_count, inserted_count, skipped_count, invalid_count, status, imported_by, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, NULL, ?)`,
      batchId,
      input.source,
      input.fileName,
      prepared.checksum,
      prepared.summary.rowCount,
      prepared.summary.valid,
      prepared.summary.duplicates,
      prepared.summary.invalid,
      input.actor.id,
      createdAt,
    );

    if (input.source === 'LEDGER') {
      const insert = getDb().prepare(
        `INSERT INTO ledger_transactions (id, batch_id, transaction_id, normalized_ref, amount_minor, currency, value_date, vendor_id, invoice_number, account_mask, channel, description, row_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?)`,
      );
      for (const row of prepared.rows) {
        if (row.status !== 'VALID' || !row.data) continue;
        const data = row.data as LedgerRowData;
        insert.run(
          newId('txn'),
          batchId,
          data.transactionId,
          data.normalizedRef,
          data.amountMinor,
          data.currency,
          data.valueDate,
          data.vendorId,
          data.invoiceNumber,
          data.accountMask,
          data.channel,
          data.description,
          row.hash,
          createdAt,
        );
      }
    } else if (input.source === 'INVOICE') {
      const insert = getDb().prepare(
        `INSERT INTO invoices (id, invoice_number, vendor_id, issue_date, due_date, currency, subtotal_minor, tax_minor, total_minor, status, payment_ref, description, source_batch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
      );
      for (const row of prepared.rows) {
        if (row.status !== 'VALID' || !row.data) continue;
        const data = row.data as InvoiceRowData;
        insert.run(
          newId('inv'),
          data.invoiceNumber,
          data.vendorId,
          data.issueDate,
          data.dueDate,
          data.currency,
          data.subtotalMinor,
          data.taxMinor,
          data.totalMinor,
          data.paymentRef,
          data.description,
          batchId,
          createdAt,
        );
      }
    } else {
      const insert = getDb().prepare(
        `INSERT INTO receipts (id, batch_id, receipt_number, invoice_number, vendor_id, amount_minor, currency, received_date, attachment_id, row_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      );
      for (const row of prepared.rows) {
        if (row.status !== 'VALID' || !row.data) continue;
        const data = row.data as ReceiptRowData;
        insert.run(
          newId('rct'),
          batchId,
          data.receiptNumber,
          data.invoiceNumber,
          data.vendorId,
          data.amountMinor,
          data.currency,
          data.receivedDate,
          row.hash,
          createdAt,
        );
      }
    }
  });

  writeAudit({
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: 'IMPORT_COMMITTED',
    entityType: 'IMPORT_BATCH',
    entityId: batchId,
    summary: `${input.source} import ${input.fileName}: ${prepared.summary.valid} inserted, ${prepared.summary.duplicates} skipped, ${prepared.summary.invalid} invalid.`,
    meta: { source: input.source, checksum: prepared.checksum, ...prepared.summary },
  });

  let runId: string | null = null;
  if (input.autoRun) {
    const result = runReconciliation({ trigger: 'IMPORT', actor: input.actor });
    runId = result.runId;
    run('UPDATE import_batches SET run_id = ? WHERE id = ?', runId, batchId);
  }

  return {
    batchId,
    status: 'COMPLETED',
    summary: prepared.summary,
    duplicateFile: false,
    runId,
    message: `Imported ${prepared.summary.valid} of ${prepared.summary.rowCount} rows.`,
  };
}
