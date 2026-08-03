import type { ApiError } from '@assessiq/types';

// Dev: Vite proxies /api → http://localhost:3001 (see vite.config.ts).
const BASE = '/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    credentials: 'include', // send the httpOnly auth cookie
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(res.status, err.code ?? 'UNKNOWN', err.error ?? res.statusText);
  }
  return body as T;
}

type Headers = Record<string, string>;

export const api = {
  get: <T>(path: string, headers?: Headers) => request<T>(path, { headers }),
  post: <T>(path: string, data?: unknown, headers?: Headers) =>
    request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
      headers,
    }),
};

// Authorization header for candidate session calls (Bearer token, not cookie).
export const bearer = (token: string): Headers => ({ Authorization: `Bearer ${token}` });
