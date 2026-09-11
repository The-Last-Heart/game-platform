import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AdministratorsList } from '@/components/administrators/administrators-panels';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdministratorsPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  const canWrite = session.user.permissions.includes('administrators:write');

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <AdministratorsList locale={rawLocale} canWrite={canWrite} />
    </Suspense>
  );
}
