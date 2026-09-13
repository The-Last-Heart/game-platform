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
import { StudioPageHeader } from './StudioPageHeader';

type StudioOpsProps = {
  locale: Locale;
  canPublish: boolean;
};

export function StudioOps({ locale, canPublish }: StudioOpsProps) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AdminContentTemplateSummary[]>([]);
  const [releases, setReleases] = useState<AdminContentReleaseSummary[]>([]);

  // Pause form
  const [pauseTemplateId, setPauseTemplateId] = useState('');
  const [pauseState, setPauseState] = useState(true);
  const [pauseReason, setPauseReason] = useState('');

  // Rollback form
  const [rollbackReleaseId, setRollbackReleaseId] = useState('');
  const [rollbackLabel, setRollbackLabel] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  // Match pins
  const [matchId, setMatchId] = useState('');
  const [pins, setPins] = useState<AdminMatchPinsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tResult, rResult] = await Promise.all([
      adminApiFetch<AdminContentTemplateSummary[]>('/content/templates'),
      adminApiFetch<AdminContentReleaseSummary[]>('/content/releases'),
    ]);
    if (!tResult.ok || !rResult.ok) {
      const failed = !tResult.ok ? tResult : rResult;
      if (!failed.ok) {
        setForbidden(failed.status === 403 || failed.error.code === 'FORBIDDEN');
        setError(localizeAdminError(locale, failed.error.code, failed.error.message));
      }
      setLoading(false);
      return;
    }
    setTemplates(tResult.data);
    setReleases(rResult.data);
    setForbidden(false);
    setError(null);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  async function handlePause() {
    if (!canPublish || !pauseTemplateId || pauseReason.length < 3) return;
    const result = await adminApiFetch<{ definitionId: string; paused: boolean }>(
      '/content/pause',
      {
        method: 'POST',
        body: JSON.stringify({
          definitionId: pauseTemplateId,
          paused: pauseState,
          reason: pauseReason,
        }),
      },
    );
    if (!result.ok) {
      pushToast(localizeAdminError(locale, result.error.code, result.error.message), 'error');
      return;
    }
    pushToast(t(locale, 'studio.ops.pauseSuccess'), 'success');
    void load();
  }

  async function handleRollback() {
    if (!canPublish || !rollbackReleaseId || !rollbackLabel || rollbackReason.length < 3) return;
    const result = await adminApiFetch<{ releaseId: string }>(
      '/content/catalog/rollback',
      {
        method: 'POST',
        body: JSON.stringify({
          fromCatalogReleaseId: rollbackReleaseId,
          versionLabel: rollbackLabel,
          reason: rollbackReason,
        }),
      },
    );
    if (!result.ok) {
      pushToast(localizeAdminError(locale, result.error.code, result.error.message), 'error');
      return;
    }
    pushToast(t(locale, 'studio.ops.rollbackSuccess'), 'success');
    void load();
  }

  async function lookupPins() {
    if (!matchId.trim()) return;
    const result = await adminApiFetch<AdminMatchPinsResponse>(
      `/content/matches/${encodeURIComponent(matchId)}/pins`,
    );
    if (!result.ok) {
      setPins(null);
      pushToast(
        result.error.code === 'NOT_FOUND'
          ? t(locale, 'studio.ops.noPins')
          : localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    setPins(result.data);
  }

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, 'studio.ops.title')}
        subtitle={t(locale, 'studio.ops.subtitle')}
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
        <div className="stack" style={{ gap: '1.5rem' }}>
          {/* Pause/Resume */}
          <div className="panel stack">
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t(locale, 'studio.ops.pauseResume')}</h2>
            <div className="field">
              <label htmlFor="ops-pause-tpl">{t(locale, 'studio.ops.selectTemplate')}</label>
              <select
                id="ops-pause-tpl"
                value={pauseTemplateId}
                onChange={(e) => setPauseTemplateId(e.target.value)}
                disabled={!canPublish}
              >
                <option value="">—</option>
                {templates.map((tpl) => (
                  <option key={tpl.templateId} value={tpl.slug}>
                    {tpl.internalTitle} ({tpl.slug})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pauseState}
                  onChange={(e) => setPauseState(e.target.checked)}
                  disabled={!canPublish}
                  style={{ accentColor: 'var(--lh-accent)' }}
                />
                {t(locale, 'content.paused')}
              </label>
            </div>
            <div className="field">
              <label htmlFor="ops-pause-reason">{t(locale, 'studio.ops.reason')}</label>
              <input
                id="ops-pause-reason"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                disabled={!canPublish}
                placeholder={t(locale, 'studio.ops.reasonHint')}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canPublish || !pauseTemplateId || pauseReason.length < 3}
              onClick={() => void handlePause()}
            >
              {pauseState ? t(locale, 'studio.ops.pauseAction') : t(locale, 'studio.ops.resumeAction')}
            </button>
          </div>

          {/* Rollback */}
          <div className="panel stack">
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t(locale, 'studio.ops.rollback')}</h2>
            <div className="field">
              <label htmlFor="ops-rollback-release">{t(locale, 'studio.ops.selectRelease')}</label>
              <select
                id="ops-rollback-release"
                value={rollbackReleaseId}
                onChange={(e) => setRollbackReleaseId(e.target.value)}
                disabled={!canPublish}
              >
                <option value="">—</option>
                {releases
                  .filter((r) => r.kind === 'challenge_catalog')
                  .map((r) => (
                    <option key={r.releaseId} value={r.releaseId}>
                      {r.versionLabel} {r.isCurrent ? '(current)' : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ops-rollback-label">{t(locale, 'content.versionLabel')}</label>
              <input
                id="ops-rollback-label"
                value={rollbackLabel}
                onChange={(e) => setRollbackLabel(e.target.value)}
                disabled={!canPublish}
              />
            </div>
            <div className="field">
              <label htmlFor="ops-rollback-reason">{t(locale, 'studio.ops.reason')}</label>
              <input
                id="ops-rollback-reason"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                disabled={!canPublish}
                placeholder={t(locale, 'studio.ops.reasonHint')}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canPublish || !rollbackReleaseId || !rollbackLabel || rollbackReason.length < 3}
              onClick={() => void handleRollback()}
            >
              {t(locale, 'studio.ops.rollbackAction')}
            </button>
          </div>

          {/* Match pin lookup */}
          <div className="panel stack">
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t(locale, 'studio.ops.matchPins')}</h2>
            <div className="field">
              <label htmlFor="ops-match-id">{t(locale, 'content.matchId')}</label>
              <input
                id="ops-match-id"
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!matchId.trim()}
              onClick={() => void lookupPins()}
            >
              {t(locale, 'studio.ops.lookupPins')}
            </button>
            {pins ? (
              <div>
                <h3 style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>{t(locale, 'studio.ops.pinResults')}</h3>
                <pre className="metadata-pre">{JSON.stringify(pins, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
