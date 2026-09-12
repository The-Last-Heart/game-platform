'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminContentReleaseSummary,
  AdminContentTemplateSummary,
  AdminMatchPinsResponse,
} from '@thelastheart/contracts';
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

export function ContentAdminPanel({ locale }: { locale: Locale }) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AdminContentTemplateSummary[]>(
    [],
  );
  const [releases, setReleases] = useState<AdminContentReleaseSummary[]>([]);

  const [versionLabel, setVersionLabel] = useState('');
  const [templateVersionIds, setTemplateVersionIds] = useState('');
  const [changelog, setChangelog] = useState('');

  const [definitionId, setDefinitionId] = useState(
    'reaction.wait_for_signal.dev',
  );
  const [paused, setPaused] = useState(true);
  const [pauseReason, setPauseReason] = useState('');

  const [fromReleaseId, setFromReleaseId] = useState(
    '11111111-1111-4111-8111-111111111111',
  );
  const [rollbackLabel, setRollbackLabel] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  const [matchId, setMatchId] = useState('');
  const [pins, setPins] = useState<AdminMatchPinsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [templatesResult, releasesResult] = await Promise.all([
      adminApiFetch<AdminContentTemplateSummary[]>('/content/templates'),
      adminApiFetch<AdminContentReleaseSummary[]>('/content/releases'),
    ]);
    if (!templatesResult.ok || !releasesResult.ok) {
      const failed = !templatesResult.ok ? templatesResult : releasesResult;
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
    setForbidden(false);
    setError(null);
    setTemplates(templatesResult.data);
    setReleases(releasesResult.data);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  const publish = async () => {
    const ids = templateVersionIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const result = await adminApiFetch<{ releaseId: string }>(
      '/content/catalog/publish',
      {
        method: 'POST',
        body: JSON.stringify({
          versionLabel,
          templateVersionIds: ids,
          changelog: changelog || undefined,
          immediate: true,
        }),
      },
    );
    if (!result.ok) {
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    pushToast(t(locale, 'content.published'), 'success');
    void load();
  };

  const savePause = async () => {
    const result = await adminApiFetch<{ definitionId: string; paused: boolean }>(
      '/content/pause',
      {
        method: 'POST',
        body: JSON.stringify({
          definitionId,
          paused,
          reason: pauseReason,
        }),
      },
    );
    if (!result.ok) {
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    pushToast(t(locale, 'content.pauseSaved'), 'success');
  };

  const rollback = async () => {
    const result = await adminApiFetch<{ releaseId: string }>(
      '/content/catalog/rollback',
      {
        method: 'POST',
        body: JSON.stringify({
          fromCatalogReleaseId: fromReleaseId,
          versionLabel: rollbackLabel,
          reason: rollbackReason,
        }),
      },
    );
    if (!result.ok) {
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    pushToast(t(locale, 'content.rollbackSaved'), 'success');
    void load();
  };

  const lookupPins = async () => {
    const result = await adminApiFetch<AdminMatchPinsResponse>(
      `/content/matches/${encodeURIComponent(matchId)}/pins`,
    );
    if (!result.ok) {
      setPins(null);
      pushToast(
        result.error.code === 'NOT_FOUND'
          ? t(locale, 'content.pinsNotFound')
          : localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    setPins(result.data);
  };

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <section className="panel">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>{t(locale, 'content.title')}</h1>
          <p>{t(locale, 'content.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load()}
        >
          {t(locale, 'common.refresh')}
        </button>
      </div>

      {loading ? <LoadingState label={t(locale, 'common.loading')} /> : null}
      {!loading && error ? (
        <ErrorState
          label={error}
          retryLabel={t(locale, 'common.retry')}
          onRetry={() => void load()}
        />
      ) : null}

      {!loading && !error ? (
        <div className="stack" style={{ gap: '1.5rem' }}>
          <div>
            <h2>{t(locale, 'content.templates')}</h2>
            <ul>
              {templates.map((template) => (
                <li key={template.templateId}>
                  {template.slug} — v{template.latestVersion ?? '—'} (
                  {template.status})
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2>{t(locale, 'content.releases')}</h2>
            <ul>
              {releases.map((release) => (
                <li key={release.releaseId}>
                  {release.kind} {release.versionLabel}
                  {release.isCurrent ? ` [${t(locale, 'content.current')}]` : ''}{' '}
                  — {release.releaseId}
                </li>
              ))}
            </ul>
          </div>

          <div className="stack">
            <h2>{t(locale, 'content.publishCatalog')}</h2>
            <label className="field">
              <span>{t(locale, 'content.versionLabel')}</span>
              <input
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t(locale, 'content.templateVersionIds')}</span>
              <input
                value={templateVersionIds}
                onChange={(event) => setTemplateVersionIds(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t(locale, 'content.changelog')}</span>
              <input
                value={changelog}
                onChange={(event) => setChangelog(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void publish()}
            >
              {t(locale, 'content.publish')}
            </button>
          </div>

          <div className="stack">
            <h2>{t(locale, 'content.pauseDefinition')}</h2>
            <label className="field">
              <span>{t(locale, 'content.definitionId')}</span>
              <input
                value={definitionId}
                onChange={(event) => setDefinitionId(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t(locale, 'content.paused')}</span>
              <input
                type="checkbox"
                checked={paused}
                onChange={(event) => setPaused(event.target.checked)}
              />
            </label>
            <label className="field">
              <span>{t(locale, 'content.pauseReason')}</span>
              <input
                value={pauseReason}
                onChange={(event) => setPauseReason(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void savePause()}
            >
              {t(locale, 'content.pauseSave')}
            </button>
          </div>

          <div className="stack">
            <h2>{t(locale, 'content.rollback')}</h2>
            <label className="field">
              <span>{t(locale, 'content.fromReleaseId')}</span>
              <input
                value={fromReleaseId}
                onChange={(event) => setFromReleaseId(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t(locale, 'content.versionLabel')}</span>
              <input
                value={rollbackLabel}
                onChange={(event) => setRollbackLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t(locale, 'content.rollbackReason')}</span>
              <input
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void rollback()}
            >
              {t(locale, 'content.rollbackSave')}
            </button>
          </div>

          <div className="stack">
            <h2>{t(locale, 'content.matchPins')}</h2>
            <label className="field">
              <span>{t(locale, 'content.matchId')}</span>
              <input
                value={matchId}
                onChange={(event) => setMatchId(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void lookupPins()}
            >
              {t(locale, 'content.lookupPins')}
            </button>
            {pins ? (
              <pre style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(pins, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
