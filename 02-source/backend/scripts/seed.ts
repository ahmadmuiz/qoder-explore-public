import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, initDb, one, run, all } from '../src/db/index.js';
import { config } from '../src/config.js';
import { addDays, nowIso } from '../src/lib/dates.js';
import { hashPassword } from '../src/lib/security.js';
import { newId, sha256Hex } from '../src/lib/ids.js';
import { seedSettings } from '../src/lib/settings.js';
import { commitImport } from '../src/domain/imports.js';
import { runReconciliation } from '../src/domain/engine.js';
import { toCsv } from '../src/lib/csv.js';
import { writeAudit } from '../src/lib/audit.js';

const force = process.argv.includes('--force');
const db = initDb();

if (!force) {
  const existing = one<{ count: number }>('SELECT COUNT(*) AS count FROM invoices')?.count ?? 0;
  if (existing > 0) {
    console.log(`Database already contains ${existing} invoices. Use "npm run seed -- --force" to rebuild the pilot dataset.`);
    process.exit(0);
  }
}

function rupiah(value: number): number {
  return Math.round(value) * 100;
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261116);
const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)]!;
const int = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

if (force) {
  const conn = getDb();
  conn.exec('PRAGMA foreign_keys = OFF');
  for (const table of [
    'audit_events',
    'exceptions',
    'matches',
    'attachments',
    'receipts',
    'ledger_transactions',
    'invoice_lines',
    'invoices',
    'import_batches',
    'runs',
    'settings',
    'vendors',
    'users',
  ]) {
    conn.exec(`DELETE FROM ${table}`);
  }
  conn.exec('PRAGMA foreign_keys = ON');
  rmSync(join(config.uploadsDir, 'seed'), { recursive: true, force: true });
}

const now = nowIso();
const today = config.today;
mkdirSync(join(config.uploadsDir, 'seed'), { recursive: true });
mkdirSync(config.seedDir, { recursive: true });

// ---------------------------------------------------------------------------
// People and vendors
// ---------------------------------------------------------------------------
const passwordHash = hashPassword('laras2026');
const users = [
  { id: 'usr_rani', email: 'rani@bcn.co.id', name: 'Rani Prameswari', title: 'Senior Reconciliation Analyst', role: 'ANALYST' },
  { id: 'usr_dimas', email: 'dimas@bcn.co.id', name: 'Dimas Adiwangsa', title: 'Head of Payment Operations', role: 'SUPERVISOR' },
  { id: 'usr_ayu', email: 'ayu@bcn.co.id', name: 'Ayu Lestari', title: 'Internal Audit', role: 'AUDITOR' },
];
for (const user of users) {
  run(
    'INSERT INTO users (id, email, name, title, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    user.id,
    user.email,
    user.name,
    user.title,
    user.role,
    passwordHash,
    now,
  );
}

