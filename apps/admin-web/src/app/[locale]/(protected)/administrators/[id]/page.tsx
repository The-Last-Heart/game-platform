import { notFound } from 'next/navigation';
import { AdministratorDetailForm } from '@/components/administrators/administrators-panels';
import { ForbiddenState } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function AdministratorDetailPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  if (!session.user.permissions.includes('administrators:read')) {
    return <ForbiddenState label={t(rawLocale, 'common.forbidden')} />;
  }

  return <AdministratorDetailForm locale={rawLocale} id={id} />;
}
