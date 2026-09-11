import { notFound } from 'next/navigation';
import { DocumentLocaleAttributes } from '@/components/i18n/document-locale';
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

  const locale = rawLocale as Locale;
  // Root <html> is server-rendered once; sync lang/dir on client locale switches.
  return (
    <>
      <DocumentLocaleAttributes locale={locale} />
      {children}
    </>
  );
}
