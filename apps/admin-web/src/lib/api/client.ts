import type { AdminErrorCode } from '@thelastheart/contracts';
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_CSRF_HEADER_NAME,
} from '@/lib/bff/constants';

export type AdminApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      error: { code: AdminErrorCode; message: string; details?: unknown };
    };

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ADMIN_CSRF_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]!) : null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing) {
    return existing;
  }
  const response = await fetch('/api/admin/v1/auth/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as {
    ok?: boolean;
    data?: { csrfToken?: string };
  };
  return body.data?.csrfToken ?? readCsrfToken();
}

export async function adminApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<AdminApiResult<T>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  if (!headers.has('content-type') && init.body && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }

  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      headers.set(ADMIN_CSRF_HEADER_NAME, csrf);
    }
  }

  const response = await fetch(`/api/admin/v1${path}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body || typeof body !== 'object') {
    const errorBody = body as {
      error?: { code?: AdminErrorCode; message?: string; details?: unknown };
    } | null;
    return {
      ok: false,
      status: response.status,
      error: {
        code: errorBody?.error?.code ?? 'INTERNAL_ERROR',
        message: errorBody?.error?.message ?? 'An unexpected error occurred',
        details: errorBody?.error?.details,
      },
    };
  }

  const envelope = body as {
    ok?: boolean;
    data?: T;
    error?: { code: AdminErrorCode; message: string; details?: unknown };
  };

  if (envelope.ok === true && envelope.data !== undefined) {
    return { ok: true, data: envelope.data };
  }

  return {
    ok: false,
    status: response.status,
    error: envelope.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
}
