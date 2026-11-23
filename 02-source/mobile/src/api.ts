import { Platform } from 'react-native';

const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:4100' : 'http://127.0.0.1:4100';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, '');

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  let code = 'REQUEST_FAILED';
  try {
    const body = (await response.json()) as { error?: { message?: string; code?: string } };
    if (body.error?.message) message = body.error.message;
    if (body.error?.code) code = body.error.code;
  } catch {
    // Non-JSON error body; keep the status message.
  }
  throw new ApiError(response.status, code, message);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set('authorization', `Bearer ${authToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_UNAVAILABLE', `Cannot reach the Laras API at ${API_URL}. Check the phone network and EXPO_PUBLIC_API_URL.`);
  }
  if (!response.ok) await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  upload<T>(path: string, form: FormData): Promise<T> {
    return request<T>(path, { method: 'POST', body: form });
  },
};
