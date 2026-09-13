import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioChallengeEditor } from '@/components/studio/StudioChallengeEditor';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NewTemplatePage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  const canDraft = session.user.permissions.includes('content:draft' as never);
  const canReview = session.user.permissions.includes('content:review' as never);

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioChallengeEditor
        locale={rawLocale}
        canDraft={canDraft}
        canReview={canReview}
        mode="create"
      />
    </Suspense>
  );
}
