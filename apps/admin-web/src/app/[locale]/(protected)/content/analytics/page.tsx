import { notFound } from 'next/navigation';
import { StudioSectionPage } from '@/components/studio/StudioSectionPage';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AnalyticsPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  await requireAdminSession(rawLocale);

  return (
    <StudioSectionPage
      locale={rawLocale}
      titleKey="studio.analytics.title"
      subtitleKey="studio.analytics.subtitle"
      emptyKey="studio.analytics.empty"
    />
  );
}
