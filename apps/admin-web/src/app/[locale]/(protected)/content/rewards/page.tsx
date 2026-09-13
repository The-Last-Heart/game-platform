import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioKindReleaseEditor } from '@/components/studio/StudioKindReleaseEditor';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function RewardsPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const session = await requireAdminSession(rawLocale);
  const canPublish = session.user.permissions.includes('content:publish');

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioKindReleaseEditor
        locale={rawLocale}
        kind="daily-goals"
        canPublish={canPublish}
        titleKey="studio.rewards.title"
        subtitleKey="studio.rewards.subtitle"
        defaultPayload={{
          versionLabel: 'studio.goals',
          goals: [
            {
              id: 'complete_challenges_3',
              copyKeyAr: 'أكمل ٣ تحديات اليوم',
              eligibleModes: ['quick_survival', 'private'],
              targetCount: 3,
              rewardType: 'energy',
              rewardValue: 1,
              schedule: { repeat: 'daily', enabled: true },
            },
          ],
        }}
      />
    </Suspense>
  );
}
