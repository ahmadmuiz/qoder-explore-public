PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ANALYST', 'SUPERVISOR', 'AUDITOR')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  bank_name     TEXT NOT NULL,
  account_mask  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('LEDGER', 'INVOICE', 'RECEIPT')),
  file_name       TEXT NOT NULL,
  checksum        TEXT NOT NULL,
  row_count       INTEGER NOT NULL DEFAULT 0,
  inserted_count  INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  invalid_count   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,
  imported_by     TEXT REFERENCES users(id),
  run_id          TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_checksum ON import_batches(checksum);
CREATE INDEX IF NOT EXISTS idx_batches_created ON import_batches(created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  invoice_number  TEXT NOT NULL UNIQUE,
  vendor_id       TEXT NOT NULL REFERENCES vendors(id),
  issue_date      TEXT NOT NULL,
  due_date        TEXT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'IDR',
  subtotal_minor  INTEGER NOT NULL,
  tax_minor       INTEGER NOT NULL DEFAULT 0,
  total_minor     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'OPEN',
  payment_ref     TEXT,
  description     TEXT,
  source_batch_id TEXT REFERENCES import_batches(id),
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id               TEXT PRIMARY KEY,
  invoice_id       TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no          INTEGER NOT NULL,
  description      TEXT NOT NULL,
  qty              INTEGER NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  amount_minor     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lines_invoice ON invoice_lines(invoice_id, line_no);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id             TEXT PRIMARY KEY,
  batch_id       TEXT REFERENCES import_batches(id),
  transaction_id TEXT NOT NULL,
  normalized_ref TEXT NOT NULL,
  amount_minor   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'IDR',
  value_date     TEXT NOT NULL,
  vendor_id      TEXT REFERENCES vendors(id),
  invoice_number TEXT,
  account_mask   TEXT NOT NULL,
  channel        TEXT NOT NULL,
  description    TEXT,
  row_hash       TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'UNMATCHED',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_transactions(normalized_ref);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_transactions(value_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_status ON ledger_transactions(status);

CREATE TABLE IF NOT EXISTS receipts (
  id               TEXT PRIMARY KEY,
  batch_id         TEXT REFERENCES import_batches(id),
  receipt_number   TEXT NOT NULL,
  invoice_number   TEXT NOT NULL,
  vendor_id        TEXT NOT NULL REFERENCES vendors(id),
  amount_minor     INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'IDR',
  received_date    TEXT NOT NULL,
  attachment_id    TEXT,
  row_hash         TEXT NOT NULL UNIQUE,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON receipts(invoice_number);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor ON receipts(vendor_id);

CREATE TABLE IF NOT EXISTS attachments (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK (kind IN ('RECEIPT', 'INVOICE', 'EVIDENCE')),
  file_name             TEXT NOT NULL,
  mime                  TEXT NOT NULL,
  size_bytes            INTEGER NOT NULL,
  sha256                TEXT NOT NULL UNIQUE,
  storage_path          TEXT NOT NULL,
  declared_amount_minor INTEGER,
  linked_invoice_number TEXT,
  linked_transaction_ref TEXT,
  linked_exception_id  TEXT,
  uploaded_by           TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attach_invoice ON attachments(linked_invoice_number);
CREATE INDEX IF NOT EXISTS idx_attach_exception ON attachments(linked_exception_id);

CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  trigger      TEXT NOT NULL,
  status       TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  stats_json   TEXT NOT NULL DEFAULT '{}',
  triggered_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

CREATE TABLE IF NOT EXISTS matches (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL,
  ledger_id          TEXT NOT NULL REFERENCES ledger_transactions(id),
  invoice_id         TEXT NOT NULL REFERENCES invoices(id),
  status             TEXT NOT NULL CHECK (status IN ('EXACT', 'TOLERANCE', 'PROVISIONAL')),
  amount_delta_minor INTEGER NOT NULL DEFAULT 0,
  confidence         INTEGER NOT NULL,
  matched_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_invoice ON matches(invoice_id);
CREATE INDEX IF NOT EXISTS idx_matches_ledger ON matches(ledger_id);

CREATE TABLE IF NOT EXISTS exceptions (
  id               TEXT PRIMARY KEY,
  fingerprint      TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL,
  severity         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'OPEN',
  transaction_ref  TEXT,
  invoice_number   TEXT,
  vendor_id        TEXT REFERENCES vendors(id),
  amount_minor     INTEGER NOT NULL DEFAULT 0,
  delta_minor      INTEGER NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'IDR',
  title            TEXT NOT NULL,
  detail_json      TEXT NOT NULL DEFAULT '{}',
  assignee_id      TEXT REFERENCES users(id),
  resolution_code  TEXT,
  resolution_note  TEXT,
  resolved_by      TEXT REFERENCES users(id),
  resolved_at      TEXT,
  first_seen_run   TEXT,
  last_seen_run    TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status, severity);
CREATE INDEX IF NOT EXISTS idx_exceptions_type ON exceptions(type);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  actor_id    TEXT REFERENCES users(id),
  actor_name  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  summary     TEXT NOT NULL,
  meta_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Treasury & corporate financing reconciliation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS treasury_counterparties (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  party_type TEXT NOT NULL CHECK (party_type IN ('BANK', 'CORPORATE', 'GOVERNMENT', 'BROKER', 'CUSTODIAN', 'MULTILATERAL')),
  rating     TEXT,
  country    TEXT NOT NULL DEFAULT 'ID',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_deals (
  id                TEXT PRIMARY KEY,
  deal_ref          TEXT NOT NULL UNIQUE,
  category          TEXT NOT NULL CHECK (category IN (
                      'MM_CALL', 'TIME_DEPOSIT', 'REPO', 'GOV_BOND', 'CORP_BOND',
                      'FX_SPOT', 'FX_FORWARD', 'FX_SWAP', 'IRS',
                      'CORPORATE_LOAN', 'SYNDICATED_LOAN', 'PROJECT_FINANCE', 'TRADE_FINANCE')),
  instrument_code   TEXT NOT NULL,
  direction         TEXT NOT NULL,
  counterparty_id   TEXT NOT NULL REFERENCES treasury_counterparties(id),
  trade_date        TEXT NOT NULL,
  value_date        TEXT NOT NULL,
  maturity_date     TEXT,
  currency          TEXT NOT NULL,
  notional_minor    INTEGER NOT NULL,
  notional_idr_minor INTEGER NOT NULL,
  fx_rate           REAL,
  rate_bps          INTEGER,
  price             REAL,
  coupon_bps        INTEGER,
  tenor_days        INTEGER,
  portfolio         TEXT NOT NULL,
  desk              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('OPEN', 'MATURED', 'SETTLED', 'CANCELLED')),
  source_system     TEXT NOT NULL DEFAULT 'QUANTUM',
  economic_key      TEXT NOT NULL,
  duplicate_of      TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasury_deals_category ON treasury_deals(category, value_date DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_deals_counterparty ON treasury_deals(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_treasury_deals_economic ON treasury_deals(economic_key);
CREATE INDEX IF NOT EXISTS idx_treasury_deals_value ON treasury_deals(value_date DESC);

CREATE TABLE IF NOT EXISTS treasury_legs (
  id                TEXT PRIMARY KEY,
  deal_id           TEXT NOT NULL REFERENCES treasury_deals(id) ON DELETE CASCADE,
  leg_no            INTEGER NOT NULL,
  leg_type          TEXT NOT NULL CHECK (leg_type IN ('PRINCIPAL', 'INTEREST', 'COUPON', 'FEE', 'FX_NEAR', 'FX_FAR', 'DRAWDOWN', 'REPAYMENT')),
  direction         TEXT NOT NULL CHECK (direction IN ('PAY', 'RECEIVE')),
  currency          TEXT NOT NULL,
  amount_minor      INTEGER NOT NULL,
  amount_idr_minor  INTEGER NOT NULL,
  value_date        TEXT NOT NULL,
  account_mask      TEXT NOT NULL,
  settlement_ref    TEXT,
  status            TEXT NOT NULL CHECK (status IN ('EXPECTED', 'SETTLED', 'FAILED')),
  created_at        TEXT NOT NULL,
  UNIQUE (deal_id, leg_no)
);
CREATE INDEX IF NOT EXISTS idx_treasury_legs_deal ON treasury_legs(deal_id, leg_no);
CREATE INDEX IF NOT EXISTS idx_treasury_legs_date ON treasury_legs(value_date);

CREATE TABLE IF NOT EXISTS treasury_documents (
  id                TEXT PRIMARY KEY,
  deal_id           TEXT NOT NULL REFERENCES treasury_deals(id) ON DELETE CASCADE,
  doc_type          TEXT NOT NULL CHECK (doc_type IN (
                      'DEAL_LETTER', 'TRADE_CONFIRMATION', 'SETTLEMENT_ADVICE', 'REPO_CONFIRMATION',
                      'CUSTODY_STATEMENT', 'BOND_TRADE_CONFIRMATION', 'FX_CONFIRMATION', 'RATE_FIXING',
                      'PAYMENT_ADVICE', 'LOAN_AGREEMENT', 'DRAWDOWN_NOTICE', 'LC_APPLICATION',
                      'SHIPPING_DOCUMENTS')),
  doc_number        TEXT NOT NULL,
  doc_version       INTEGER NOT NULL DEFAULT 1,
  counterparty_id   TEXT REFERENCES treasury_counterparties(id),
  received_at       TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('RECEIVED', 'SUPERSEDED', 'REJECTED')),
  notional_minor    INTEGER,
  currency          TEXT,
  fx_rate           REAL,
  rate_bps          INTEGER,
  price             REAL,
  trade_date        TEXT,
  value_date        TEXT,
  maturity_date     TEXT,
  source            TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  mime              TEXT NOT NULL,
  sha256            TEXT NOT NULL,
  extracted_json    TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasury_docs_deal ON treasury_documents(deal_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_treasury_docs_type ON treasury_documents(doc_type);

CREATE TABLE IF NOT EXISTS treasury_runs (
  id           TEXT PRIMARY KEY,
  trigger      TEXT NOT NULL,
  status       TEXT NOT NULL,
  period_from  TEXT NOT NULL,
  period_to    TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  stats_json   TEXT NOT NULL DEFAULT '{}',
  triggered_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_treasury_runs_started ON treasury_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS treasury_matches (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES treasury_runs(id) ON DELETE CASCADE,
  deal_id         TEXT NOT NULL REFERENCES treasury_deals(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('FULL', 'PARTIAL', 'UNMATCHED')),
  docs_expected   INTEGER NOT NULL,
  docs_received   INTEGER NOT NULL,
  legs_expected   INTEGER NOT NULL,
  legs_matched    INTEGER NOT NULL,
  confidence      INTEGER NOT NULL,
  matched_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasury_matches_run ON treasury_matches(run_id, status);
CREATE INDEX IF NOT EXISTS idx_treasury_matches_deal ON treasury_matches(deal_id);

CREATE TABLE IF NOT EXISTS treasury_breaks (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES treasury_runs(id) ON DELETE CASCADE,
  deal_id        TEXT NOT NULL REFERENCES treasury_deals(id) ON DELETE CASCADE,
  break_type     TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'IGNORED')),
  field_name     TEXT,
  expected_value TEXT,
  actual_value   TEXT,
  amount_minor   INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'IDR',
  detail_json    TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasury_breaks_run ON treasury_breaks(run_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_treasury_breaks_deal ON treasury_breaks(deal_id);
CREATE INDEX IF NOT EXISTS idx_treasury_breaks_type ON treasury_breaks(break_type);
