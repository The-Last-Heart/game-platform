import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AuditLogPanel } from '@/components/audit/audit-log-panel';
import { t } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/locale';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AuditLogPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  return (
    <Suspense fallback={<p>{t(rawLocale, 'common.loading')}</p>}>
      <AuditLogPanel locale={rawLocale} />
    </Suspense>
  );
}