const vendors = [
  { code: 'VND-001', name: 'Nusantara Cloudworks', category: 'Technology', bank: 'Bank Mandiri', account: '1370-09-****-2214', base: 380_000_000, items: ['Cloud infrastructure', 'Managed Kubernetes', 'Observability platform', 'Database operations'] },
  { code: 'VND-002', name: 'Sinar Logistik Prima', category: 'Logistics', bank: 'Bank Central Asia', account: '5270-11-****-8841', base: 120_000_000, items: ['Regional freight', 'Warehouse handling', 'Last-mile delivery', 'Cold-chain storage'] },
  { code: 'VND-003', name: 'Cahaya Office Supply', category: 'Facilities', bank: 'Bank Negara Indonesia', account: '0698-22-****-1107', base: 25_000_000, items: ['Office consumables', 'Workstation chairs', 'Pantry supplies', 'Printing paper'] },
  { code: 'VND-004', name: 'Mitra Karya Konsultan', category: 'Professional Services', bank: 'Bank Mandiri', account: '1370-09-****-6620', base: 450_000_000, items: ['Regulatory advisory', 'Process assessment', 'Change management', 'Legal review'] },
  { code: 'VND-005', name: 'Bumi Data Analytics', category: 'Data & Research', bank: 'Bank Permata', account: '8410-07-****-3395', base: 180_000_000, items: ['Market research panel', 'Data licensing', 'Dashboard build', 'Survey operations'] },
  { code: 'VND-006', name: 'Arunika Creative Studio', category: 'Marketing', bank: 'Bank Central Asia', account: '5270-11-****-7712', base: 90_000_000, items: ['Brand campaign production', 'Motion design', 'Photography', 'Copywriting'] },
  { code: 'VND-007', name: 'Selaras Facility Care', category: 'Facilities', bank: 'Bank Rakyat Indonesia', account: '0341-01-****-9088', base: 75_000_000, items: ['Building maintenance', 'HVAC servicing', 'Janitorial services', 'Landscape care'] },
  { code: 'VND-008', name: 'Kirana Print & Packaging', category: 'Printing', bank: 'Bank Negara Indonesia', account: '0698-22-****-5540', base: 35_000_000, items: ['Annual report printing', 'Secure envelopes', 'Branch collateral', 'Event signage'] },
  { code: 'VND-009', name: 'Telaga Security Services', category: 'Security', bank: 'Bank Mandiri', account: '1370-09-****-1183', base: 160_000_000, items: ['Physical guarding', 'CCTV monitoring', 'Access control', 'Security audit'] },
  { code: 'VND-010', name: 'Anantara Travel Management', category: 'Travel', bank: 'Bank Permata', account: '8410-07-****-6621', base: 45_000_000, items: ['Corporate travel desk', 'Airline tickets', 'Hotel programme', 'Ground transport'] },
  { code: 'VND-011', name: 'Pijar Media Network', category: 'Advertising', bank: 'Bank Central Asia', account: '5270-11-****-2109', base: 280_000_000, items: ['Digital media placement', 'Programmatic buying', 'Sponsorship package', 'Content distribution'] },
  { code: 'VND-012', name: 'Lumbung Catering Nusantara', category: 'Catering', bank: 'Bank Rakyat Indonesia', account: '0341-01-****-4402', base: 30_000_000, items: ['Executive lunch service', 'Meeting packages', 'Event catering', 'Office pantry programme'] },
];
interface VendorSeed {
  id: string;
  code: string;
  name: string;
  category: string;
  bank: string;
  account: string;
  base: number;
  items: string[];
}
const vendorByCode = new Map<string, VendorSeed>(
  vendors.map((vendor, index) => [vendor.code, { ...vendor, id: `vnd_${String(index + 1).padStart(3, '0')}` }]),
);
for (const vendor of vendorByCode.values()) {
  run(
    'INSERT INTO vendors (id, code, name, category, bank_name, account_mask, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    vendor.id,
    vendor.code,
    vendor.name,
    vendor.category,
    vendor.bank,
    vendor.account,
    now,
  );
}
seedSettings();

// ---------------------------------------------------------------------------
// Invoice register
// ---------------------------------------------------------------------------
const missingIndices = new Set([17, 52, 88, 129, 176, 214]);
const mismatchIndices = new Map<number, 'fee' | 'over' | 'partial' | 'under'>([
  [34, 'fee'],
  [76, 'over'],
  [143, 'partial'],
  [197, 'under'],
]);
const duplicatePaymentIndices = new Set([58, 156]);
const futureIndices = new Set<number>();
for (let i = 238; i < 250; i += 1) futureIndices.add(i);
const nominalTotalIndex = 61;
const lineSumIndex = 103;
const receiptVarianceIndex = 137;
const attachmentVarianceIndex = 149;
const duplicateReceiptIndex = 92;
const overrides = new Map<number, number>([
  [52, 1_200_000_000],
  [58, 1_150_000_000],
  [143, 1_280_000_000],
  [156, 420_000_000],
  [176, 820_000_000],
]);

const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const accounts = ['8820-01-****-4471', '8820-01-****-9920', '7710-09-****-1204'];
const channels = ['RTGS', 'BCN Transfer', 'Virtual Account', 'BCN Transfer'];

interface InvoiceSeed {
  index: number;
  id: string;
  number: string;
  vendor: VendorSeed;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  tax: number;
  total: number;
  ref: string | null;
  paid: boolean;
  payDate: string;
  ledgerAmount: number;
  receiptAmount: number;
  description: string;
  lines: Array<{ description: string; qty: number; unitPrice: number; amount: number }>;
}

