import { notFound } from 'next/navigation';
import { SystemStatusPanel } from '@/components/system/system-status-panel';
import { isLocale } from '@/i18n/locale';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SystemPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  return <SystemStatusPanel locale={rawLocale} />;
}
