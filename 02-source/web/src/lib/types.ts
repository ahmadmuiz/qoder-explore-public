export type Role = 'ANALYST' | 'SUPERVISOR' | 'AUDITOR';

export interface User {
  id: string;
  email: string;
  name: string;
  title: string;
  role: Role;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
}

export interface Dashboard {
  asOf: string;
  period: { from: string; to: string };
  lastRun: { id: string; startedAt: string; finishedAt: string; stats: RunStats } | null;
  kpis: {
    matchedRate: number;
    openExceptions: number;
    valueAtRiskMinor: number;
    reconciledValueMinor: number;
    unresolvedValueMinor: number;
    invoices: number;
    ledgerRows: number;
    missingPayments: number;
    duplicates: number;
    resolved7d: number;
    avgResolutionHours: number | null;
    importsSkipped: number;
  };
  breakdown: Array<{ type: ExceptionType; count: number; valueMinor: number }>;
  severity: Array<{ severity: Severity; count: number }>;
  trend: Array<{ date: string; ledgerCount: number; ledgerValueMinor: number; matchedValueMinor: number; exceptions: number }>;
  runs: Array<{ id: string; startedAt: string; finishedAt: string; trigger: string; matchedRate: number; exceptionsOpen: number; exactMatches: number }>;
  aging: Array<{ bucket: string; count: number }>;
  topVendors: Array<{ id: string; code: string; name: string; count: number; valueMinor: number }>;
  upcoming: { count: number; valueMinor: number };
  recentExceptions: Array<{
    id: string;
    type: ExceptionType;
    severity: Severity;
    title: string;
    invoiceNumber: string | null;
    amountMinor: number;
    status: string;
    createdAt: string;
    vendorName: string | null;
  }>;
}

export type ExceptionType =
  | 'DUPLICATE_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'MISSING_PAYMENT'
  | 'UNALLOCATED_PAYMENT'
  | 'NOMINAL_VARIANCE'
  | 'ORPHAN_RECEIPT'
  | 'DUPLICATE_RECEIPT';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ExceptionStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'IGNORED';

export interface ExceptionItem {
  id: string;
  type: ExceptionType;
  severity: Severity;
  status: ExceptionStatus;
  title: string;
  transactionRef: string | null;
  invoiceNumber: string | null;
  amountMinor: number;
  deltaMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionCode: string | null;
  assigneeId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorCode: string | null;
  assigneeName: string | null;
  reason: string | null;
}

export interface ExceptionSummary {
  types: Array<{ type: ExceptionType; open: number; inReview: number; resolved: number; ignored: number; valueMinor: number }>;
  totals: { open: number; inReview: number; resolved: number; valueMinor: number; assigned: number };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'EXCEPTION' | 'PARTIAL';
  paymentRef: string | null;
  description: string | null;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  paidMinor?: number | null;
  matchStatus?: 'EXACT' | 'TOLERANCE' | 'PROVISIONAL' | null;
  receiptTotalMinor?: number;
  receiptCount?: number;
  openExceptions?: number;
}

export interface ExceptionDetailResponse {
  exception: Omit<ExceptionItem, 'reason' | 'vendorName' | 'vendorCode' | 'assigneeName'> & {
    detail_json?: string;
  };
  detail: Record<string, unknown>;
  vendor: { id: string; code: string; name: string; category: string; bankName: string; accountMask: string } | null;
  assignee: { id: string; name: string; role: string; title: string } | null;
  invoice: InvoiceDetail['invoice'] & {
    lines: InvoiceLine[];
    receipts: ReceiptRow[];
    match: MatchRow | null;
  } | null;
  attachments: Attachment[];
  history: Array<{ at: string; actorName: string; action: string; summary: string }>;
  evidenceLedger: LedgerRow[];
  relatedLedger: LedgerRow[];
  suggestions: Array<Record<string, unknown>>;
}

