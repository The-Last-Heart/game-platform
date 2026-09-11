import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { localeCookieName, resolveRootLocale } from '@/i18n/locale';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/bff/constants';

/**
 * Fallback if proxy does not run (e.g. some test harnesses).
 * Browser language is never consulted.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const locale = resolveRootLocale(cookieStore.get(localeCookieName)?.value);
  const hasSession = Boolean(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  redirect(hasSession ? `/${locale}/dashboard` : `/${locale}/login`);
}
