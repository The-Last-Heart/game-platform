'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminStudioHomeSummary } from '@thelastheart/contracts';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import { adminApiFetch } from '@/lib/api/client';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { MetricCard } from './MetricCard';
import { StudioPageHeader } from './StudioPageHeader';

type StudioHomeProps = {
  locale: Locale;
  canDraft: boolean;
};

function coveragePercent(counts: AdminStudioHomeSummary['counts']): number {
  const total =
    counts.drafts +
    counts.submitted +
    counts.inReview +
    counts.approved +
    counts.scheduled +
    counts.published +
    counts.paused;
  if (total <= 0) return 0;
  return Math.round((counts.published / total) * 100);
}

export function StudioHome({ locale, canDraft }: StudioHomeProps) {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminStudioHomeSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const homeResult = await adminApiFetch<AdminStudioHomeSummary>('/content/studio/home');

    if (!homeResult.ok) {
      setForbidden(homeResult.status === 403 || homeResult.error.code === 'FORBIDDEN');
      setError(localizeAdminError(locale, homeResult.error.code, homeResult.error.message));
      setSummary(null);
      setLoading(false);
      return;
    }

    setSummary(homeResult.data);
    setForbidden(false);
    setError(null);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;

  const counts = summary?.counts;
  const reviewQueue = (counts?.submitted ?? 0) + (counts?.inReview ?? 0);
  const coverage = counts ? coveragePercent(counts) : 0;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, 'studio.home.title')}
        subtitle={t(locale, 'studio.home.subtitle')}
        primaryAction={
          canDraft ? (
            <Link className="btn btn-primary" href={`/${locale}/content/templates/new`}>
              {t(locale, 'studio.library.newChallenge')}
            </Link>
          ) : null
        }
        secondaryAction={
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            {t(locale, 'common.refresh')}
          </button>
        }
      />

      {loading ? <LoadingState label={t(locale, 'common.loading')} /> : null}
      {!loading && error ? (
        <ErrorState
          label={error}
          retryLabel={t(locale, 'common.retry')}
          onRetry={() => void load()}
        />
      ) : null}

      {!loading && summary && counts ? (
        <>
          <div className="studio-home-grid">
            <MetricCard
              href={`/${locale}/content/library?status=draft`}
              value={counts.drafts}
              label={t(locale, 'studio.home.drafts')}
              description={t(locale, 'studio.home.draftsDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=submitted`}
              value={reviewQueue}
              label={t(locale, 'studio.home.reviewQueue')}
              description={t(locale, 'studio.home.reviewQueueDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=scheduled`}
              value={counts.scheduled}
              label={t(locale, 'studio.home.scheduled')}
              description={t(locale, 'studio.home.scheduledDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=published`}
              value={counts.published}
              label={t(locale, 'studio.home.published')}
              description={t(locale, 'studio.home.publishedDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=paused`}
              value={counts.paused}
              label={t(locale, 'studio.home.paused')}
              description={t(locale, 'studio.home.pausedDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library`}
              value={`${coverage}%`}
              label={t(locale, 'studio.home.coverage')}
              description={t(locale, 'studio.home.coverageDesc')}
            />
          </div>

          <div className="panel">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {t(locale, 'studio.home.recentPublishes')}
              </h2>
              <Link
                href={`/${locale}/content/library?status=published`}
                className="btn btn-ghost"
                style={{ fontSize: '0.85rem' }}
              >
                {t(locale, 'studio.home.viewAll')} →
              </Link>
            </div>
            {summary.recentPublishes.length === 0 ? (
              <EmptyState label={t(locale, 'studio.home.noRecentPublishes')} />
            ) : (
              <div className="table-wrap">
                <table className="studio-data-table">
                  <thead>
                    <tr>
                      <th>{t(locale, 'content.versionLabel')}</th>
                      <th>{t(locale, 'common.status')}</th>
                      <th>{t(locale, 'studio.library.col.updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentPublishes.slice(0, 5).map((release) => (
                      <tr key={release.releaseId}>
                        <td style={{ fontWeight: 600 }}>{release.versionLabel}</td>
                        <td>{release.kind}</td>
                        <td>{new Date(release.publishedAt).toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