export interface InvoiceLine {
  lineNo: number;
  description: string;
  qty: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface MatchRow {
  status: string;
  deltaMinor: number;
  confidence: number;
  ledgerId?: string;
  transactionId?: string;
  valueDate?: string;
  amountMinor?: number;
  accountMask?: string;
  channel?: string;
  ledgerDescription?: string;
}

export interface ReceiptRow {
  id: string;
  receiptNumber: string;
  amountMinor: number;
  currency: string;
  receivedDate: string;
  attachmentId: string | null;
  fileName: string | null;
  attachmentMime?: string | null;
  attachmentSha?: string | null;
}

export interface Attachment {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'EVIDENCE';
  fileName: string;
  mime?: string;
  sizeBytes?: number;
  declaredAmountMinor: number | null;
  linkedInvoiceNumber?: string | null;
  linkedExceptionId?: string | null;
  linkedTransactionRef?: string | null;
  createdAt: string;
}

export interface LedgerRow {
  id: string;
  transactionId: string;
  amountMinor: number;
  currency: string;
  valueDate: string;
  vendorId?: string | null;
  vendorName?: string | null;
  vendorCode?: string | null;
  invoiceNumber?: string | null;
  accountMask?: string;
  channel?: string;
  description?: string;
  status: string;
  matchedInvoiceNumber?: string | null;
  matchStatus?: string | null;
  openExceptions?: number;
  normalizedRef?: string;
  createdAt?: string;
  batchFile?: string | null;
  importedAt?: string | null;
  amountDiff?: number;
}

export interface InvoiceDetail {
  invoice: Invoice & { createdAt: string; vendorCategory?: string; vendorBank?: string; vendorAccount?: string };
  vendor: { id: string; code: string; name: string; category: string; bankName: string; accountMask: string };
  lines: InvoiceLine[];
  match: MatchRow | null;
  receipts: ReceiptRow[];
  attachments: Attachment[];
  exceptions: Array<{ id: string; type: ExceptionType; severity: Severity; status: string; title: string; amountMinor: number; deltaMinor: number; createdAt: string }>;
  integrity: {
    status: 'VERIFIED' | 'ATTENTION';
    failing: number;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
    lineTotalMinor: number;
    receiptTotalMinor: number;
    paidMinor: number;
    checks: Array<{
      key: string;
      label: string;
      expectedMinor: number;
      actualMinor: number;
      deltaMinor: number;
      state: 'pass' | 'fail' | 'pending' | 'skipped';
    }>;
  };
  overdueDays: number;
}

export interface ImportBatch {
  id: string;
  source: 'LEDGER' | 'INVOICE' | 'RECEIPT';
  fileName: string;
  checksum: string;
  rowCount: number;
  insertedCount: number;
  skippedCount: number;
  invalidCount: number;
  status: string;
  createdAt: string;
  runId: string | null;
  importedByName: string | null;
}

export interface ImportPreview {
  source: string;
  fileName: string;
  checksum: string;
  headers: string[];
  summary: { rowCount: number; valid: number; duplicates: number; invalid: number };
  duplicateFile: boolean;
  previewRows: Array<{ line: number; status: 'VALID' | 'DUPLICATE' | 'ERROR'; amountMinor: number | null; label: string; issues: Array<{ code: string; message: string; field?: string }> }>;
  errors: Array<{ line: number; field?: string; code: string; message: string }>;
}

export interface SampleFile {
  name: string;
  source: string;
  sizeBytes: number;
  label: string;
}

export interface NominalReport {
  invoiceCount: number;
  formulaFailures: number;
  lineFailures: number;
  receiptFailures: number;
  attachmentFailures: number;
  totalVarianceMinor: number;
  accuracyRate: number;
  matchStats: { exact: number; tolerance: number; provisional: number; matchedValueMinor: number };
  byVendor: Array<{ vendorCode: string; vendorName: string; exceptions: number; varianceMinor: number }>;
  recent: Array<{ id: string; invoiceNumber: string; title: string; deltaMinor: number; status: string; severity: Severity; vendorName: string; createdAt: string }>;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  meta: Record<string, unknown>;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  category: string;
  bankName: string;
  accountMask: string;
  invoiceCount: number;
  invoiceValueMinor: number;
  openExceptions: number;
  riskMinor: number;
}

export interface AppSettings {
  amountToleranceMinor: number;
  graceDays: number;
  approvalThresholdMinor: number;
  highValueMinor: number;
  autoRunOnImport: boolean;
}

// Treasury & corporate financing
export type TreasuryCategory =
  | 'MM_CALL'
  | 'TIME_DEPOSIT'
  | 'REPO'
  | 'GOV_BOND'
  | 'CORP_BOND'
  | 'FX_SPOT'
  | 'FX_FORWARD'
  | 'FX_SWAP'
  | 'IRS'
  | 'CORPORATE_LOAN'
  | 'SYNDICATED_LOAN'
  | 'PROJECT_FINANCE'
  | 'TRADE_FINANCE';

export interface TreasuryTotals {
  deals: number;
  notionalMinor: number;
  notionalIdrMinor: number;
  documents: number;
  legs: number;
  failedLegs: number;
  full: number;
  partial: number;
  unmatched: number;
  coverage: number;
}

export interface TreasuryCategoryRow {
  category: TreasuryCategory;
  label: string;
  short: string;
  deals: number;
  notionalIdrMinor: number;
  full: number;
  partial: number;
  unmatched: number;
  openBreaks: number;
}

export interface TreasuryRunStats {
  deals: number;
  full: number;
  partial: number;
  unmatched: number;
  coverage: number;
  docsExpected: number;
  docsReceived: number;
  docsMissing: number;
  legsExpected: number;
  legsReceived: number;
  openBreaks: number;
  valueAtRiskIdrMinor: number;
  notionalIdrMinor: number;
  breaksByType: Array<{ type: string; count: number }>;
  breaksBySeverity: Array<{ severity: string; count: number }>;
}

export interface TreasurySummary {
  asOf: string;
  totals: TreasuryTotals;
  categories: TreasuryCategoryRow[];
  breaksByType: Array<{ type: string; label: string; count: number; valueMinor: number }>;
  breaksBySeverity: Array<{ severity: Severity; count: number }>;
  topCounterparties: Array<{ id: string; code: string; name: string; party_type: string; breaks: number; exposure: number }>;
  latestRun: { id: string; startedAt: string; finishedAt: string; stats: TreasuryRunStats } | null;
  lastRunId: string | null;
}

export interface TreasuryDeal {
  id: string;
  dealRef: string;
  category: TreasuryCategory;
  instrumentCode: string;
  direction: string;
  tradeDate: string;
  valueDate: string;
  maturityDate: string;
  currency: string;
  notionalMinor: number;
  notionalIdrMinor: number;
  fxRate: number | null;
  rateBps: number | null;
  price: number | null;
  couponBps: number | null;
  tenorDays: number;
  portfolio: string;
  desk: string;
  status: string;
  duplicateOf: string | null;
  counterpartyId: string;
  counterpartyCode: string;
  counterpartyName: string;
  partyType: string;
  matchStatus: string | null;
  confidence: number | null;
  docsExpected: number | null;
  docsReceived: number | null;
  openBreaks: number;
}

export interface TreasuryBreak {
  id: string;
  breakType: string;
  label: string;
  severity: Severity;
  status: string;
  fieldName: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  amountMinor: number | null;
  currency: string | null;
  createdAt: string;
  dealId: string;
  dealRef: string;
  category: TreasuryCategory;
  categoryLabel: string;
  dealCurrency: string;
  notionalIdrMinor: number;
  maturityDate: string;
  counterpartyName: string;
  counterpartyCode: string;
  docLabel?: string | null;
}

export interface TreasuryDealDetail {
  deal: TreasuryDeal & {
    categoryLabel: string;
    economicKey: string;
    createdAt: string;
    rating: string | null;
    country: string | null;
  };
  match: {
    runId: string;
    status: string;
    docsExpected: number;
    docsReceived: number;
    legsExpected: number;
    legsMatched: number;
    confidence: number;
    matchedAt: string;
  } | null;
  documents: Array<{
    id: string;
    docType: string;
    docNumber: string;
    docVersion: number;
    status: string;
    source: string;
    fileName: string;
    mime: string;
    sha256: string;
    receivedAt: string;
    notionalMinor: number;
    currency: string;
    fxRate: number | null;
    rateBps: number | null;
    price: number | null;
    tradeDate: string;
    valueDate: string;
    maturityDate: string;
    counterpartyId: string;
    extracted: Record<string, unknown>;
    label: string;
  }>;
  legs: Array<{
    id: string;
    legNo: number;
    legType: string;
    direction: string;
    currency: string;
    amountMinor: number;
    amountIdrMinor: number;
    valueDate: string;
    accountMask: string;
    settlementRef: string;
    status: string;
  }>;
  breaks: Array<{
    id: string;
    breakType: string;
    label: string;
    severity: Severity;
    status: string;
    fieldName: string | null;
    expectedValue: string | null;
    actualValue: string | null;
    amountMinor: number | null;
    currency: string | null;
    createdAt: string;
    detail: Record<string, unknown>;
  }>;
}

export type TreasuryAccrualType = 'INTEREST' | 'COUPON' | 'FX_POINTS' | 'SWAP_NET' | 'FEE';

export interface TreasuryAccrualItem {
  dealId: string;
  dealRef: string;
  category: TreasuryCategory;
  categoryLabel: string;
  counterparty: string;
  direction: string;
  currency: string;
  principalMinor: number;
  principalIdrMinor: number;
  accrualType: TreasuryAccrualType;
  from: string;
  to: string;
  days: number;
  dayBasis: string;
  rateBps: number | null;
  amountMinor: number;
  amountIdrMinor: number;
  kind: 'INCOME' | 'EXPENSE';
  debitAccount: string;
  debitAccountName: string;
  creditAccount: string;
  creditAccountName: string;
  formula: string;
}

export interface TreasuryAccrualReport {
  period: string;
  from: string;
  to: string;
  generatedAt: string;
  totals: {
    deals: number;
    incomeIdrMinor: number;
    expenseIdrMinor: number;
    netIdrMinor: number;
    principalIdrMinor: number;
  };
  byCategory: Array<{
    category: TreasuryCategory;
    label: string;
    deals: number;
    incomeIdrMinor: number;
    expenseIdrMinor: number;
    netIdrMinor: number;
  }>;
  journal: Array<{
    account: string;
    name: string;
    debitIdrMinor: number;
    creditIdrMinor: number;
  }>;
  balanced: boolean;
  items: TreasuryAccrualItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
