import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { localeCookieName, resolveRootLocale } from '@/i18n/locale';

/**
 * Fallback if middleware does not run (e.g. some test harnesses).
 * Browser language is never consulted.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const locale = resolveRootLocale(cookieStore.get(localeCookieName)?.value);
  redirect(`/${locale}`);
}
