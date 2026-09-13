import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { StudioKindReleaseEditor } from '@/components/studio/StudioKindReleaseEditor';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PowersPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const session = await requireAdminSession(rawLocale);
  const canPublish = session.user.permissions.includes('content:publish');

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <StudioKindReleaseEditor
        locale={rawLocale}
        kind="power"
        canPublish={canPublish}
        titleKey="studio.powers.title"
        subtitleKey="studio.powers.subtitle"
        defaultPayload={{
          versionLabel: 'studio.powers',
          energyThreshold: 4,
          inventoryMaxTotal: 3,
          inventoryMaxPerPower: 1,
          actionWindowMs: 8000,
          defenseWindowMs: 5000,
          powers: [
            {
              powerId: 'danger_pulse',
              enabled: true,
              grantWeight: 100,
              eligibleModes: ['quick_survival', 'private', 'training', 'dev'],
              nameKey: 'power.danger_pulse.name',
              explanationKey: 'power.danger_pulse.explanation',
              assetIds: [],
            },
            {
              powerId: 'shield',
              enabled: true,
              grantWeight: 100,
              eligibleModes: ['quick_survival', 'private', 'training', 'dev'],
              nameKey: 'power.shield.name',
              explanationKey: 'power.shield.explanation',
              assetIds: [],
            },
            {
              powerId: 'reflection',
              enabled: true,
              grantWeight: 100,
              eligibleModes: ['quick_survival', 'private', 'training', 'dev'],
              nameKey: 'power.reflection.name',
              explanationKey: 'power.reflection.explanation',
              assetIds: [],
            },
          ],
        }}
      />
    </Suspense>
  );
}
