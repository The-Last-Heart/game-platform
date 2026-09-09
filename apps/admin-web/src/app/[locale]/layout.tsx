import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/locale';

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  // Document lang/dir are owned by the root layout (server-rendered from middleware header).
  void (rawLocale as Locale);
  return <>{children}</>;
}
