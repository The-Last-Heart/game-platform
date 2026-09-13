import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioKindReleaseEditor } from '@/components/studio/StudioKindReleaseEditor';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ModesPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const session = await requireAdminSession(rawLocale);
  const canPublish = session.user.permissions.includes('content:publish');

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioKindReleaseEditor
        locale={rawLocale}
        kind="mode-rules"
        canPublish={canPublish}
        titleKey="studio.modes.title"
        subtitleKey="studio.modes.subtitle"
        defaultPayload={{
          versionLabel: 'studio.modes',
          rules: {
            initialHearts: 3,
            minLivePlayers: 2,
            playerCapacity: 6,
            quickLobbyFillWaitMs: 60000,
          },
        }}
      />
    </Suspense>
  );
}
