import 'server-only';

import type {
  AdminAuthenticatedUser,
  AdminSessionInfo,
} from '@thelastheart/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/bff/constants';
import { getBackendInternalUrl } from '@/lib/bff/backend-url';
import type { Locale } from '@/i18n/locale';

export type AdminSessionSnapshot = {
  user: AdminAuthenticatedUser;
  session: AdminSessionInfo;
};

export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  return Boolean(value && value.length > 0);
}

/**
 * Server-side session validation against the backend (not the browser BFF).
 * Uses the HttpOnly cookie from the incoming request.
 */
export async function fetchAdminSession(): Promise<AdminSessionSnapshot | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  let base: string;
  try {
    base = getBackendInternalUrl();
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${base}/api/admin/v1/auth/me`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      ok?: boolean;
      data?: AdminSessionSnapshot;
    };
    if (!body.ok || !body.data?.user || !body.data?.session) {
      return null;
    }
    return body.data;
  } catch {
    return null;
  }
}

export async function requireAdminSession(
  locale: Locale,
  returnPath?: string,
): Promise<AdminSessionSnapshot> {
  const session = await fetchAdminSession();
  if (!session) {
    const next = returnPath ? `?next=${encodeURIComponent(returnPath)}` : '';
    redirect(`/${locale}/login${next}`);
  }
  return session;
}

export async function redirectIfAuthenticated(locale: Locale): Promise<void> {
  const session = await fetchAdminSession();
  if (session) {
    redirect(`/${locale}/dashboard`);
  }
}