const invoiceSeeds: InvoiceSeed[] = [];
const insertInvoice = db.prepare(
  `INSERT INTO invoices (id, invoice_number, vendor_id, issue_date, due_date, currency, subtotal_minor, tax_minor, total_minor, status, payment_ref, description, source_batch_id, created_at)
   VALUES (?, ?, ?, ?, ?, 'IDR', ?, ?, ?, 'OPEN', ?, ?, NULL, ?)`,
);
const insertLine = db.prepare(
  `INSERT INTO invoice_lines (id, invoice_id, line_no, description, qty, unit_price_minor, amount_minor) VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

for (let index = 0; index < 250; index += 1) {
  const vendor = vendors[index % vendors.length]!;
  const vendorRecord = vendorByCode.get(vendor.code)!;
  const offset = 80 - Math.round((index * 76) / 249);
  const issueDate = addDays(today, -offset);
  const term = index % 2 === 0 ? 14 : 30;
  const dueDate = addDays(issueDate, term);
  const sequence = String(1000 + index);
  const month = issueDate.slice(5, 7);
  const ref = index === 214 ? null : `TRX/${issueDate.slice(0, 4)}/${month}/${sequence}`;

  let subtotal = roundTo((overrides.get(index) ?? vendor.base) * (0.55 + random() * 1.5), 100_000);
  subtotal = Math.min(subtotal, 1_900_000_000);
  const tax = Math.round((subtotal * 0.11) / 100) * 100;
  let total = subtotal + tax;

  const lineCount = random() > 0.55 ? 3 : 2;
  const lineAmounts: number[] = [];
  if (lineCount === 2) {
    const first = roundTo(subtotal * 0.62, 100_000);
    lineAmounts.push(first, subtotal - first);
  } else {
    const first = roundTo(subtotal * 0.52, 100_000);
    const second = roundTo(subtotal * 0.28, 100_000);
    lineAmounts.push(first, second, subtotal - first - second);
  }
  const lines = lineAmounts.map((amount, lineIndex) => ({
    description: vendor.items[(index + lineIndex) % vendor.items.length]!,
    qty: 1,
    unitPrice: amount,
    amount,
  }));
  if (index === lineSumIndex) lines[0]!.amount += 12_500_000;
  if (index === nominalTotalIndex) total += 25_000_000;

  const paid = !missingIndices.has(index) && !futureIndices.has(index);
  let payDate = addDays(dueDate, -3);
  if (payDate > addDays(today, -1)) payDate = addDays(today, -2);
  if (payDate < issueDate) payDate = addDays(issueDate, 1);
  if (payDate > today) payDate = today;

  let ledgerAmount = total;
  const mismatch = mismatchIndices.get(index);
  if (mismatch === 'fee') ledgerAmount = total - 6_500;
  if (mismatch === 'over') ledgerAmount = total + 2_500_000;
  if (mismatch === 'partial') ledgerAmount = Math.round((total * 0.8) / 1_000) * 1_000;
  if (mismatch === 'under') ledgerAmount = total - 1_250_000;

  let receiptAmount = total;
  if (index === receiptVarianceIndex) receiptAmount = total - 5_000_000;

  const invoiceNumber = `INV-2026-${String(index + 1).padStart(4, '0')}`;
  const description = `${vendor.category} services — ${months[Number(month) - 1]} ${issueDate.slice(0, 4)}`;
  const id = newId('inv');

  insertInvoice.run(
    id,
    invoiceNumber,
    vendorRecord.id,
    issueDate,
    dueDate,
    rupiah(subtotal),
    rupiah(tax),
    rupiah(total),
    ref,
    description,
    now,
  );
  lines.forEach((line, lineIndex) => {
    insertLine.run(
      newId('lin'),
      id,
      lineIndex + 1,
      line.description,
      line.qty,
      rupiah(line.amount),
      rupiah(line.amount),
    );
  });

  invoiceSeeds.push({
    index,
    id,
    number: invoiceNumber,
    vendor: vendorRecord,
    issueDate,
    dueDate,
    subtotal,
    tax,
    total,
    ref,
    paid,
    payDate,
    ledgerAmount,
    receiptAmount,
    description,
    lines,
  });
}

// ---------------------------------------------------------------------------
// Kuitansi and bank evidence documents
// ---------------------------------------------------------------------------
interface AttachmentSeed {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'EVIDENCE';
  fileName: string;
  mime: string;
  size: number;
  sha256: string;
  path: string;
  declared: number | null;
  invoiceNumber: string;
  transactionRef: string | null;
}

const svgEscape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;

function kuitansiSvg(input: {
  vendorName: string;
  vendorBank: string;
  vendorAccount: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  description: string;
  receiptNumber: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1000" viewBox="0 0 760 1000" role="img" aria-label="Kuitansi ${svgEscape(input.invoiceNumber)}">
  <rect width="760" height="1000" fill="#FBFAF6"/>
  <rect x="0" y="0" width="760" height="118" fill="#0B3D32"/>
  <g transform="translate(48 40)">
    <rect width="38" height="38" rx="10" fill="#D8ED9B"/>
    <path d="M10 27V11h5v16zm8 0V11h4.2c5.4 0 8.6 3 8.6 8s-3.2 8-8.6 8z" fill="#0B3D32"/>
  </g>
  <text x="100" y="58" font-family="Georgia, serif" font-size="19" fill="#F4F1E7" letter-spacing="2">BANK CAKRAWALA NUSANTARA</text>
  <text x="100" y="80" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#A8C4B9" letter-spacing="3">PAYMENT OPERATIONS · JAKARTA</text>
  <text x="48" y="178" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B" letter-spacing="3">KUITANSI PEMBAYARAN</text>
  <text x="48" y="222" font-family="Georgia, serif" font-size="34" fill="#10211B">Bukti penerimaan pembayaran</text>
  <text x="712" y="178" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B">No. ${svgEscape(input.receiptNumber)}</text>
  <text x="712" y="200" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B">${svgEscape(input.date)}</text>

  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B">
    <text x="48" y="286">DITERIMA DARI</text>
    <text x="48" y="316" font-family="Georgia, serif" font-size="21" fill="#10211B">PT Bank Cakrawala Nusantara</text>
    <text x="48" y="340">Divisi Payment Operations — Vendor Settlement</text>
    <text x="48" y="382">DIBAYARKAN KEPADA</text>
    <text x="48" y="412" font-family="Georgia, serif" font-size="21" fill="#10211B">${svgEscape(input.vendorName)}</text>
    <text x="48" y="436">${svgEscape(input.vendorBank)} · ${svgEscape(input.vendorAccount)}</text>
  </g>

  <rect x="48" y="474" width="664" height="176" rx="14" fill="#F1EFE5" stroke="#DDD8C8"/>
  <text x="72" y="510" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#69736B" letter-spacing="2">JUMLAH PEMBAYARAN</text>
  <text x="72" y="558" font-family="Georgia, serif" font-size="44" fill="#0B3D32">${svgEscape(formatRupiah(input.amount))}</text>
  <text x="72" y="592" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#4F5A52">Invoice ${svgEscape(input.invoiceNumber)}</text>
  <text x="72" y="616" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#4F5A52">${svgEscape(input.description)}</text>

  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B">
    <text x="48" y="702">METODE</text>
    <text x="48" y="726" font-size="14" fill="#10211B">RTGS / Bank Cakrawala Transfer</text>
    <text x="400" y="702">TANGGAL NILAI</text>
    <text x="400" y="726" font-size="14" fill="#10211B">${svgEscape(input.date)}</text>
    <text x="48" y="772">REFERENSI INVOICE</text>
    <text x="48" y="796" font-size="14" fill="#10211B">${svgEscape(input.invoiceNumber)}</text>
    <text x="400" y="772">STATUS</text>
    <text x="400" y="796" font-size="14" fill="#0B6B4F">LUNAS / SETTLED</text>
  </g>

  <g transform="rotate(-9 590 700)">
    <rect x="486" y="650" width="188" height="72" rx="8" fill="none" stroke="#0B6B4F" stroke-width="3" opacity="0.55"/>
    <text x="580" y="695" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="27" fill="#0B6B4F" letter-spacing="6" opacity="0.8">LUNAS</text>
  </g>

  <line x1="48" y1="852" x2="330" y2="852" stroke="#C9C4B4"/>
  <text x="48" y="874" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#69736B">Finance — ${svgEscape(input.vendorName)}</text>
  <line x1="430" y1="852" x2="712" y2="852" stroke="#C9C4B4"/>
  <text x="430" y="874" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#69736B">Authorised signatory</text>

  <g transform="translate(48 916)">
    ${Array.from({ length: 36 })
      .map((_, cell) => {
        const x = (cell % 12) * 11;
        const y = Math.floor(cell / 12) * 11;
        const filled = (cell * 7 + input.invoiceNumber.length) % 5 < 2;
        return `<rect x="${x}" y="${y}" width="8" height="8" fill="${filled ? '#0B3D32' : '#D8D3C4'}"/>`;
      })
      .join('')}
  </g>
  <text x="430" y="946" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#8A918A">Dokumen elektronik. Validasi memakai nomor kuitansi dan hash arsip.</text>
  <text x="712" y="946" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#8A918A">BCN-OPS · ${svgEscape(input.date.slice(0, 7))}</text>
</svg>`;
}

