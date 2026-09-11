import { notFound } from 'next/navigation';
import { AdministratorCreateForm } from '@/components/administrators/administrators-panels';
import { ForbiddenState } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NewAdministratorPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const session = await requireAdminSession(rawLocale);
  if (!session.user.permissions.includes('administrators:write')) {
    return <ForbiddenState label={t(rawLocale, 'common.forbidden')} />;
  }

  return <AdministratorCreateForm locale={rawLocale} />;
}
