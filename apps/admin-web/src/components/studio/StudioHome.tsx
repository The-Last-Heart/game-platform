'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type {
  AdminContentReleaseSummary,
  AdminContentTemplateSummary,
} from '@thelastheart/contracts';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import { adminApiFetch } from '@/lib/api/client';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { MetricCard } from './MetricCard';
import { StudioPageHeader } from './StudioPageHeader';

type StudioHomeMetrics = {
  drafts: number;
  reviewQueue: number;
  scheduled: number;
  published: number;
  paused: number;
  coverage: number;
};

function computeMetrics(
  templates: AdminContentTemplateSummary[],
  releases: AdminContentReleaseSummary[],
): StudioHomeMetrics {
  let drafts = 0;
  let reviewQueue = 0;
  let published = 0;
  let paused = 0;

  for (const tpl of templates) {
    switch (tpl.status) {
      case 'draft':
        drafts++;
        break;
      case 'submitted':
        reviewQueue++;
        break;
      case 'published':
        published++;
        break;
      case 'paused':
        paused++;
        break;
    }
  }

  const scheduled = releases.filter(
    (r) => r.kind === 'challenge_catalog' && !r.isCurrent,
  ).length;

  const coverage = templates.length > 0
    ? Math.round((published / templates.length) * 100)
    : 0;

  return { drafts, reviewQueue, scheduled, published, paused, coverage };
}

type StudioHomeProps = {
  locale: Locale;
  canDraft: boolean;
};

export function StudioHome({ locale, canDraft }: StudioHomeProps) {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<StudioHomeMetrics | null>(null);
  const [releases, setReleases] = useState<AdminContentReleaseSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    // Try studio home endpoint first, fallback to computing from templates/releases
    const homeResult = await adminApiFetch<StudioHomeMetrics>(
      '/content/studio/home',
    );

    if (homeResult.ok) {
      setMetrics(homeResult.data);
      setForbidden(false);
      setError(null);
      setLoading(false);
      return;
    }

    // Graceful 404 fallback: compute from templates + releases
    if (homeResult.status === 404) {
      const [templatesResult, releasesResult] = await Promise.all([
        adminApiFetch<AdminContentTemplateSummary[]>('/content/templates'),
        adminApiFetch<AdminContentReleaseSummary[]>('/content/releases'),
      ]);

      if (!templatesResult.ok || !releasesResult.ok) {
        const failed = !templatesResult.ok ? templatesResult : releasesResult;
        if (!failed.ok) {
          setForbidden(failed.status === 403 || failed.error.code === 'FORBIDDEN');
          setError(failed.error.message);
        }
        setLoading(false);
        return;
      }

      setMetrics(computeMetrics(templatesResult.data, releasesResult.data));
      setReleases(releasesResult.data);
      setForbidden(false);
      setError(null);
      setLoading(false);
      return;
    }

    setForbidden(homeResult.status === 403 || homeResult.error.code === 'FORBIDDEN');
    setError(homeResult.error.message);
    setLoading(false);
  }, []);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;

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

      {!loading && metrics ? (
        <>
          <div className="studio-home-grid">
            <MetricCard
              href={`/${locale}/content/library?status=draft`}
              value={metrics.drafts}
              label={t(locale, 'studio.home.drafts')}
              description={t(locale, 'studio.home.draftsDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=submitted`}
              value={metrics.reviewQueue}
              label={t(locale, 'studio.home.reviewQueue')}
              description={t(locale, 'studio.home.reviewQueueDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=approved`}
              value={metrics.scheduled}
              label={t(locale, 'studio.home.scheduled')}
              description={t(locale, 'studio.home.scheduledDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=published`}
              value={metrics.published}
              label={t(locale, 'studio.home.published')}
              description={t(locale, 'studio.home.publishedDesc')}
            />
            <MetricCard
              href={`/${locale}/content/library?status=paused`}
              value={metrics.paused}
              label={t(locale, 'studio.home.paused')}
              description={t(locale, 'studio.home.pausedDesc')}
            />
            <MetricCard
              href={`/${locale}/content/analytics`}
              value={`${metrics.coverage}%`}
              label={t(locale, 'studio.home.coverage')}
              description={t(locale, 'studio.home.coverageDesc')}
            />
          </div>

          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {t(locale, 'studio.home.recentPublishes')}
              </h2>
              <Link
                href={`/${locale}/content/library`}
                className="btn btn-ghost"
                style={{ fontSize: '0.85rem' }}
              >
                {t(locale, 'studio.home.viewAll')} →
              </Link>
            </div>
            {releases.length === 0 ? (
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
                    {releases.slice(0, 5).map((release) => (
                      <tr key={release.releaseId}>
                        <td style={{ fontWeight: 600 }}>{release.versionLabel}</td>
                        <td>{release.isCurrent ? '● Current' : release.kind}</td>
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
