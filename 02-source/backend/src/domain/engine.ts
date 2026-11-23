import { getDb, one, run, tx, all } from '../db/index.js';
import { config } from '../config.js';
import { addDays, nowIso } from '../lib/dates.js';
import { newId, normalizeInvoiceNumber, normalizeRef } from '../lib/ids.js';
import { getSettings, type AppSettings } from '../lib/settings.js';
import { writeAudit } from '../lib/audit.js';
import type { AuthUser } from '../lib/security.js';

export type ExceptionType =
  | 'DUPLICATE_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'MISSING_PAYMENT'
  | 'UNALLOCATED_PAYMENT'
  | 'NOMINAL_VARIANCE'
  | 'ORPHAN_RECEIPT'
  | 'DUPLICATE_RECEIPT';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface LedgerDbRow {
  id: string;
  transaction_id: string;
  normalized_ref: string;
  amount_minor: number;
  currency: string;
  value_date: string;
  vendor_id: string | null;
  invoice_number: string | null;
  account_mask: string;
  channel: string;
  description: string;
  status: string;
}

interface InvoiceDbRow {
  id: string;
  invoice_number: string;
  vendor_id: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  payment_ref: string | null;
}

interface ReceiptDbRow {
  id: string;
  receipt_number: string;
  invoice_number: string;
  vendor_id: string;
  amount_minor: number;
  currency: string;
  received_date: string;
}

interface AttachmentDbRow {
  id: string;
  file_name: string;
  declared_amount_minor: number;
  linked_invoice_number: string | null;
}

interface ProposedException {
  fingerprint: string;
  type: ExceptionType;
  severity: Severity;
  transactionRef: string | null;
  invoiceNumber: string | null;
  vendorId: string | null;
  amountMinor: number;
  deltaMinor: number;
  currency: string;
  title: string;
  detail: Record<string, unknown>;
}

export interface RunStats {
  totalLedgerRows: number;
  totalInvoices: number;
  exactMatches: number;
  toleranceMatches: number;
  provisionalMatches: number;
  duplicatePayments: number;
  amountMismatches: number;
  missingPayments: number;
  unallocatedPayments: number;
  nominalVariances: number;
  orphanReceipts: number;
  duplicateReceipts: number;
  exceptionsProposed: number;
  exceptionsOpen: number;
  autoCleared: number;
  matchedRate: number;
  matchedValueMinor: number;
  valueAtRiskMinor: number;
  currency: string;
}

export interface RunResult {
  runId: string;
  stats: RunStats;
}

function severityForAmount(amountMinor: number, settings: AppSettings, kind: 'duplicate' | 'exception'): Severity {
  if (kind === 'duplicate') {
    if (amountMinor >= settings.highValueMinor) return 'CRITICAL';
    if (amountMinor >= settings.approvalThresholdMinor) return 'HIGH';
    return 'MEDIUM';
  }
  if (amountMinor >= settings.highValueMinor) return 'CRITICAL';
  if (amountMinor >= settings.approvalThresholdMinor) return 'HIGH';
  if (amountMinor >= 10_000_000_00) return 'MEDIUM';
  return 'LOW';
}

function severityForDelta(deltaMinor: number): Severity {
  const absolute = Math.abs(deltaMinor);
  if (absolute >= 100_000_000_00) return 'HIGH';
  if (absolute >= 10_000_000_00) return 'MEDIUM';
  return 'LOW';
}

