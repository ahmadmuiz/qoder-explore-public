import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootQaContext, multipart, sampleDir, type QaContext } from './helpers.ts';

let ctx: QaContext;
let app: any;

before(async () => {
  ctx = await bootQaContext();
  app = ctx.app;
});

after(async () => {
  await ctx.cleanup();
});

function auth(token = ctx.tokens.analyst) {
  return { authorization: `Bearer ${token}` };
}

async function get(url: string, token = ctx.tokens.analyst) {
  return app.inject({ method: 'GET', url, headers: auth(token) });
}

async function patch(url: string, payload: unknown, token = ctx.tokens.analyst) {
  return app.inject({ method: 'PATCH', url, headers: auth(token), payload: payload as any });
}

async function importCsv(source: string, fileName: string, token = ctx.tokens.analyst, endpoint = 'commit') {
  const form = multipart(
    { source },
    { filename: fileName, contentType: 'text/csv', buffer: readFileSync(join(sampleDir, fileName)) },
  );
  return app.inject({
    method: 'POST',
    url: `/api/imports/${endpoint}`,
    headers: { ...auth(token), 'content-type': `multipart/form-data; boundary=${form.boundary}` },
    payload: form.payload,
  });
}

test('health endpoint is public', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().service, 'laras-recon');
});

test('login returns a 12h token and rejects a bad password', async () => {
  const ok = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'rani@bcn.co.id', password: 'laras2026' },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().user.role, 'ANALYST');
  assert.ok(ok.json().token.length > 40);

  const bad = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'rani@bcn.co.id', password: 'wrong-password' },
  });
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.json().error.code, 'LOGIN_FAILED');
});

test('protected endpoints reject missing or invalid tokens', async () => {
  const missing = await app.inject({ method: 'GET', url: '/api/exceptions' });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.json().error.code, 'AUTH_REQUIRED');

  const invalid = await app.inject({
    method: 'GET',
    url: '/api/exceptions',
    headers: { authorization: 'Bearer not-a-token' },
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().error.code, 'AUTH_INVALID');
});

test('auth/me resolves the seeded identities', async () => {
  const analyst = await get('/api/auth/me');
  assert.equal(analyst.json().user.email, 'rani@bcn.co.id');
  const auditor = await get('/api/auth/me', ctx.tokens.auditor);
  assert.equal(auditor.json().user.role, 'AUDITOR');
});

test('dashboard exposes the canonical pilot KPIs', async () => {
  const response = await get('/api/dashboard');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.kpis.openExceptions, 22);
  assert.equal(body.kpis.missingPayments, 6);
  assert.equal(body.kpis.valueAtRiskMinor, 727_535_650_000);
  assert.equal(body.kpis.matchedRate, 91.2);
  assert.equal(body.lastRun.stats.exactMatches, 228);
  assert.equal(body.lastRun.stats.provisionalMatches, 4);

  const breakdown = new Map(body.breakdown.map((row: any) => [row.type, row.count]));
  assert.equal(breakdown.get('MISSING_PAYMENT'), 6);
  assert.equal(breakdown.get('DUPLICATE_PAYMENT'), 2);
  assert.equal(breakdown.get('UNALLOCATED_PAYMENT'), 3);
  assert.equal(breakdown.get('NOMINAL_VARIANCE'), 4);
  assert.equal(breakdown.get('ORPHAN_RECEIPT'), 2);
  assert.equal(breakdown.get('DUPLICATE_RECEIPT'), 1);
  assert.equal(breakdown.get('AMOUNT_MISMATCH'), 4);
});

test('exception summary matches the queue totals', async () => {
  const response = await get('/api/exceptions/summary');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.totals.open, 22);
  assert.equal(body.totals.inReview, 0);
  assert.equal(body.totals.valueMinor, 727_535_650_000);
  const missing = body.types.find((row: any) => row.type === 'MISSING_PAYMENT');
  assert.equal(missing.open, 6);
});

test('missing payments surface in the queue with correct evidence', async () => {
  const response = await get('/api/exceptions?status=ACTIVE&type=MISSING_PAYMENT&pageSize=50');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.total, 6);
  const invoice18 = body.items.find((item: any) => item.invoiceNumber === 'INV-2026-0018');
  assert.ok(invoice18, 'INV-2026-0018 must be in the missing queue');
  assert.equal(invoice18.amountMinor, 14_785_200_000);
  assert.equal(invoice18.severity, 'CRITICAL');
  assert.match(invoice18.reason, /payment reference|past due/i);
});

