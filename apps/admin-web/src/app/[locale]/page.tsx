import { notFound } from 'next/navigation';
import { FoundationStatus } from '@/components/foundation-status';
import { LanguageSwitcher } from '@/components/language-switcher';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function FoundationPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale;

  return (
    <main>
      <header>
        <h1>{t(locale, 'app.title')}</h1>
        <LanguageSwitcher locale={locale} currentPath={`/${locale}`} />
      </header>
      <FoundationStatus locale={locale} />
    </main>
  );
}
