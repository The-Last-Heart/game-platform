import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioHome } from '@/components/studio/StudioHome';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ContentPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  const canDraft = session.user.permissions.includes('content:draft' as never);

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioHome locale={rawLocale} canDraft={canDraft} />
    </Suspense>
  );
}