test('duplicate payments return both ledger rows as related evidence', async () => {
  const queue = await get('/api/exceptions?status=ACTIVE&type=DUPLICATE_PAYMENT&pageSize=10');
  assert.equal(queue.json().total, 2);
  const target = queue.json().items.find((item: any) => item.invoiceNumber === 'INV-2026-0059');
  assert.ok(target);
  const detail = await get(`/api/exceptions/${target.id}`);
  assert.equal(detail.statusCode, 200);
  const body = detail.json();
  assert.equal(body.exception.amountMinor, 124_675_200_000);
  assert.equal(body.relatedLedger.length, 2);
  assert.ok(body.detail.primaryValueDate);
  assert.ok(body.detail.duplicateValueDate);
});

test('amount mismatch carries invoice, ledger and signed delta', async () => {
  const queue = await get('/api/exceptions?status=ACTIVE&type=AMOUNT_MISMATCH&q=INV-2026-0035');
  assert.equal(queue.json().total, 1);
  const detail = await get(`/api/exceptions/${queue.json().items[0].id}`);
  const body = detail.json();
  assert.equal(body.exception.deltaMinor, -650_000);
  assert.equal(body.invoice.totalMinor, 58_963_200_000);
  assert.equal(body.invoice.match.status, 'PROVISIONAL');
  assert.equal(body.detail.ledgerAmountMinor, 58_962_550_000);
});

test('invoice detail exposes line items, kuitansi and integrity data', async () => {
  const response = await get('/api/invoices/INV-2026-0150');
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.invoice.totalMinor, 9_346_200_000);
  assert.equal(body.receipts[0].amountMinor, 9_346_200_000);
  assert.equal(body.attachments[0].declaredAmountMinor, 7_546_200_000);
  assert.ok(body.lines.length >= 2);
  assert.ok(body.attachments.some((item: any) => item.kind === 'RECEIPT'));
  assert.ok(body.exceptions.some((item: any) => item.type === 'NOMINAL_VARIANCE'));
  const receiptCheck = body.integrity.checks.find((item: any) => item.key === 'receipts');
  assert.equal(receiptCheck.state, 'pass', 'the kuitansi register agrees with the invoice even though the scanned copy is short');
  assert.equal(body.integrity.status, 'ATTENTION');
});

test('ledger list and drill-down are consistent', async () => {
  const list = await get('/api/transactions?pageSize=5');
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().total, 237);
  const first = list.json().items[0];
  const detail = await get(`/api/transactions/${first.id}`);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().transaction.id, first.id);
});

test('re-imported ledger file is rejected by checksum without inserting rows', async () => {
  const batchesBefore = (await get('/api/imports')).json().total;
  const preview = await importCsv('LEDGER', 'ledger_q4_2026.csv', ctx.tokens.analyst, 'preview');
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().duplicateFile, true);
  assert.equal(preview.json().summary.rowCount, 237);

  const commit = await importCsv('LEDGER', 'ledger_q4_2026.csv');
  assert.equal(commit.statusCode, 200);
  const outcome = commit.json();
  assert.equal(outcome.status, 'DUPLICATE_FILE');
  assert.equal(outcome.duplicateFile, true);
  assert.equal(outcome.summary.valid, 0);
  assert.equal(outcome.runId, null);
  assert.match(outcome.message, /No rows were added/i);

  const batchesAfter = (await get('/api/imports')).json().total;
  assert.equal(batchesAfter, batchesBefore + 1, 'the attempt is recorded but no rows are added');
  assert.equal((await get('/api/transactions?pageSize=5')).json().total, 237);
  assert.equal((await get('/api/dashboard')).json().kpis.openExceptions, 22);
});

test('re-imported receipt file is rejected by checksum', async () => {
  const commit = await importCsv('RECEIPT', 'receipts_q4_2026.csv');
  assert.equal(commit.statusCode, 200);
  assert.equal(commit.json().status, 'DUPLICATE_FILE');
  assert.equal(commit.json().summary.valid, 0);
  const receipts = await get('/api/attachments');
  assert.equal(receipts.statusCode, 200);
});

