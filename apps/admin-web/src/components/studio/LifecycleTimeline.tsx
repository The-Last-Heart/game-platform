'use client';

import type { ContentLifecycleStatus } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';

const LIFECYCLE_STEPS: ContentLifecycleStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'paused',
  'retired',
];

const STEP_RANK: Record<ContentLifecycleStatus, number> = {
  draft: 0,
  submitted: 1,
  in_review: 2,
  approved: 3,
  scheduled: 4,
  published: 5,
  paused: 6,
  retired: 7,
};

const STEP_LABEL_KEYS: Record<ContentLifecycleStatus, MessageKey> = {
  draft: 'studio.lifecycle.drafted',
  submitted: 'studio.lifecycle.submitted',
  in_review: 'studio.lifecycle.inReview',
  approved: 'studio.lifecycle.approved',
  scheduled: 'studio.lifecycle.scheduled',
  published: 'studio.lifecycle.published',
  paused: 'studio.lifecycle.paused',
  retired: 'studio.lifecycle.retired',
};

type LifecycleTimelineProps = {
  locale: Locale;
  currentStatus: ContentLifecycleStatus;
};

export function LifecycleTimeline({ locale, currentStatus }: LifecycleTimelineProps) {
  const currentRank = STEP_RANK[currentStatus];

  return (
    <div className="lifecycle-timeline">
      {LIFECYCLE_STEPS.map((step, index) => {
        const rank = STEP_RANK[step];
        const isActive = step === currentStatus;
        const isComplete = rank < currentRank;

        return (
          <span key={step}>
            {index > 0 ? <span className="lifecycle-step-connector" /> : null}
            <span
              className="lifecycle-step"
              data-active={isActive ? 'true' : undefined}
              data-complete={isComplete ? 'true' : undefined}
            >
              {t(locale, STEP_LABEL_KEYS[step])}
            </span>
          </span>
        );
      })}
    </div>
  );
}
