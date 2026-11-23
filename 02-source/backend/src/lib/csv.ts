import { parse } from 'csv-parse/sync';
import { ApiError } from './http.js';

const ALIASES: Record<string, string[]> = {
  transaction_id: ['trx_id', 'transaction_ref', 'reference', 'ref', 'no_transaksi', 'nomor_transaksi', 'transaction'],
  amount: ['nominal', 'jumlah', 'nilai', 'amount_idr', 'paid_amount'],
  value_date: ['date', 'tanggal', 'payment_date', 'tanggal_bayar'],
  vendor_code: ['vendor', 'kode_vendor', 'supplier_code'],
  vendor_name: ['vendor_name', 'supplier', 'nama_vendor'],
  invoice_number: ['invoice_no', 'invoice', 'no_invoice', 'nomor_invoice'],
  issue_date: ['invoice_date', 'tanggal_invoice'],
  due_date: ['due', 'jatuh_tempo', 'tanggal_jatuh_tempo'],
  receipt_number: ['receipt_no', 'no_kuitansi', 'nomor_kuitansi', 'kuitansi'],
  received_date: ['receipt_date', 'tanggal_terima', 'tanggal_kuitansi'],
  payment_ref: ['payment_reference', 'ref_pembayaran', 'payment_id'],
  description: ['memo', 'keterangan', 'remarks', 'note'],
  subtotal: ['dpp', 'sub_total'],
  tax: ['ppn', 'vat', 'pajak'],
  total: ['grand_total', 'total_amount', 'jumlah_total'],
  account_mask: ['account', 'rekening', 'source_account'],
  channel: ['payment_channel', 'metode', 'method'],
};

function canonicalHeader(raw: string): string {
  const base = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  for (const [canonical, variants] of Object.entries(ALIASES)) {
    if (canonical === base || variants.includes(base)) return canonical;
  }
  return base;
}

export interface ParsedCsv {
  headers: string[];
  rawHeaders: string[];
  rows: Array<{ line: number; values: Record<string, string> }>;
}

export function parseCsv(text: string, maxRows: number): ParsedCsv {
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    }) as string[][];
  } catch (error) {
    throw new ApiError(400, 'CSV_PARSE_FAILED', `Could not parse CSV: ${(error as Error).message}`);
  }
  if (records.length === 0) throw new ApiError(400, 'CSV_EMPTY', 'The file contains no rows.');
  const rawHeaders = records[0]!.map((header) => String(header ?? '').trim());
  const headers = rawHeaders.map(canonicalHeader);
  if (headers.every((header) => !header)) throw new ApiError(400, 'CSV_HEADER_MISSING', 'The header row is empty.');
  const dataRows = records.slice(1);
  if (dataRows.length > maxRows) {
    throw new ApiError(413, 'CSV_TOO_LARGE', `The file exceeds the ${maxRows.toLocaleString('en-US')} row limit.`);
  }
  const rows = dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row, index) => {
      const values: Record<string, string> = {};
      headers.forEach((header, column) => {
        if (header) values[header] = String(row[column] ?? '').trim();
      });
      return { line: index + 2, values };
    });
  return { headers, rawHeaders, rows };
}

export function requireHeaders(headers: string[], required: string[]): void {
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new ApiError(400, 'CSV_COLUMNS_MISSING', `Missing required column(s): ${missing.join(', ')}.`, { missing });
  }
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