test('late ledger arrival clears the missing payment and re-runs matching', async () => {
  const before = (await get('/api/dashboard')).json();
  assert.equal(before.kpis.missingPayments, 6);

  const commit = await importCsv('LEDGER', 'ledger_late_arrival.csv');
  assert.equal(commit.statusCode, 201, commit.body);
  const outcome = commit.json();
  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(outcome.summary.valid, 1);
  assert.equal(outcome.summary.duplicates, 0);
  assert.ok(outcome.runId);
  assert.equal(outcome.run.missingPayments, 5);
  assert.equal(outcome.run.exceptionsOpen, 21);
  assert.equal(outcome.run.autoCleared, 1);
  assert.equal(outcome.run.exactMatches, 229);
  assert.equal(outcome.run.matchedRate, 91.6);

  const after = (await get('/api/dashboard')).json();
  assert.equal(after.kpis.missingPayments, 5);
  assert.equal(after.kpis.openExceptions, 21);

  const resolved = await get('/api/exceptions?status=ALL&q=INV-2026-0018');
  const case18 = resolved.json().items.find((item: any) => item.invoiceNumber === 'INV-2026-0018');
  assert.equal(case18.status, 'RESOLVED');
  assert.equal(case18.resolutionCode, 'AUTO_CLEARED');
});

test('the late arrival file is itself idempotent', async () => {
  const commit = await importCsv('LEDGER', 'ledger_late_arrival.csv');
  assert.equal(commit.statusCode, 200);
  assert.equal(commit.json().status, 'DUPLICATE_FILE');
  assert.equal(commit.json().runId, null);
  assert.equal((await get('/api/dashboard')).json().kpis.openExceptions, 21);
});

test('resolution enforces note length, role and supervisor threshold', async () => {
  const queue = await get('/api/exceptions?status=ACTIVE&q=INV-2026-0035');
  const caseId = queue.json().items[0].id;

  const shortNote = await patch(`/api/exceptions/${caseId}`, {
    status: 'RESOLVED',
    resolutionCode: 'EVIDENCE_ACCEPTED',
    note: 'short',
  });
  assert.equal(shortNote.statusCode, 422);
  assert.equal(shortNote.json().error.code, 'NOTE_REQUIRED');

  const analyst = await patch(`/api/exceptions/${caseId}`, {
    status: 'RESOLVED',
    resolutionCode: 'WRITTEN_OFF',
    note: 'Bank fee verified with treasury and written off.',
  });
  assert.equal(analyst.statusCode, 403);
  assert.equal(analyst.json().error.code, 'SUPERVISOR_APPROVAL_REQUIRED');

  const resolve = await patch(`/api/exceptions/${caseId}`, {
    status: 'RESOLVED',
    resolutionCode: 'EVIDENCE_ACCEPTED',
    note: 'Correspondent fee confirmed by treasury advice.',
  });
  assert.equal(resolve.statusCode, 200);
  assert.equal(resolve.json().exception.status, 'RESOLVED');

  const reopen = await patch(`/api/exceptions/${caseId}`, { status: 'OPEN', note: 'Reopened for re-check.' });
  assert.equal(reopen.statusCode, 200);
  assert.equal(reopen.json().exception.status, 'OPEN');
});

test('supervisors can resolve high-value adjustments; auditors cannot mutate', async () => {
  const queue = await get('/api/exceptions?status=ACTIVE&q=INV-2026-0059');
  const caseId = queue.json().items[0].id;

  const supervisor = await patch(
    `/api/exceptions/${caseId}`,
    {
      status: 'RESOLVED',
      resolutionCode: 'ADJUSTED',
      note: 'Retry confirmed by treasury; recovery scheduled.',
    },
    ctx.tokens.supervisor,
  );
  assert.equal(supervisor.statusCode, 200);
  assert.equal(supervisor.json().exception.status, 'RESOLVED');

  const nominal = await get('/api/exceptions?status=ACTIVE&q=INV-2026-0062');
  const auditor = await patch(
    `/api/exceptions/${nominal.json().items[0].id}`,
    { status: 'RESOLVED', resolutionCode: 'FALSE_POSITIVE', note: 'Auditor should not be able to do this.' },
    ctx.tokens.auditor,
  );
  assert.equal(auditor.statusCode, 403);
  assert.equal(auditor.json().error.code, 'FORBIDDEN');
});

