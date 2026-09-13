'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminContentTemplateSummary } from '@thelastheart/contracts';
import {
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import type { Locale } from '@/i18n/locale';
import { adminApiFetch } from '@/lib/api/client';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { LifecycleTimeline } from './LifecycleTimeline';
import { StatusChip } from './StatusChip';
import { StudioPageHeader } from './StudioPageHeader';

type StudioTemplateDetailProps = {
  locale: Locale;
  templateId: string;
  canDraft: boolean;
  canReview: boolean;
  canPublish: boolean;
};

export function StudioTemplateDetail({
  locale,
  templateId,
  canDraft,
  canReview,
  canPublish,
}: StudioTemplateDetailProps) {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<AdminContentTemplateSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Try fetching the single template; fallback to list if endpoint 404s
    const result = await adminApiFetch<{ template: AdminContentTemplateSummary }>(
      `/content/templates/${templateId}`,
    );
    if (result.ok) {
      setTemplate(result.data.template);
      setForbidden(false);
      setError(null);
      setLoading(false);
      return;
    }

    // Fallback: find in list
    if (result.status === 404) {
      const listResult = await adminApiFetch<AdminContentTemplateSummary[]>('/content/templates');
      if (listResult.ok) {
        const found = listResult.data.find((tpl) => tpl.templateId === templateId);
        if (found) {
          setTemplate(found);
          setForbidden(false);
          setError(null);
          setLoading(false);
          return;
        }
      }
    }

    setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
    setError(localizeAdminError(locale, result.error.code, result.error.message));
    setLoading(false);
  }, [templateId, locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  if (loading) return <LoadingState label={t(locale, 'common.loading')} />;
  if (error || !template) {
    return (
      <ErrorState
        label={error ?? t(locale, 'common.error')}
        retryLabel={t(locale, 'common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={template.internalTitle}
        subtitle={template.slug}
        primaryAction={
          canDraft ? (
            <Link className="btn btn-primary" href={`/${locale}/content/templates/${templateId}/edit`}>
              {t(locale, 'studio.detail.edit')}
            </Link>
          ) : null
        }
        secondaryAction={
          <Link className="btn btn-secondary" href={`/${locale}/content/library`}>
            {t(locale, 'common.back')}
          </Link>
        }
      />

      <div className="panel">
        <LifecycleTimeline locale={locale} currentStatus={template.status} />
      </div>

      <div className="panel">
        <dl className="definition-list">
          <div>
            <dt>{t(locale, 'studio.library.col.engine')}</dt>
            <dd>{template.familyId}</dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.library.col.status')}</dt>
            <dd><StatusChip locale={locale} status={template.status} /></dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.library.col.version')}</dt>
            <dd>{template.latestVersion ?? '—'}</dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.field.categoryId')}</dt>
            <dd>{template.categoryId}</dd>
          </div>
        </dl>
      </div>

      <div className="panel">
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>
          {t(locale, 'studio.detail.versions')}
        </h2>
        <p style={{ color: 'var(--lh-text-muted)', fontSize: '0.88rem' }}>
          {t(locale, 'studio.detail.noVersions')}
        </p>
      </div>

      {canReview ? (
        <div className="inline-actions">
          <button type="button" className="btn btn-primary" disabled>
            {t(locale, 'studio.detail.approve')}
          </button>
        </div>
      ) : null}
      {canPublish ? (
        <div className="inline-actions" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-primary" disabled>
            {t(locale, 'studio.detail.publish')}
          </button>
          <button type="button" className="btn btn-secondary" disabled>
            {t(locale, 'studio.detail.pause')}
          </button>
          <button type="button" className="btn btn-secondary" disabled>
            {t(locale, 'studio.detail.retire')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
