import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { redirectIfAuthenticated } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LoginPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  await redirectIfAuthenticated(rawLocale);

  return (
    <Suspense
      fallback={
        <div className="login-page">
          <p>{t(rawLocale, 'common.loading')}</p>
        </div>
      }
    >
      <LoginForm locale={rawLocale} />
    </Suspense>
  );
}