test('auditors are blocked from imports and manual runs but can read', async () => {
  const importAttempt = await importCsv('LEDGER', 'ledger_q4_2026.csv', ctx.tokens.auditor);
  assert.equal(importAttempt.statusCode, 403);
  const runAttempt = await app.inject({
    method: 'POST',
    url: '/api/reconciliation/run',
    headers: auth(ctx.tokens.auditor),
  });
  assert.equal(runAttempt.statusCode, 403);
  const report = await get('/api/reports/nominal-accuracy', ctx.tokens.auditor);
  assert.equal(report.statusCode, 200);
});

test('attachment SHA-256 dedupe reuses the existing document', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  const firstForm = multipart(
    { kind: 'EVIDENCE', invoiceNumber: 'INV-2026-0062', declaredAmount: '100000' },
    { filename: 'qa-evidence.png', contentType: 'image/png', buffer: png },
  );
  const first = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: { ...auth(), 'content-type': `multipart/form-data; boundary=${firstForm.boundary}` },
    payload: firstForm.payload,
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().duplicate, false);

  const secondForm = multipart(
    { kind: 'EVIDENCE', invoiceNumber: 'INV-2026-0062', declaredAmount: '100000' },
    { filename: 'qa-evidence-copy.png', contentType: 'image/png', buffer: png },
  );
  const second = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: { ...auth(), 'content-type': `multipart/form-data; boundary=${secondForm.boundary}` },
    payload: secondForm.payload,
  });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().duplicate, true);
  assert.equal(second.json().attachment.id, first.json().attachment.id);
});

test('attachment uploads reject unsupported MIME types', async () => {
  const form = multipart(
    { kind: 'EVIDENCE' },
    { filename: 'malware.exe', contentType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
  );
  const response = await app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: { ...auth(), 'content-type': `multipart/form-data; boundary=${form.boundary}` },
    payload: form.payload,
  });
  assert.equal(response.statusCode, 415);
  assert.equal(response.json().error.code, 'FILE_TYPE_UNSUPPORTED');
});

test('reports produce CSV and nominal accuracy figures', async () => {
  const accuracy = await get('/api/reports/nominal-accuracy');
  assert.equal(accuracy.statusCode, 200);
  const body = accuracy.json();
  assert.equal(body.invoiceCount, 250);
  assert.equal(body.formulaFailures, 1);
  assert.equal(body.accuracyRate, 99.6);
  assert.equal(body.matchStats.exact + body.matchStats.provisional, 233);

  const closePack = await get('/api/reports/close-pack');
  assert.equal(closePack.statusCode, 200);
  assert.match(String(closePack.headers['content-type']), /text\/csv/);
  assert.match(closePack.body.split('\n')[0], /invoice_number,vendor_code/);
  assert.ok(closePack.body.split('\n').length > 200);

  const exceptions = await get('/api/reports/exceptions.csv');
  assert.equal(exceptions.statusCode, 200);
  assert.match(exceptions.body.split('\n')[0], /exception_id,type,severity/);
});

test('settings are supervisor-only and audited', async () => {
  const read = await get('/api/settings');
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().values.amountToleranceMinor, 0);

  const analyst = await patch('/api/settings', { amountToleranceMinor: 100 });
  assert.equal(analyst.statusCode, 403);

  const supervisor = await patch('/api/settings', { amountToleranceMinor: 100 }, ctx.tokens.supervisor);
  assert.equal(supervisor.statusCode, 200);
  assert.equal(supervisor.json().values.amountToleranceMinor, 100);

  const audit = await get('/api/audit?q=SETTINGS_UPDATED');
  assert.ok(audit.json().items.some((item: any) => item.action === 'SETTINGS_UPDATED'));
});

test('exception history records every disposition', async () => {
  const audit = await get('/api/audit?q=EXCEPTION_');
  const actions = new Set(audit.json().items.map((item: any) => item.action));
  assert.ok(actions.has('EXCEPTION_RESOLVED'));
  assert.ok(actions.has('EXCEPTION_REOPENED'));
});
