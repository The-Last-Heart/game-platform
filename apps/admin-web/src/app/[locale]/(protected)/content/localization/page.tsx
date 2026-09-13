import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioKindReleaseEditor } from '@/components/studio/StudioKindReleaseEditor';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalizationPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const session = await requireAdminSession(rawLocale);
  const canPublish = session.user.permissions.includes('content:publish');

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioKindReleaseEditor
        locale={rawLocale}
        kind="localization"
        canPublish={canPublish}
        titleKey="studio.localization.title"
        subtitleKey="studio.localization.subtitle"
        defaultPayload={{
          locales: ['ar', 'en'],
          entries: {
            ar: {
              'challenge.wait_for_signal.intro': 'انتظر الإشارة',
            },
            en: {
              'challenge.wait_for_signal.intro': 'Wait for the signal',
            },
          },
        }}
      />
    </Suspense>
  );
}
