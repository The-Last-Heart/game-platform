import { notFound } from 'next/navigation';
import { SecurityPanel } from '@/components/profile/profile-panels';
import { isLocale } from '@/i18n/locale';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SecurityPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  return <SecurityPanel locale={rawLocale} />;
}
