import type { ApiError } from '@assessiq/types';

// Dev: Vite proxies /api → http://localhost:3001 (see vite.config.ts).
const BASE = '/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Full error body. Some errors carry structured context beyond the
     *  message — e.g. a DUPLICATE_CANDIDATE 409 carries the prior completion
     *  the UI needs to render its warning. */
    public body?: Record<string, unknown>,
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
    throw new ApiRequestError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.error ?? res.statusText,
      (body ?? undefined) as Record<string, unknown> | undefined,
    );
  }
  return body as T;
}

type Headers = Record<string, string>;

/**
 * Multipart POST. Separate from `request` because the JSON path sets a
 * Content-Type header unconditionally, and setting it here would override the
 * multipart boundary the browser generates — the server then reads an empty
 * body and rejects a file that was actually there.
 */
async function uploadRequest<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.error ?? res.statusText,
      (body ?? undefined) as Record<string, unknown> | undefined,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, headers?: Headers) => request<T>(path, { headers }),
  post: <T>(path: string, data?: unknown, headers?: Headers) =>
    request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
      headers,
    }),
  patch: <T>(path: string, data?: unknown, headers?: Headers) =>
    request<T>(path, {
      method: 'PATCH',
      body: data !== undefined ? JSON.stringify(data) : undefined,
      headers,
    }),
  put: <T>(path: string, data?: unknown, headers?: Headers) =>
    request<T>(path, {
      method: 'PUT',
      body: data !== undefined ? JSON.stringify(data) : undefined,
      headers,
    }),
  del: <T = null>(path: string, headers?: Headers) =>
    request<T>(path, { method: 'DELETE', headers }),
  upload: <T>(path: string, form: FormData) => uploadRequest<T>(path, form),
};

// Authorization header for candidate session calls (Bearer token, not cookie).
export const bearer = (token: string): Headers => ({ Authorization: `Bearer ${token}` });
