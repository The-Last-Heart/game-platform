'use client';

import { DevicePreviewFrame } from '@/components/studio/DevicePreviewFrame';
import { StudioPageHeader } from '@/components/studio/StudioPageHeader';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import { usePathname } from 'next/navigation';

function extractLocale(pathname: string): Locale {
  const match = pathname.match(/^\/(en|ar)\//);
  return (match?.[1] as Locale) ?? 'en';
}

export default function PreviewPage() {
  const pathname = usePathname() ?? '/en';
  const locale = extractLocale(pathname);

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, 'studio.preview.title')}
        subtitle={t(locale, 'studio.preview.subtitle')}
      />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}>
        <DevicePreviewFrame locale={locale} />
      </div>
    </div>
  );
}
