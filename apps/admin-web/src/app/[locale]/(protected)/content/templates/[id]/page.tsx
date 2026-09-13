import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioTemplateDetail } from '@/components/studio/StudioTemplateDetail';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function TemplateDetailPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  const canDraft = session.user.permissions.includes('content:draft' as never);
  const canReview = session.user.permissions.includes('content:review' as never);
  const canPublish = session.user.permissions.includes('content:publish' as never);

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioTemplateDetail
        locale={rawLocale}
        templateId={id}
        canDraft={canDraft}
        canReview={canReview}
        canPublish={canPublish}
      />
    </Suspense>
  );
}
