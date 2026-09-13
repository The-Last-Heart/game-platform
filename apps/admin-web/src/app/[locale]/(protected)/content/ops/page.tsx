import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioOps } from '@/components/studio/StudioOps';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OpsPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  const canPublish = session.user.permissions.includes('content:publish' as never);

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioOps locale={rawLocale} canPublish={canPublish} />
    </Suspense>
  );
}
