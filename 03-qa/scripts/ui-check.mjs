import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.WEB_BASE ?? 'http://localhost:5173';
const samples = resolve(fileURLToPath(new URL('../../02-source/backend/data/sample/', import.meta.url)));
const ledgerFile = resolve(samples, 'ledger_q4_2026.csv');
const lateFile = resolve(samples, 'ledger_late_arrival.csv');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const passed = [];
const consoleIssues = [];
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed.push(name);
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function step(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name} — ${error.message}`);
  }
}

async function visibleText(text, timeout = 8000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
  return true;
}

page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && !text.includes('401 (Unauthorized)')) consoleIssues.push(text);
});
page.on('pageerror', (error) => consoleIssues.push(error.message));

try {
  await step('Login', async () => {
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    check('login copy renders', await page.getByText('Payment reconciliation control room').isVisible());

    await page.getByLabel('WORK EMAIL').fill('rani@bcn.co.id');
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.getByRole('button', { name: /enter workspace/i }).click();
    await page.locator('[role="alert"]').waitFor({ state: 'visible' });
    check('bad password surfaces an inline error', (await page.locator('[role="alert"]').innerText()).toLowerCase().includes('incorrect'));

    await page.locator('input[type="password"]').fill('laras2026');
    await page.getByRole('button', { name: /enter workspace/i }).click();
    await page.waitForURL(`${base}/`, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await visibleText('91,2%');
    check('analyst lands on the dashboard with canonical coverage', true);
    check('open exception total is 22', await page.getByText('22', { exact: true }).first().isVisible());
  });

  await step('Exception queue', async () => {
    await page.locator('.nav-link', { hasText: 'Exception queue' }).click();
    await page.waitForURL(`${base}/exceptions`);
    await page.locator('.exception-table tbody tr').first().waitFor();
    check('queue renders rows', (await page.locator('.exception-table tbody tr').count()) > 0);

    await page.getByPlaceholder(/Search title, invoice or transaction ref/i).fill('INV-2026-0018');
    await page.waitForLoadState('networkidle');
    await page.locator('.exception-table tbody tr').first().click();
    await page.locator('.case-head').waitFor();
    check('case drawer opens on the missing payment', await page.getByText('INV-2026-0018').first().isVisible());
    check('drawer shows the evidence values', await page.getByText('Evidence values').first().isVisible());
    await page.keyboard.press('Escape');
    await page.locator('.case-head').waitFor({ state: 'hidden' }).catch(() => {});
  });

  await step('Invoice detail & kuitansi', async () => {
    await page.locator('.nav-link', { hasText: 'Invoices' }).click();
    await page.waitForURL(`${base}/invoices`);
    await page.locator('.invoice-table tbody tr').first().waitFor();
    await page.getByLabel('Search invoices').fill('INV-2026-0150');
    await page.waitForLoadState('networkidle');
    await page.locator('.invoice-table tbody tr').first().click();
    await page.waitForURL(/\/invoices\/INV-2026-0150/);
    await page.waitForLoadState('networkidle');
    await visibleText('Subtotal + PPN equals stated total');
    check('invoice page shows the integrity checklist', true);
    check('kuitansi register section renders', await page.getByText(/Kuitansi & supporting documents/i).isVisible());
    await visibleText('Rp 75.462.000');
    check('attachment declares the short nominal', true);
  });

  await step('Ledger explorer', async () => {
    await page.locator('.nav-link', { hasText: 'Ledger' }).click();
    await page.waitForURL(`${base}/ledger`);
    await page.locator('tbody tr').first().waitFor();
    check('ledger rows render', (await page.locator('tbody tr').count()) > 5);
    check('ledger total is 237 rows', await page.getByText(/237/).first().isVisible());
  });

  await step('Imports — duplicate-safe replay', async () => {
    await page.locator('.nav-link', { hasText: 'Imports' }).click();
    await page.waitForURL(`${base}/imports`);
    await page.locator('input[type=file]').setInputFiles(ledgerFile);
    await page.getByRole('button', { name: /validate file/i }).click();
    await visibleText('This file was imported before');
    check('preview flags the exact checksum', true);

    await page.getByRole('button', { name: /record duplicate attempt/i }).click();
    await visibleText('This exact file is already reconciled');
    check('commit reports DUPLICATE_FILE without inserts', await page.getByText('0 valid').isVisible());

    await page.getByRole('button', { name: 'Remove file' }).click();
  });

  await step('Imports — late ledger arrival', async () => {
    await page.locator('input[type=file]').setInputFiles(lateFile);
    await page.getByRole('button', { name: /validate file/i }).click();
    await visibleText('1 ready');
    await page.getByRole('button', { name: /commit 1 rows/i }).click();
    await visibleText('Import committed');
    check('late arrival auto-clears the exception', await page.getByText('1 auto-cleared').isVisible());
    check('coverage rises to 91,6%', await page.getByText('91,6%').first().isVisible());
  });

  await step('Dashboard after the run', async () => {
    await page.locator('.nav-link', { hasText: 'Overview' }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForLoadState('networkidle');
    await visibleText('5 missing');
    check('missing payments drop to 5', true);
    await page.reload({ waitUntil: 'networkidle' });
    check('figures survive reload', await page.getByText('5 missing').isVisible());
  });

  await step('Reports & audit', async () => {
    await page.locator('.nav-link', { hasText: 'Reports & close' }).click();
    await page.waitForURL(`${base}/reports`);
    await visibleText('Nominal integrity');
    check('close pack hero renders 250 invoices', await page.getByText(/250 invoices checked/i).isVisible());

    await page.locator('.nav-link', { hasText: 'Audit trail' }).click();
    await page.waitForURL(`${base}/audit`);
    await page.locator('.audit-event').first().waitFor({ timeout: 15000 });
    check('audit feed lists recent events', (await page.locator('.audit-event').count()) > 0);
    check('import batch was audited', await page.getByText(/import/i).first().isVisible());
  });

  await step('Controls read-only for analysts', async () => {
    await page.locator('.nav-link', { hasText: 'Controls' }).click();
    await page.waitForURL(`${base}/settings`);
    await visibleText('Only the operations supervisor can change controls');
    check('analyst sees the read-only banner', true);
  });

  await step('Auditor experience', async () => {
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/);
    await page.getByLabel('WORK EMAIL').fill('ayu@bcn.co.id');
    await page.locator('input[type="password"]').fill('laras2026');
    await page.getByRole('button', { name: /enter workspace/i }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForLoadState('networkidle');
    check('auditor cannot see Controls in the nav', (await page.locator('.nav-link', { hasText: 'Controls' }).count()) === 0);

    await page.locator('.nav-link', { hasText: 'Imports' }).click();
    await page.waitForURL(`${base}/imports`);
    await visibleText('Auditors can review batches but cannot import data');
    check('auditor sees the import read-only banner', await page.locator('input[type=file]').count() === 0);
  });

  await step('Mobile viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('mobile dashboard has no horizontal overflow', overflow <= 2, `overflow ${overflow}px`);
    check('mobile navigation trigger is visible', await page.getByRole('button', { name: /open navigation/i }).isVisible());
  });

  await step('Error envelope', async () => {
    const res = await page.request.get('http://127.0.0.1:4100/api/nope');
    const body = await res.json();
    check('unknown API route returns the structured envelope', body?.error?.code === 'NOT_FOUND', JSON.stringify(body));
  });
} finally {
  console.log(`\n${passed.length} checks passed, ${failed} failed`);
  if (consoleIssues.length) {
    console.log('\nBrowser console errors:');
    for (const issue of [...new Set(consoleIssues)]) console.log(`  - ${issue}`);
  } else {
    console.log('No browser console errors.');
  }
  await browser.close();
}

process.exitCode = failed > 0 || consoleIssues.length > 0 ? 1 : 0;
