import type { User } from './types';

const TOKEN_KEY = 'laras.token';
const USER_KEY = 'laras.user';

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (response.status === 401 && !path.includes('/api/auth/login')) {
      clearSession();
      window.dispatchEvent(new Event('laras:unauthorized'));
    }
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? `Request failed with status ${response.status}.`,
      payload?.error?.details,
    );
  }
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

export const api = {
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { signal });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  upload<T>(path: string, form: FormData): Promise<T> {
    return request<T>(path, { method: 'POST', body: form });
  },
};

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const response = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let message = 'Download failed.';
    try {
      const payload = await response.json();
      message = payload.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, 'DOWNLOAD_FAILED', message);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = match?.[1] ?? fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchBlob(path: string): Promise<{ url: string; type: string; dispose: () => void }> {
  const token = getToken();
  const response = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    throw new ApiError(response.status, 'FILE_LOAD_FAILED', 'Could not load the document.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  return { url, type: blob.type, dispose: () => URL.revokeObjectURL(url) };
}
