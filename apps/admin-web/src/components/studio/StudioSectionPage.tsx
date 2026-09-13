'use client';

import { EmptyState } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { StudioPageHeader } from './StudioPageHeader';

/**
 * Reusable shell for studio section pages that are honest-empty
 * until their backend endpoints exist.
 */
type StudioSectionPageProps = {
  locale: Locale;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  emptyKey: MessageKey;
  children?: React.ReactNode;
};

export function StudioSectionPage({
  locale,
  titleKey,
  subtitleKey,
  emptyKey,
  children,
}: StudioSectionPageProps) {
  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, titleKey)}
        subtitle={t(locale, subtitleKey)}
      />
      {children ?? (
        <div className="panel">
          <EmptyState label={t(locale, emptyKey)} />
        </div>
      )}
    </div>
  );
}