export function runReconciliation(options: { trigger: string; actor?: AuthUser; today?: string }): RunResult {
  const db = getDb();
  const settings = getSettings();
  const runId = newId('run');
  const startedAt = nowIso();
  const today = options.today ?? config.today;

  run(
    "INSERT INTO runs (id, trigger, status, started_at, stats_json, triggered_by) VALUES (?, ?, 'RUNNING', ?, '{}', ?)",
    runId,
    options.trigger,
    startedAt,
    options.actor?.id ?? null,
  );

  try {
    const ledgerRows = all<LedgerDbRow>(
      'SELECT id, transaction_id, normalized_ref, amount_minor, currency, value_date, vendor_id, invoice_number, account_mask, channel, description, status FROM ledger_transactions ORDER BY value_date, id',
    );
    const invoices = all<InvoiceDbRow>(
      'SELECT id, invoice_number, vendor_id, issue_date, due_date, currency, subtotal_minor, tax_minor, total_minor, payment_ref FROM invoices ORDER BY issue_date, id',
    );
    const receipts = all<ReceiptDbRow>(
      'SELECT id, receipt_number, invoice_number, vendor_id, amount_minor, currency, received_date FROM receipts ORDER BY received_date, id',
    );
    const receiptAttachments = all<AttachmentDbRow>(
      'SELECT id, file_name, declared_amount_minor, linked_invoice_number FROM attachments WHERE kind = \'RECEIPT\' AND declared_amount_minor IS NOT NULL',
    );
    const lineSums = new Map(
      (all<{ invoice_id: string; total: number; count: number }>(
        'SELECT invoice_id, SUM(amount_minor) AS total, COUNT(*) AS count FROM invoice_lines GROUP BY invoice_id',
      )).map((row) => [row.invoice_id, row]),
    );

    const exceptions: ProposedException[] = [];
    const matches: Array<{ ledgerId: string; invoiceId: string; status: 'EXACT' | 'TOLERANCE' | 'PROVISIONAL'; delta: number; confidence: number }> = [];
    const duplicateLedgerIds = new Set<string>();
    const duplicateReceiptIds = new Set<string>();
    const matchedInvoiceIds = new Set<string>();
    const matchedLedgerIds = new Set<string>();

    const invoicesByRef = new Map<string, InvoiceDbRow[]>();
    const invoicesByNumber = new Map<string, InvoiceDbRow[]>();
    for (const invoice of invoices) {
      if (invoice.payment_ref) {
        const key = normalizeRef(invoice.payment_ref);
        const list = invoicesByRef.get(key) ?? [];
        list.push(invoice);
        invoicesByRef.set(key, list);
      }
      const numberKey = normalizeInvoiceNumber(invoice.invoice_number);
      const list = invoicesByNumber.get(numberKey) ?? [];
      list.push(invoice);
      invoicesByNumber.set(numberKey, list);
    }

    const groups = new Map<string, LedgerDbRow[]>();
    for (const row of ledgerRows) {
      const list = groups.get(row.normalized_ref) ?? [];
      list.push(row);
      groups.set(row.normalized_ref, list);
    }

    const pendingUnallocated: LedgerDbRow[] = [];
    let toleranceMatches = 0;
    let provisionalMatches = 0;

    for (const [ref, group] of groups) {
      const ordered = [...group].sort((a, b) => (a.value_date + a.id).localeCompare(b.value_date + b.id));
      const primary = ordered[0]!;
      for (const extra of ordered.slice(1)) {
        duplicateLedgerIds.add(extra.id);
        exceptions.push({
          fingerprint: `DUPLICATE_PAYMENT:${extra.id}`,
          type: 'DUPLICATE_PAYMENT',
          severity: severityForAmount(extra.amount_minor, settings, 'duplicate'),
          transactionRef: extra.transaction_id,
          invoiceNumber: extra.invoice_number ?? primary.invoice_number,
          vendorId: extra.vendor_id ?? primary.vendor_id,
          amountMinor: extra.amount_minor,
          deltaMinor: extra.amount_minor,
          currency: extra.currency,
          title: `Possible duplicate disbursement for ${ref}`,
          detail: {
            reason: 'Repeated payment reference',
            normalizedRef: ref,
            primaryTransactionId: primary.transaction_id,
            primaryValueDate: primary.value_date,
            duplicateValueDate: extra.value_date,
            duplicateAccount: extra.account_mask,
            guidance: 'Confirm with treasury before initiating recovery from the vendor.',
          },
        });
      }

      const candidates = (invoicesByRef.get(ref) ?? []).filter(
        (invoice) => !matchedInvoiceIds.has(invoice.id) && invoice.currency === primary.currency,
      );
      if (candidates.length === 0) {
        pendingUnallocated.push(primary);
        continue;
      }

      const exact = candidates.find((invoice) => invoice.total_minor === primary.amount_minor);
      const withinTolerance = exact
        ? undefined
        : candidates.find(
            (invoice) => Math.abs(invoice.total_minor - primary.amount_minor) <= settings.amountToleranceMinor,
          );
      const chosen = exact ?? withinTolerance ?? candidates[0]!;
      const delta = primary.amount_minor - chosen.total_minor;

      let status: 'EXACT' | 'TOLERANCE' | 'PROVISIONAL';
      if (exact) status = 'EXACT';
      else if (withinTolerance) status = 'TOLERANCE';
      else status = 'PROVISIONAL';

      matches.push({
        ledgerId: primary.id,
        invoiceId: chosen.id,
        status,
        delta,
        confidence: status === 'EXACT' ? 100 : status === 'TOLERANCE' ? 98 : 72,
      });
      matchedInvoiceIds.add(chosen.id);
      matchedLedgerIds.add(primary.id);

      if (status === 'PROVISIONAL') {
        exceptions.push({
          fingerprint: `AMOUNT_MISMATCH:${chosen.invoice_number}`,
          type: 'AMOUNT_MISMATCH',
          severity: severityForAmount(Math.abs(delta), settings, 'exception'),
          transactionRef: primary.transaction_id,
          invoiceNumber: chosen.invoice_number,
          vendorId: chosen.vendor_id,
          amountMinor: primary.amount_minor,
          deltaMinor: delta,
          currency: primary.currency,
          title: `Amount mismatch on ${chosen.invoice_number}`,
          detail: {
            reason: 'Payment ID matched, nominal did not',
            ledgerAmountMinor: primary.amount_minor,
            invoiceAmountMinor: chosen.total_minor,
            deltaMinor: delta,
            guidance: 'Check bank charges, FX deductions or a keying error before accepting.',
          },
        });
      } else if (status === 'TOLERANCE') {
        toleranceMatches += 1;
        // Recorded as a match; the variance is inside the configured tolerance.
      }
      if (status === 'PROVISIONAL') provisionalMatches += 1;
    }

    for (const invoice of invoices) {
      if (matchedInvoiceIds.has(invoice.id)) continue;
      const number = normalizeInvoiceNumber(invoice.invoice_number);
      const index = pendingUnallocated.findIndex(
        (row) =>
          normalizeInvoiceNumber(row.invoice_number ?? '') === number &&
          row.amount_minor === invoice.total_minor &&
          row.currency === invoice.currency,
      );
      if (index >= 0) {
        const ledger = pendingUnallocated[index]!;
        pendingUnallocated.splice(index, 1);
        matches.push({ ledgerId: ledger.id, invoiceId: invoice.id, status: 'EXACT', delta: 0, confidence: 100 });
        matchedInvoiceIds.add(invoice.id);
        matchedLedgerIds.add(ledger.id);
      }
    }

    for (const row of pendingUnallocated) {
      exceptions.push({
        fingerprint: `UNALLOCATED_PAYMENT:${row.id}`,
        type: 'UNALLOCATED_PAYMENT',
        severity: severityForAmount(row.amount_minor, settings, 'exception'),
        transactionRef: row.transaction_id,
        invoiceNumber: row.invoice_number,
        vendorId: row.vendor_id,
        amountMinor: row.amount_minor,
        deltaMinor: row.amount_minor,
        currency: row.currency,
        title: `Unallocated payment ${row.transaction_id}`,
        detail: {
          reason: row.invoice_number ? 'No matching invoice for this reference' : 'No invoice reference on the ledger row',
          valueDate: row.value_date,
          account: row.account_mask,
          channel: row.channel,
          guidance: 'Identify the vendor invoice or return the funds to the operating account.',
        },
      });
    }

    for (const invoice of invoices) {
      if (matchedInvoiceIds.has(invoice.id)) continue;
      const noReference = !invoice.payment_ref;
      const overdue = addDays(invoice.due_date, settings.graceDays) < today;
      if (!overdue && !noReference) continue;
      if (noReference && invoice.issue_date > today) continue;
      exceptions.push({
        fingerprint: `MISSING_PAYMENT:${invoice.invoice_number}`,
        type: 'MISSING_PAYMENT',
        severity: severityForAmount(invoice.total_minor, settings, 'exception'),
        transactionRef: null,
        invoiceNumber: invoice.invoice_number,
        vendorId: invoice.vendor_id,
        amountMinor: invoice.total_minor,
        deltaMinor: invoice.total_minor,
        currency: invoice.currency,
        title: `No payment found for ${invoice.invoice_number}`,
        detail: {
          reason: noReference ? 'Invoice has no payment reference' : 'Invoice is past due with no ledger entry',
          dueDate: invoice.due_date,
          graceDays: settings.graceDays,
          paymentRef: invoice.payment_ref,
          guidance: 'Verify whether treasury released the payment; if not, schedule it before month close.',
        },
      });
    }

    const duplicateReceiptGroups = new Map<string, ReceiptDbRow[]>();
    for (const receipt of receipts) {
      const key = `${receipt.vendor_id}:${normalizeRef(receipt.receipt_number)}`;
      const list = duplicateReceiptGroups.get(key) ?? [];
      list.push(receipt);
      duplicateReceiptGroups.set(key, list);
    }
    for (const group of duplicateReceiptGroups.values()) {
      if (group.length < 2) continue;
      const ordered = [...group].sort((a, b) => (a.received_date + a.id).localeCompare(b.received_date + b.id));
      for (const extra of ordered.slice(1)) {
        duplicateReceiptIds.add(extra.id);
        exceptions.push({
          fingerprint: `DUPLICATE_RECEIPT:${extra.id}`,
          type: 'DUPLICATE_RECEIPT',
          severity: 'MEDIUM',
          transactionRef: null,
          invoiceNumber: extra.invoice_number,
          vendorId: extra.vendor_id,
          amountMinor: extra.amount_minor,
          deltaMinor: 0,
          currency: extra.currency,
          title: `Receipt ${extra.receipt_number} appears more than once`,
          detail: {
            reason: 'Duplicate kuitansi number',
            receiptNumber: extra.receipt_number,
            originalDate: ordered[0]!.received_date,
            guidance: 'Ask the vendor to void the duplicate kuitansi so the evidence pack stays clean.',
          },
        });
      }
    }

    const receiptsByInvoice = new Map<string, ReceiptDbRow[]>();
    for (const receipt of receipts) {
      if (duplicateReceiptIds.has(receipt.id)) continue;
      const key = normalizeInvoiceNumber(receipt.invoice_number);
      const list = receiptsByInvoice.get(key) ?? [];
      list.push(receipt);
      receiptsByInvoice.set(key, list);
      if (!invoicesByNumber.has(key)) {
        exceptions.push({
          fingerprint: `ORPHAN_RECEIPT:${receipt.id}`,
          type: 'ORPHAN_RECEIPT',
          severity: 'MEDIUM',
          transactionRef: null,
          invoiceNumber: receipt.invoice_number,
          vendorId: receipt.vendor_id,
          amountMinor: receipt.amount_minor,
          deltaMinor: 0,
          currency: receipt.currency,
          title: `Receipt ${receipt.receipt_number} has no invoice`,
          detail: {
            reason: 'Receipt invoice number not found in the register',
            receiptNumber: receipt.receipt_number,
            receivedDate: receipt.received_date,
            guidance: 'Register the missing invoice or return the kuitansi to the vendor for correction.',
          },
        });
      }
    }

    let nominalVariances = 0;

    for (const invoice of invoices) {
      const computed = invoice.subtotal_minor + invoice.tax_minor;
      if (computed !== invoice.total_minor) {
        nominalVariances += 1;
        exceptions.push({
          fingerprint: `NOMINAL_VARIANCE:total:${invoice.invoice_number}`,
          type: 'NOMINAL_VARIANCE',
          severity: severityForDelta(computed - invoice.total_minor),
          transactionRef: null,
          invoiceNumber: invoice.invoice_number,
          vendorId: invoice.vendor_id,
          amountMinor: invoice.total_minor,
          deltaMinor: computed - invoice.total_minor,
          currency: invoice.currency,
          title: `Invoice total does not add up on ${invoice.invoice_number}`,
          detail: {
            reason: 'Subtotal + tax differs from invoice total',
            subtotalMinor: invoice.subtotal_minor,
            taxMinor: invoice.tax_minor,
            statedTotalMinor: invoice.total_minor,
            computedTotalMinor: computed,
            guidance: 'Request a corrected invoice before releasing the final payment.',
          },
        });
      }

      const lineSum = lineSums.get(invoice.id);
      if (lineSum && lineSum.count > 0 && lineSum.total !== invoice.subtotal_minor) {
        nominalVariances += 1;
        exceptions.push({
          fingerprint: `NOMINAL_VARIANCE:lines:${invoice.invoice_number}`,
          type: 'NOMINAL_VARIANCE',
          severity: severityForDelta(lineSum.total - invoice.subtotal_minor),
          transactionRef: null,
          invoiceNumber: invoice.invoice_number,
          vendorId: invoice.vendor_id,
          amountMinor: invoice.total_minor,
          deltaMinor: lineSum.total - invoice.subtotal_minor,
          currency: invoice.currency,
          title: `Line items do not sum to subtotal on ${invoice.invoice_number}`,
          detail: {
            reason: 'Invoice line total differs from stated subtotal',
            lineTotalMinor: lineSum.total,
            statedSubtotalMinor: invoice.subtotal_minor,
            lineCount: lineSum.count,
            guidance: 'Validate the detailed billing before approval.',
          },
        });
      }

      const invoiceReceipts = receiptsByInvoice.get(normalizeInvoiceNumber(invoice.invoice_number)) ?? [];
      if (invoiceReceipts.length > 0) {
        const receiptTotal = invoiceReceipts.reduce((total, receipt) => total + receipt.amount_minor, 0);
        const delta = receiptTotal - invoice.total_minor;
        if (Math.abs(delta) > settings.amountToleranceMinor) {
          nominalVariances += 1;
          exceptions.push({
            fingerprint: `NOMINAL_VARIANCE:receipts:${invoice.invoice_number}`,
            type: 'NOMINAL_VARIANCE',
            severity: severityForDelta(delta),
            transactionRef: null,
            invoiceNumber: invoice.invoice_number,
            vendorId: invoice.vendor_id,
            amountMinor: receiptTotal,
            deltaMinor: delta,
            currency: invoice.currency,
            title: `Kuitansi total differs from invoice on ${invoice.invoice_number}`,
            detail: {
              reason: 'Supporting receipts do not equal the invoice total',
              receiptTotalMinor: receiptTotal,
              invoiceTotalMinor: invoice.total_minor,
              receiptCount: invoiceReceipts.length,
              guidance: 'Check for partial receipts or a mistyped nominal on the kuitansi.',
            },
          });
        }
      }
    }

    for (const attachment of receiptAttachments) {
      if (!attachment.linked_invoice_number) continue;
      const invoice = (invoicesByNumber.get(normalizeInvoiceNumber(attachment.linked_invoice_number)) ?? [])[0];
      if (!invoice) continue;
      const delta = attachment.declared_amount_minor - invoice.total_minor;
      if (Math.abs(delta) > settings.amountToleranceMinor) {
        nominalVariances += 1;
        exceptions.push({
          fingerprint: `NOMINAL_VARIANCE:attachment:${attachment.id}`,
          type: 'NOMINAL_VARIANCE',
          severity: severityForDelta(delta),
          transactionRef: null,
          invoiceNumber: invoice.invoice_number,
          vendorId: invoice.vendor_id,
          amountMinor: attachment.declared_amount_minor,
          deltaMinor: delta,
          currency: invoice.currency,
          title: `Kuitansi nominal differs from invoice on ${invoice.invoice_number}`,
          detail: {
            reason: 'Declared nominal on uploaded receipt differs from invoice total',
            attachmentId: attachment.id,
            fileName: attachment.file_name,
            declaredAmountMinor: attachment.declared_amount_minor,
            invoiceTotalMinor: invoice.total_minor,
            guidance: 'Re-open the kuitansi image and verify the nominal with the vendor.',
          },
        });
      }
    }

    const now = nowIso();
    const stats: RunStats = {
      totalLedgerRows: ledgerRows.length,
      totalInvoices: invoices.length,
      exactMatches: matches.filter((match) => match.status === 'EXACT').length,
      toleranceMatches,
      provisionalMatches,
      duplicatePayments: duplicateLedgerIds.size,
      amountMismatches: exceptions.filter((exception) => exception.type === 'AMOUNT_MISMATCH').length,
      missingPayments: exceptions.filter((exception) => exception.type === 'MISSING_PAYMENT').length,
      unallocatedPayments: exceptions.filter((exception) => exception.type === 'UNALLOCATED_PAYMENT').length,
      nominalVariances,
      orphanReceipts: exceptions.filter((exception) => exception.type === 'ORPHAN_RECEIPT').length,
      duplicateReceipts: duplicateReceiptIds.size,
      exceptionsProposed: exceptions.length,
      exceptionsOpen: 0,
      autoCleared: 0,
      matchedRate: 0,
      matchedValueMinor: 0,
      valueAtRiskMinor: 0,
      currency: 'IDR',
    };

    let autoCleared = 0;
    tx(() => {
      db.exec('DELETE FROM matches');
      const insertMatch = db.prepare(
        `INSERT INTO matches (id, run_id, ledger_id, invoice_id, status, amount_delta_minor, confidence, matched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const match of matches) {
        insertMatch.run(newId('mtc'), runId, match.ledgerId, match.invoiceId, match.status, match.delta, match.confidence, now);
      }

      db.exec("UPDATE ledger_transactions SET status = 'UNMATCHED'");
      const setStatus = db.prepare('UPDATE ledger_transactions SET status = ? WHERE id = ?');
      for (const match of matches) setStatus.run(match.status === 'PROVISIONAL' ? 'IN_REVIEW' : 'MATCHED', match.ledgerId);
      for (const id of duplicateLedgerIds) setStatus.run('DUPLICATE', id);

      const setInvoice = db.prepare('UPDATE invoices SET status = ? WHERE id = ?');
      for (const invoice of invoices) {
        const match = matches.find((candidate) => candidate.invoiceId === invoice.id);
        let status = 'OPEN';
        if (match?.status === 'EXACT' || match?.status === 'TOLERANCE') status = 'PAID';
        else if (match?.status === 'PROVISIONAL') status = 'EXCEPTION';
        else if (addDays(invoice.due_date, settings.graceDays) < today) status = 'OVERDUE';
        setInvoice.run(status, invoice.id);
      }

      const upsert = db.prepare(
        `INSERT INTO exceptions
          (id, fingerprint, type, severity, status, transaction_ref, invoice_number, vendor_id, amount_minor, delta_minor, currency, title, detail_json, assignee_id, resolution_code, resolution_note, resolved_by, resolved_at, first_seen_run, last_seen_run, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
           type = excluded.type,
           severity = excluded.severity,
           transaction_ref = excluded.transaction_ref,
           invoice_number = excluded.invoice_number,
           vendor_id = excluded.vendor_id,
           amount_minor = excluded.amount_minor,
           delta_minor = excluded.delta_minor,
           currency = excluded.currency,
           title = excluded.title,
           detail_json = excluded.detail_json,
           last_seen_run = excluded.last_seen_run,
           updated_at = excluded.updated_at,
           status = CASE WHEN exceptions.status = 'RESOLVED' AND exceptions.resolution_code = 'AUTO_CLEARED' THEN 'OPEN' ELSE exceptions.status END,
           resolution_code = CASE WHEN exceptions.status = 'RESOLVED' AND exceptions.resolution_code = 'AUTO_CLEARED' THEN NULL ELSE exceptions.resolution_code END,
           resolution_note = CASE WHEN exceptions.status = 'RESOLVED' AND exceptions.resolution_code = 'AUTO_CLEARED' THEN NULL ELSE exceptions.resolution_note END,
           resolved_by = CASE WHEN exceptions.status = 'RESOLVED' AND exceptions.resolution_code = 'AUTO_CLEARED' THEN NULL ELSE exceptions.resolved_by END,
           resolved_at = CASE WHEN exceptions.status = 'RESOLVED' AND exceptions.resolution_code = 'AUTO_CLEARED' THEN NULL ELSE exceptions.resolved_at END`,
      );
      for (const exception of exceptions) {
        upsert.run(
          newId('exc'),
          exception.fingerprint,
          exception.type,
          exception.severity,
          exception.transactionRef,
          exception.invoiceNumber,
          exception.vendorId,
          exception.amountMinor,
          exception.deltaMinor,
          exception.currency,
          exception.title,
          JSON.stringify(exception.detail),
          runId,
          runId,
          now,
          now,
        );
      }

      const stale = all<{ id: string; type: string; title: string }>(
        "SELECT id, type, title FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW') AND (last_seen_run IS NULL OR last_seen_run != ?)",
        runId,
      );
      const clear = db.prepare(
        "UPDATE exceptions SET status = 'RESOLVED', resolution_code = 'AUTO_CLEARED', resolution_note = ?, resolved_at = ?, updated_at = ? WHERE id = ?",
      );
      for (const exception of stale) {
        clear.run('Condition was no longer detected on the next reconciliation run.', now, now, exception.id);
        autoCleared += 1;
      }
      stats.autoCleared = autoCleared;
    });

    stats.matchedValueMinor = 0;

    const matchedValue = one<{ value: number }>(
      `SELECT COALESCE(SUM(l.amount_minor), 0) AS value
       FROM matches m JOIN ledger_transactions l ON l.id = m.ledger_id
       WHERE m.status IN ('EXACT', 'TOLERANCE')`,
    );
    stats.matchedValueMinor = matchedValue?.value ?? 0;
    const risk = one<{ value: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type IN ('DUPLICATE_PAYMENT', 'MISSING_PAYMENT', 'UNALLOCATED_PAYMENT') THEN amount_minor ELSE ABS(delta_minor) END), 0) AS value
       FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')`,
    );
    stats.valueAtRiskMinor = risk?.value ?? 0;
    const open = one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exceptions WHERE status IN ('OPEN', 'IN_REVIEW')",
    );
    stats.exceptionsOpen = open?.count ?? 0;
    const matchedCount = stats.exactMatches + stats.toleranceMatches;
    stats.matchedRate = invoices.length > 0 ? Math.round((matchedCount / invoices.length) * 1000) / 10 : 0;

    db.prepare("UPDATE runs SET status = 'COMPLETED', finished_at = ?, stats_json = ? WHERE id = ?").run(
      nowIso(),
      JSON.stringify(stats),
      runId,
    );

    writeAudit({
      actorId: options.actor?.id ?? null,
      actorName: options.actor?.name ?? 'system',
      action: 'RECONCILIATION_RUN',
      entityType: 'RUN',
      entityId: runId,
      summary: `Reconciliation ${runId}: ${stats.exactMatches} exact, ${stats.toleranceMatches} tolerance, ${stats.exceptionsOpen} open exceptions.`,
      meta: stats as unknown as Record<string, unknown>,
    });

    return { runId, stats };
  } catch (error) {
    run("UPDATE runs SET status = 'FAILED', finished_at = ?, stats_json = ? WHERE id = ?", nowIso(), JSON.stringify({ error: (error as Error).message }), runId);
    throw error;
  }
}

export function latestRun(): Record<string, unknown> | undefined {
  return one("SELECT * FROM runs WHERE status = 'COMPLETED' ORDER BY started_at DESC LIMIT 1");
}
