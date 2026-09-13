'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminContentReleaseSummary,
  AdminContentTemplateListResponse,
} from '@thelastheart/contracts';
import {
  EmptyState,
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
import { PublishWizard } from './PublishWizard';
import { StatusChip } from './StatusChip';
import { StudioPageHeader } from './StudioPageHeader';

type CatalogRow = AdminContentTemplateListResponse['items'][number];

type StudioCatalogProps = {
  locale: Locale;
  canPublish: boolean;
};

export function StudioCatalog({ locale, canPublish }: StudioCatalogProps) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [releases, setReleases] = useState<AdminContentReleaseSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tResult, rResult] = await Promise.all([
      adminApiFetch<AdminContentTemplateListResponse>(
        '/content/templates?page=1&pageSize=100',
      ),
      adminApiFetch<AdminContentReleaseSummary[]>('/content/releases'),
    ]);
    if (!tResult.ok || !rResult.ok) {
      const failed = !tResult.ok ? tResult : rResult;
      if (!failed.ok) {
        setForbidden(
          failed.status === 403 || failed.error.code === 'FORBIDDEN',
        );
        setError(
          localizeAdminError(locale, failed.error.code, failed.error.message),
        );
      }
      setLoading(false);
      return;
    }
    const catalogable = tResult.data.items.filter(
      (tpl) =>
        (tpl.status === 'approved' || tpl.status === 'published') &&
        tpl.latestApprovedVersionId,
    );
    setItems(catalogable);
    setSelected(
      new Set(
        catalogable
          .map((t) => t.latestApprovedVersionId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    setReleases(rResult.data);
    setForbidden(false);
    setError(null);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  const selectedEntries = useMemo(
    () =>
      items.filter(
        (tpl) =>
          tpl.latestApprovedVersionId &&
          selected.has(tpl.latestApprovedVersionId),
      ),
    [items, selected],
  );

  function toggleVersion(versionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  }

  async function handlePublish(data: {
    versionLabel: string;
    changelog: string;
    immediate: boolean;
  }) {
    setPublishing(true);
    const templateVersionIds = selectedEntries
      .map((tpl) => tpl.latestApprovedVersionId!)
      .filter(Boolean);

    if (templateVersionIds.length === 0) {
      pushToast(t(locale, 'studio.catalog.empty'), 'error');
      setPublishing(false);
      return;
    }

    const composeEntries = selectedEntries.map((tpl) => ({
      templateVersionId: tpl.latestApprovedVersionId!,
      definitionId: tpl.slug,
      weight: 100,
      repetitionCooldownRounds: 0,
      paused: false,
    }));

    const result = await adminApiFetch<{ releaseId: string }>(
      '/content/catalog/compose',
      {
        method: 'POST',
        body: JSON.stringify({
          versionLabel: data.versionLabel,
          changelog: data.changelog || undefined,
          immediate: data.immediate,
          entries: composeEntries,
        }),
      },
    );
    setPublishing(false);
    setPublishOpen(false);
    if (!result.ok) {
      // Fallback to classic publish with version ids
      const fallback = await adminApiFetch<{ releaseId: string }>(
        '/content/catalog/publish',
        {
          method: 'POST',
          body: JSON.stringify({
            versionLabel: data.versionLabel,
            templateVersionIds,
            changelog: data.changelog || undefined,
            immediate: data.immediate,
          }),
        },
      );
      if (!fallback.ok) {
        pushToast(
          localizeAdminError(locale, result.error.code, result.error.message),
          'error',
        );
        return;
      }
    }
    pushToast(t(locale, 'studio.publish.success'), 'success');
    void load();
  }

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, 'studio.catalog.title')}
        subtitle={t(locale, 'studio.catalog.subtitle')}
        primaryAction={
          canPublish ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPublishOpen(true)}
              disabled={selected.size === 0}
            >
              {t(locale, 'content.publishCatalog')}
            </button>
          ) : null
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

      {!loading && !error ? (
        <div className="stack" style={{ gap: '1.25rem' }}>
          <div className="panel">
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>
              {t(locale, 'studio.catalog.entries')}
            </h2>
            {items.length === 0 ? (
              <EmptyState label={t(locale, 'studio.catalog.empty')} />
            ) : (
              <div className="table-wrap">
                <table className="studio-data-table">
                  <thead>
                    <tr>
                      <th aria-label="Select" />
                      <th>{t(locale, 'studio.library.col.title')}</th>
                      <th>{t(locale, 'studio.library.col.engine')}</th>
                      <th>{t(locale, 'studio.library.col.status')}</th>
                      <th>{t(locale, 'studio.library.col.version')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((tpl) => {
                      const vid = tpl.latestApprovedVersionId!;
                      return (
                        <tr key={tpl.templateId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(vid)}
                              onChange={() => toggleVersion(vid)}
                              aria-label={tpl.internalTitle}
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>{tpl.internalTitle}</td>
                          <td>{tpl.engineId ?? tpl.familyId}</td>
                          <td>
                            <StatusChip locale={locale} status={tpl.status} />
                          </td>
                          <td>{tpl.latestVersion ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>
              {t(locale, 'content.releases')}
            </h2>
            {releases.length === 0 ? (
              <EmptyState label={t(locale, 'common.empty')} />
            ) : (
              <div className="table-wrap">
                <table className="studio-data-table">
                  <thead>
                    <tr>
                      <th>{t(locale, 'content.versionLabel')}</th>
                      <th>{t(locale, 'common.status')}</th>
                      <th>{t(locale, 'studio.library.col.updated')}</th>
                      <th>{t(locale, 'content.changelog')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((release) => (
                      <tr key={release.releaseId}>
                        <td style={{ fontWeight: 600 }}>{release.versionLabel}</td>
                        <td>
                          {release.isCurrent ? '● Current' : release.kind}
                        </td>
                        <td>
                          {new Date(release.publishedAt).toLocaleString(locale)}
                        </td>
                        <td
                          style={{
                            color: 'var(--lh-text-muted)',
                            fontSize: '0.88rem',
                          }}
                        >
                          {release.changelog ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <PublishWizard
        locale={locale}
        open={publishOpen}
        busy={publishing}
        onCancel={() => setPublishOpen(false)}
        onConfirm={(data) => void handlePublish(data)}
      />
    </div>
  );
}
