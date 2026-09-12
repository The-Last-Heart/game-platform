import { notFound } from 'next/navigation';
import { ContentAdminPanel } from '@/components/content/content-admin-panel';
import { isLocale } from '@/i18n/locale';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ContentPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  return <ContentAdminPanel locale={rawLocale} />;
}
