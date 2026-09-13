import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioLibrary } from '@/components/studio/StudioLibrary';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LibraryPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  const canDraft = session.user.permissions.includes('content:draft' as never);

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioLibrary locale={rawLocale} canDraft={canDraft} />
    </Suspense>
  );
}
