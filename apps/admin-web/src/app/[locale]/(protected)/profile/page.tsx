import { notFound } from 'next/navigation';
import { ProfilePanel } from '@/components/profile/profile-panels';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ProfilePage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  return <ProfilePanel locale={rawLocale} session={session} />;
}
