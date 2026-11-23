export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface PageQuery {
  page: number;
  pageSize: number;
  offset: number;
}

export function readPaging(query: Record<string, unknown>): PageQuery {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paged<T>(items: T[], total: number, paging: PageQuery) {
  return {
    items,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
  };
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
