export type Role = 'ANALYST' | 'SUPERVISOR' | 'AUDITOR';

export type ExceptionType =
  | 'DUPLICATE_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'MISSING_PAYMENT'
  | 'UNALLOCATED_PAYMENT'
  | 'NOMINAL_VARIANCE'
  | 'ORPHAN_RECEIPT'
  | 'DUPLICATE_RECEIPT';

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

export interface ExceptionItem {
  id: string;
  type: ExceptionType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'IGNORED';
  title: string;
  transactionRef: string | null;
  invoiceNumber: string | null;
  amountMinor: number;
  deltaMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  vendorName: string | null;
  vendorCode: string | null;
  assigneeName: string | null;
}

export interface Summary {
  types: Array<{ type: ExceptionType; open: number; inReview: number; resolved: number; ignored: number; valueMinor: number }>;
  totals: { open: number; inReview: number; resolved: number; valueMinor: number; assigned: number };
}

export interface Attachment {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'EVIDENCE';
  fileName: string;
  mime?: string;
  sizeBytes?: number;
  declaredAmountMinor: number | null;
  linkedInvoiceNumber?: string | null;
  createdAt: string;
}

export interface ExceptionDetail {
  exception: ExceptionItem & { detail_json?: string; resolutionCode?: string | null; resolutionNote?: string | null };
  detail: Record<string, unknown>;
  vendor: { id: string; code: string; name: string; category: string; bankName: string; accountMask: string } | null;
  assignee: { id: string; name: string; role: string; title: string } | null;
  invoice: {
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    currency: string;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
    status: string;
    lines: Array<{ lineNo: number; description: string; qty: number; unitPriceMinor: number; amountMinor: number }>;
    receipts: Array<{ id: string; receiptNumber: string; amountMinor: number; receivedDate: string; fileName: string | null }>;
    match: Record<string, unknown> | null;
  } | null;
  attachments: Attachment[];
  history: Array<{ at: string; actorName: string; action: string; summary: string }>;
  evidenceLedger: Array<Record<string, unknown>>;
  relatedLedger: Array<Record<string, unknown>>;
  suggestions: Array<Record<string, unknown>>;
}