function transferSvg(input: { transactionId: string; amount: number; date: string; vendorName: string; account: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1000" viewBox="0 0 760 1000" role="img" aria-label="Bukti transfer">
  <rect width="760" height="1000" fill="#F7F6F1"/>
  <rect x="0" y="0" width="760" height="10" fill="#0B3D32"/>
  <text x="48" y="88" font-family="Georgia, serif" font-size="27" fill="#10211B">Bukti transfer antar bank</text>
  <text x="48" y="118" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B">BCN Corporate Payment Operations · ${svgEscape(input.date)}</text>
  <rect x="48" y="154" width="664" height="132" rx="12" fill="#0B3D32"/>
  <text x="76" y="196" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#A8C4B9" letter-spacing="2">NOMINAL TRANSFER</text>
  <text x="76" y="248" font-family="Georgia, serif" font-size="38" fill="#F4F1E7">${svgEscape(formatRupiah(input.amount))}</text>
  <text x="712" y="196" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#D8ED9B">BERHASIL</text>
  ${[
    ['REFERENSI TRANSAKSI', input.transactionId],
    ['PENERIMA', input.vendorName],
    ['REKENING PENERIMA', input.account],
    ['TANGGAL NILAI', input.date],
    ['METODE', 'RTGS'],
  ]
    .map(
      ([label, value], index) => `<g>
        <text x="48" y="${350 + index * 62}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#69736B" letter-spacing="2">${label}</text>
        <text x="48" y="${378 + index * 62}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#10211B">${svgEscape(value!)}</text>
        <line x1="48" y1="${394 + index * 62}" x2="712" y2="${394 + index * 62}" stroke="#E0DCCE"/>
      </g>`,
    )
    .join('')}
  <text x="48" y="760" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#69736B">Dokumen ini dihasilkan otomatis oleh sistem pembayaran BCN untuk kebutuhan rekonsiliasi.</text>
  <text x="48" y="800" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#8A918A">Hash arsip: ${sha256Hex(input.transactionId + String(input.amount)).slice(0, 32)}</text>
</svg>`;
}

const attachmentSeeds: AttachmentSeed[] = [];
function addAttachment(input: {
  kind: AttachmentSeed['kind'];
  fileName: string;
  content: string;
  declared: number | null;
  invoiceNumber: string;
  transactionRef?: string | null;
  uploadedBy: string;
  createdAt: string;
}): AttachmentSeed {
  const path = join(config.uploadsDir, 'seed', input.fileName);
  writeFileSync(path, input.content, 'utf8');
  const sha = sha256Hex(input.content);
  const seed: AttachmentSeed = {
    id: newId('att'),
    kind: input.kind,
    fileName: input.fileName,
    mime: 'image/svg+xml',
    size: Buffer.byteLength(input.content),
    sha256: sha,
    path,
    declared: input.declared,
    invoiceNumber: input.invoiceNumber,
    transactionRef: input.transactionRef ?? null,
  };
  run(
    `INSERT INTO attachments (id, kind, file_name, mime, size_bytes, sha256, storage_path, declared_amount_minor,
      linked_invoice_number, linked_transaction_ref, linked_exception_id, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    seed.id,
    seed.kind,
    seed.fileName,
    seed.mime,
    seed.size,
    seed.sha256,
    seed.path,
    seed.declared === null ? null : rupiah(seed.declared),
    seed.invoiceNumber,
    seed.transactionRef,
    input.uploadedBy,
    input.createdAt,
  );
  attachmentSeeds.push(seed);
  return seed;
}

const receiptAttachmentInvoices = new Set([10, 61, duplicateReceiptIndex, lineSumIndex, receiptVarianceIndex, attachmentVarianceIndex]);
const attachmentByInvoice = new Map<string, string>();

for (const index of receiptAttachmentInvoices) {
  const invoice = invoiceSeeds[index]!;
  const declared = index === attachmentVarianceIndex ? invoice.total - 18_000_000 : invoice.total;
  const content = kuitansiSvg({
    vendorName: invoice.vendor.name,
    vendorBank: invoice.vendor.bank,
    vendorAccount: invoice.vendor.account,
    invoiceNumber: invoice.number,
    amount: declared,
    date: addDays(invoice.payDate, 2) > today ? today : addDays(invoice.payDate, 2),
    description: invoice.description,
    receiptNumber: `KWT/${invoice.vendor.code}/${invoice.number.slice(-4)}`,
  });
  const attachment = addAttachment({
    kind: 'RECEIPT',
    fileName: `kuitansi-${invoice.number}.svg`,
    content,
    declared,
    invoiceNumber: invoice.number,
    uploadedBy: 'usr_rani',
    createdAt: addDays(today, -Math.min(30, invoice.index % 20)) + 'T10:00:00.000Z',
  });
  attachmentByInvoice.set(invoice.number, attachment.id);
}

for (const index of [58, 143]) {
  const invoice = invoiceSeeds[index]!;
  addAttachment({
    kind: 'EVIDENCE',
    fileName: `bukti-transfer-${invoice.number}.svg`,
    content: transferSvg({
      transactionId: invoice.ref ?? `TRX/${invoice.number}`,
      amount: invoice.ledgerAmount,
      date: invoice.payDate,
      vendorName: invoice.vendor.name,
      account: invoice.vendor.account,
    }),
    declared: null,
    invoiceNumber: invoice.number,
    transactionRef: invoice.ref,
    uploadedBy: 'usr_dimas',
    createdAt: addDays(today, -3) + 'T14:20:00.000Z',
  });
}

// ---------------------------------------------------------------------------
// Ledger and receipts CSV (imported through the real pipeline)
// ---------------------------------------------------------------------------
const ledgerRows: Array<Record<string, unknown>> = [];
for (const invoice of invoiceSeeds) {
  if (!invoice.paid) continue;
  ledgerRows.push({
    transaction_id: invoice.ref,
    amount: invoice.ledgerAmount,
    currency: 'IDR',
    value_date: invoice.payDate,
    vendor_code: invoice.vendor.code,
    invoice_number: invoice.number,
    account_mask: accounts[invoice.index % accounts.length],
    channel: channels[invoice.index % channels.length],
    description: `Settlement ${invoice.number}`,
  });
  if (duplicatePaymentIndices.has(invoice.index)) {
    ledgerRows.push({
      transaction_id: invoice.ref,
      amount: invoice.ledgerAmount,
      currency: 'IDR',
      value_date: addDays(invoice.payDate, 5) > today ? today : addDays(invoice.payDate, 5),
      vendor_code: invoice.vendor.code,
      invoice_number: invoice.number,
      account_mask: accounts[(invoice.index + 1) % accounts.length],
      channel: 'RTGS',
      description: `Retry settlement ${invoice.number}`,
    });
  }
}

const unallocated = [
  { ref: 'TRX/2026/10/9001', amount: 187_500_000, date: addDays(today, -25), vendor: 'VND-002', invoice: 'INV-2026-UNKNOWN-01' },
  { ref: 'TRX/2026/10/9002', amount: 615_000_000, date: addDays(today, -12), vendor: 'VND-004', invoice: 'INV-2026-UNKNOWN-02' },
  { ref: 'TRX/2026/11/9003', amount: 42_750_000, date: addDays(today, -5), vendor: 'VND-003', invoice: '' },
];
for (const row of unallocated) {
  ledgerRows.push({
    transaction_id: row.ref,
    amount: row.amount,
    currency: 'IDR',
    value_date: row.date,
    vendor_code: row.vendor,
    invoice_number: row.invoice,
    account_mask: accounts[0],
    channel: 'BCN Transfer',
    description: 'Incoming settlement without invoice reference',
  });
}

const receiptRows: Array<Record<string, unknown>> = [];
for (const invoice of invoiceSeeds) {
  if (!invoice.paid) continue;
  const receivedDate = addDays(invoice.payDate, 2) > today ? today : addDays(invoice.payDate, 2);
  receiptRows.push({
    receipt_number: `KWT/${invoice.vendor.code}/${invoice.number.slice(-4)}`,
    invoice_number: invoice.number,
    vendor_code: invoice.vendor.code,
    amount: invoice.receiptAmount,
    currency: 'IDR',
    received_date: receivedDate,
  });
  if (invoice.index === duplicateReceiptIndex) {
    receiptRows.push({
      receipt_number: `KWT/${invoice.vendor.code}/${invoice.number.slice(-4)}`,
      invoice_number: invoice.number,
      vendor_code: invoice.vendor.code,
      amount: invoice.receiptAmount,
      currency: 'IDR',
      received_date:
        receivedDate >= today
          ? addDays(today, -1)
          : addDays(receivedDate, 1),
    });
  }
}
receiptRows.push(
  {
    receipt_number: 'KWT/VND-004/ORPH-01',
    invoice_number: 'INV-2026-ORPHAN-01',
    vendor_code: 'VND-004',
    amount: 245_000_000,
    currency: 'IDR',
    received_date: addDays(today, -9),
  },
  {
    receipt_number: 'KWT/VND-009/ORPH-02',
    invoice_number: 'INV-2026-ORPHAN-02',
    vendor_code: 'VND-009',
    amount: 88_500_000,
    currency: 'IDR',
    received_date: addDays(today, -16),
  },
);

const ledgerCsv = toCsv(ledgerRows, [
  'transaction_id',
  'amount',
  'currency',
  'value_date',
  'vendor_code',
  'invoice_number',
  'account_mask',
  'channel',
  'description',
]);
const receiptCsv = toCsv(receiptRows, ['receipt_number', 'invoice_number', 'vendor_code', 'amount', 'currency', 'received_date']);
const ledgerPath = join(config.seedDir, 'ledger_q4_2026.csv');
const receiptPath = join(config.seedDir, 'receipts_q4_2026.csv');
writeFileSync(ledgerPath, ledgerCsv, 'utf8');
writeFileSync(receiptPath, receiptCsv, 'utf8');

const analyst = users[0]!;
const ledgerImport = commitImport({
  source: 'LEDGER',
  fileName: 'ledger_q4_2026.csv',
  buffer: Buffer.from(ledgerCsv, 'utf8'),
  actor: { id: analyst.id, email: analyst.email, name: analyst.name, role: 'ANALYST', title: analyst.title },
  autoRun: false,
});
const receiptImport = commitImport({
  source: 'RECEIPT',
  fileName: 'receipts_q4_2026.csv',
  buffer: Buffer.from(receiptCsv, 'utf8'),
  actor: { id: analyst.id, email: analyst.email, name: analyst.name, role: 'ANALYST', title: analyst.title },
  autoRun: false,
});

for (const [invoiceNumber, attachmentId] of attachmentByInvoice) {
  const firstReceipt = one<{ id: string }>(
    'SELECT id FROM receipts WHERE invoice_number = ? ORDER BY received_date LIMIT 1',
    invoiceNumber,
  );
  if (firstReceipt) run('UPDATE receipts SET attachment_id = ? WHERE id = ?', attachmentId, firstReceipt.id);
}

// A late ledger file used in the demo to clear a missing payment.
const missingInvoice = invoiceSeeds[17]!;
const lateCsv = toCsv(
  [
    {
      transaction_id: missingInvoice.ref,
      amount: missingInvoice.total,
      currency: 'IDR',
      value_date: addDays(today, -1),
      vendor_code: missingInvoice.vendor.code,
      invoice_number: missingInvoice.number,
      account_mask: accounts[2],
      channel: 'RTGS',
      description: `Late settlement ${missingInvoice.number}`,
    },
  ],
  ['transaction_id', 'amount', 'currency', 'value_date', 'vendor_code', 'invoice_number', 'account_mask', 'channel', 'description'],
);
writeFileSync(join(config.seedDir, 'ledger_late_arrival.csv'), lateCsv, 'utf8');

// ---------------------------------------------------------------------------
// Invoice register export (for reference and import testing)
// ---------------------------------------------------------------------------
const invoiceExport = invoiceSeeds.map((invoice) => ({
  invoice_number: invoice.number,
  vendor_code: invoice.vendor.code,
  issue_date: invoice.issueDate,
  due_date: invoice.dueDate,
  currency: 'IDR',
  subtotal: invoice.subtotal,
  tax: invoice.tax,
  total: invoice.total,
  payment_ref: invoice.ref ?? '',
  description: invoice.description,
}));
writeFileSync(
  join(config.seedDir, 'invoice_register_q4_2026.csv'),
  toCsv(invoiceExport, ['invoice_number', 'vendor_code', 'issue_date', 'due_date', 'currency', 'subtotal', 'tax', 'total', 'payment_ref', 'description']),
  'utf8',
);

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------
const result = runReconciliation({
  trigger: 'SEED',
  actor: { id: analyst.id, email: analyst.email, name: analyst.name, role: 'ANALYST', title: analyst.title },
  today,
});

// Backdate exception creation so queue ageing reflects when each item surfaced.
const exceptions = all<{ id: string; invoice_number: string | null; transaction_ref: string | null }>(
  'SELECT id, invoice_number, transaction_ref FROM exceptions WHERE status IN (\'OPEN\', \'IN_REVIEW\')',
);
for (const exception of exceptions) {
  let date: string | null = null;
  if (exception.invoice_number) {
    const invoice = invoiceSeeds.find((candidate) => candidate.number === exception.invoice_number);
    if (invoice) date = addDays(invoice.dueDate, 1);
  }
  if (!date && exception.transaction_ref) {
    const ledger = one<{ value_date: string }>(
      'SELECT value_date FROM ledger_transactions WHERE transaction_id = ? ORDER BY value_date LIMIT 1',
      exception.transaction_ref,
    );
    if (ledger) date = addDays(ledger.value_date, 1);
  }
  if (date) {
    const createdAt = date >= today ? `${today}T08:30:00.000Z` : `${date}T09:15:00.000Z`;
    run('UPDATE exceptions SET created_at = ? WHERE id = ?', createdAt, exception.id);
  }
}

writeAudit({
  actorId: analyst.id,
  actorName: analyst.name,
  action: 'PILOT_DATA_LOADED',
  entityType: 'SYSTEM',
  entityId: null,
  summary: `Pilot dataset loaded: ${invoiceSeeds.length} invoices, ${ledgerRows.length} ledger rows, ${receiptRows.length} receipts.`,
  meta: { runId: result.runId, stats: result.stats },
});

console.log('');
console.log('  LARAS · pilot dataset ready');
console.log('  ─────────────────────────────────────────────');
console.log(`  Invoices        ${invoiceSeeds.length}`);
console.log(`  Ledger rows     ${ledgerRows.length} (imported: ${ledgerImport.summary.valid})`);
console.log(`  Receipts        ${receiptRows.length} (imported: ${receiptImport.summary.valid})`);
console.log(`  Documents       ${attachmentSeeds.length}`);
console.log(`  Run             ${result.runId}`);
console.log(`  Matched         ${result.stats.exactMatches} exact, ${result.stats.toleranceMatches} within tolerance`);
console.log(`  Open exceptions ${result.stats.exceptionsOpen}`);
console.log(`  Missing         ${result.stats.missingPayments} · Duplicates ${result.stats.duplicatePayments} · Mismatch ${result.stats.amountMismatches}`);
console.log('');
console.log('  Sign in: rani@bcn.co.id / laras2026  (analyst)');
console.log('           dimas@bcn.co.id / laras2026 (supervisor)');
console.log('           ayu@bcn.co.id / laras2026   (auditor)');
console.log('');
