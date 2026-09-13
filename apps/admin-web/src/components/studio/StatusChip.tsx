'use client';

import type { ContentLifecycleStatus } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';

const STATUS_LABEL_KEYS: Record<ContentLifecycleStatus, MessageKey> = {
  draft: 'studio.status.draft',
  submitted: 'studio.status.submitted',
  in_review: 'studio.status.inReview',
  approved: 'studio.status.approved',
  scheduled: 'studio.status.scheduled',
  published: 'studio.status.published',
  paused: 'studio.status.paused',
  retired: 'studio.status.retired',
};

type StatusChipProps = {
  locale: Locale;
  status: ContentLifecycleStatus;
};

export function StatusChip({ locale, status }: StatusChipProps) {
  return (
    <span className="status-chip" data-status={status}>
      {t(locale, STATUS_LABEL_KEYS[status])}
    </span>
  );
}
