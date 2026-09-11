import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locale';
import { hasSessionCookie } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** Locale root → login or dashboard (no foundation landing). */
export default async function LocaleIndexPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const authed = await hasSessionCookie();
  redirect(authed ? `/${rawLocale}/dashboard` : `/${rawLocale}/login`);
}
