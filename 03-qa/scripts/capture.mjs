import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.WEB_BASE ?? 'http://localhost:5173';
const samples = resolve(fileURLToPath(new URL('../../02-source/backend/data/sample/', import.meta.url)));
const out = fileURLToPath(new URL('../evidence/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

const issues = [];
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.includes('favicon')) issues.push(`requestfailed: ${url} ${request.failure()?.errorText}`);
});

async function shot(name, options = {}) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}${name}.png`, ...options });
  console.log(`captured ${name}`);
}

await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await shot('01-login');

await page.getByLabel('WORK EMAIL').fill('rani@bcn.co.id');
await page.locator('input[type="password"]').fill('laras2026');
await page.getByRole('button', { name: /enter workspace/i }).click();
await page.waitForURL(`${base}/`);
await page.waitForLoadState('networkidle');
await shot('02-dashboard', { fullPage: true });

await page.goto(`${base}/exceptions`, { waitUntil: 'networkidle' });
await shot('03-exceptions', { fullPage: true });
await page.locator('.exception-table tbody tr').first().click();
await page.waitForSelector('.case-head');
await shot('04-exception-drawer', { fullPage: false });
await page.keyboard.press('Escape');

await page.getByPlaceholder(/Search title, invoice or transaction ref/i).fill('INV-2026-0018');
await page.waitForLoadState('networkidle');
await page.locator('.exception-table tbody tr').first().click();
await page.waitForSelector('.case-head');
await shot('05-missing-payment', { fullPage: false });
await page.keyboard.press('Escape');

await page.goto(`${base}/invoices`, { waitUntil: 'networkidle' });
await shot('06-invoices', { fullPage: true });
await page.getByLabel('Search invoices').fill('INV-2026-0150');
await page.waitForLoadState('networkidle');
await page.locator('.invoice-table tbody tr').first().click();
await page.waitForURL(/\/invoices\/.+/);
await page.waitForLoadState('networkidle');
await shot('07-invoice-detail', { fullPage: true });

await page.goto(`${base}/ledger`, { waitUntil: 'networkidle' });
await shot('08-ledger', { fullPage: true });

await page.goto(`${base}/imports`, { waitUntil: 'networkidle' });
await shot('09-imports', { fullPage: true });

await page.goto(`${base}/reports`, { waitUntil: 'networkidle' });
await shot('10-reports', { fullPage: true });

await page.goto(`${base}/audit`, { waitUntil: 'networkidle' });
await shot('11-audit', { fullPage: true });

await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
await shot('12-settings', { fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await shot('13-dashboard-mobile', { fullPage: true });
await page.setViewportSize({ width: 1440, height: 1000 });

await page.goto(`${base}/imports`, { waitUntil: 'networkidle' });
await page.locator('input[type=file]').setInputFiles(resolve(samples, 'ledger_q4_2026.csv'));
await page.getByRole('button', { name: /validate file/i }).click();
await page.getByText('This file was imported before').waitFor();
await shot('14-import-duplicate', { fullPage: true });

await page.getByRole('button', { name: /record duplicate attempt/i }).click();
await page.getByText('This exact file is already reconciled').waitFor();
await shot('15-import-duplicate-outcome', { fullPage: true });
await page.getByRole('button', { name: 'Remove file' }).click();

await page.locator('input[type=file]').setInputFiles(resolve(samples, 'ledger_late_arrival.csv'));
await page.getByRole('button', { name: /validate file/i }).click();
await page.getByText('1 ready').waitFor();
await page.getByRole('button', { name: /commit 1 rows/i }).click();
await page.getByText('Import committed').first().waitFor();
await page.waitForTimeout(600);
await shot('16-import-late-arrival', { fullPage: true });

await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await shot('17-dashboard-after-run', { fullPage: true });

console.log(issues.length ? `\nUI issues:\n${issues.join('\n')}` : '\nNo console or network errors observed.');
await browser.close();
