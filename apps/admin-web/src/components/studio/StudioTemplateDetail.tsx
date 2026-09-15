'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminContentTemplateDetail } from '@thelastheart/contracts';
import {
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
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
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminContentTemplateDetail | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseBusy, setPauseBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminContentTemplateDetail>(
      `/content/templates/${templateId}`,
    );
    if (result.ok) {
      setDetail(result.data);
      setForbidden(false);
      setError(null);
      setLoading(false);
      return;
    }

    setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
    setError(localizeAdminError(locale, result.error.code, result.error.message));
    setDetail(null);
    setLoading(false);
  }, [templateId, locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  async function handlePauseToggle(paused: boolean) {
    const definitionId = detail?.versions[0]?.definition.definitionId;
    if (!canPublish || !definitionId || pauseBusy) {
      return;
    }
    if (pauseReason.trim().length < 3) {
      pushToast(t(locale, 'studio.ops.reasonHint'), 'error');
      document.getElementById('detail-pause-reason')?.focus();
      return;
    }
    setPauseBusy(true);
    const result = await adminApiFetch<{ definitionId: string; paused: boolean }>(
      '/content/pause',
      {
        method: 'POST',
        body: JSON.stringify({
          definitionId,
          paused,
          reason: pauseReason.trim(),
        }),
      },
    );
    if (!result.ok) {
      setPauseBusy(false);
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    setPauseReason('');
    pushToast(t(locale, 'studio.ops.pauseSuccess'), 'success');
    await load();
    setPauseBusy(false);
  }

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  if (loading) return <LoadingState label={t(locale, 'common.loading')} />;
  if (error || !detail) {
    return (
      <ErrorState
        label={error ?? t(locale, 'common.error')}
        retryLabel={t(locale, 'common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  const latest = detail.versions[0] ?? null;
  const engineId = latest?.definition.engineId ?? detail.familyId;
  const definitionId = latest?.definition.definitionId ?? null;
  const isPaused = detail.catalogPaused || detail.status === 'paused';
  const canPauseAction = canPublish && definitionId != null && !pauseBusy;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={detail.internalTitle}
        subtitle={detail.slug}
        primaryAction={
          canDraft ? (
            <Link
              className="btn btn-primary"
              href={`/${locale}/content/templates/${templateId}/edit`}
            >
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
        <LifecycleTimeline locale={locale} currentStatus={detail.status} />
      </div>

      <div className="panel">
        <dl className="definition-list">
          <div>
            <dt>{t(locale, 'studio.library.col.engine')}</dt>
            <dd>{engineId}</dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.library.col.status')}</dt>
            <dd>
              <StatusChip locale={locale} status={detail.status} />
            </dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.library.col.version')}</dt>
            <dd>{latest?.version ?? '—'}</dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.field.categoryId')}</dt>
            <dd>{detail.categoryId}</dd>
          </div>
          <div>
            <dt>{t(locale, 'studio.field.familyId')}</dt>
            <dd>{detail.familyId}</dd>
          </div>
          {detail.pauseReason ? (
            <div>
              <dt>{t(locale, 'studio.ops.reason')}</dt>
              <dd>{detail.pauseReason}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="panel">
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>
          {t(locale, 'studio.detail.versions')}
        </h2>
        {detail.versions.length === 0 ? (
          <p style={{ color: 'var(--lh-text-muted)', fontSize: '0.88rem' }}>
            {t(locale, 'studio.detail.noVersions')}
          </p>
        ) : (
          <ul className="studio-version-list">
            {detail.versions.map((v) => (
              <li key={v.templateVersionId}>
                <strong>v{v.version}</strong>
                {' · '}
                <StatusChip locale={locale} status={v.status} />
                {' · '}
                <span style={{ color: 'var(--lh-text-muted)', fontSize: '0.85rem' }}>
                  {v.definition.definitionId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canReview ? (
        <div className="inline-actions">
          <button type="button" className="btn btn-primary" disabled>
            {t(locale, 'studio.detail.approve')}
          </button>
        </div>
      ) : null}
      {canPublish ? (
        <div className="stack" style={{ marginTop: '0.5rem', gap: '0.75rem' }}>
          <div className="inline-actions">
            <button type="button" className="btn btn-primary" disabled>
              {t(locale, 'studio.detail.publish')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canPauseAction}
              onClick={() => void handlePauseToggle(!isPaused)}
            >
              {isPaused
                ? t(locale, 'studio.detail.resume')
                : t(locale, 'studio.detail.pause')}
            </button>
          </div>
          <div className="field" style={{ maxWidth: '28rem' }}>
            <label htmlFor="detail-pause-reason">
              {t(locale, 'studio.ops.reason')}
            </label>
            <input
              id="detail-pause-reason"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              disabled={pauseBusy || definitionId == null}
              placeholder={t(locale, 'studio.ops.reasonHint')}
            />
            {definitionId == null ? (
              <p
                style={{
                  margin: '0.35rem 0 0',
                  color: 'var(--lh-text-muted)',
                  fontSize: '0.8rem',
                }}
              >
                {t(locale, 'studio.detail.noVersions')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
