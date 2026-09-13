'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { AdminContentReleaseSummary } from '@thelastheart/contracts';
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
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { FieldInput, FieldTextarea, FieldGroup } from './Field';
import { StudioPageHeader } from './StudioPageHeader';

export type StudioReleaseKind =
  | 'localization'
  | 'power'
  | 'mode-rules'
  | 'daily-goals';

const ENDPOINTS: Record<StudioReleaseKind, string> = {
  localization: '/content/localization/publish',
  power: '/content/power/publish',
  'mode-rules': '/content/mode-rules/publish',
  'daily-goals': '/content/daily-goals/publish',
};

const KIND_FILTER: Record<StudioReleaseKind, string> = {
  localization: 'localization',
  power: 'power_configuration',
  'mode-rules': 'game_mode_rules',
  'daily-goals': 'daily_goals',
};

type StudioKindReleaseEditorProps = {
  locale: Locale;
  kind: StudioReleaseKind;
  canPublish: boolean;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  defaultPayload: Record<string, unknown>;
};

export function StudioKindReleaseEditor({
  locale,
  kind,
  canPublish,
  titleKey,
  subtitleKey,
  defaultPayload,
}: StudioKindReleaseEditorProps) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releases, setReleases] = useState<AdminContentReleaseSummary[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const [changelog, setChangelog] = useState('');
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(defaultPayload, null, 2),
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminContentReleaseSummary[]>(
      '/content/releases',
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
      setLoading(false);
      return;
    }
    setReleases(
      result.data.filter((r) => r.kind === KIND_FILTER[kind]),
    );
    setForbidden(false);
    setError(null);
    setLoading(false);
  }, [locale, kind]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  async function onPublish(event: FormEvent) {
    event.preventDefault();
    if (!canPublish) return;
    setBusy(true);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      pushToast(t(locale, 'studio.validation.required'), 'error');
      setBusy(false);
      return;
    }
    const result = await adminApiFetch<{ releaseId: string }>(ENDPOINTS[kind], {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        versionLabel,
        changelog: changelog || payload.changelog || undefined,
        immediate: true,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    pushToast(t(locale, 'studio.publish.success'), 'success');
    setVersionLabel('');
    setChangelog('');
    void load();
  }

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, titleKey)}
        subtitle={t(locale, subtitleKey)}
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
        <div className="studio-editor-workspace" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <form className="panel stack" onSubmit={(e) => void onPublish(e)}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
              {t(locale, 'studio.publish.title')}
            </h2>
            <FieldGroup>
              <FieldInput
                label={t(locale, 'content.versionLabel')}
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.currentTarget.value)}
                required
              />
              <FieldTextarea
                label={t(locale, 'content.changelog')}
                value={changelog}
                onChange={(e) => setChangelog(e.currentTarget.value)}
                rows={2}
              />
              <FieldTextarea
                label={t(locale, 'studio.field.payload')}
                value={payloadText}
                onChange={(e) => setPayloadText(e.currentTarget.value)}
                rows={18}
                hint={t(locale, 'studio.field.payloadHint')}
              />
            </FieldGroup>
            {canPublish ? (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !versionLabel.trim()}
              >
                {busy ? t(locale, 'common.loading') : t(locale, 'studio.publish.confirm')}
              </button>
            ) : null}
          </form>
          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
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
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((r) => (
                      <tr key={r.releaseId}>
                        <td style={{ fontWeight: 600 }}>{r.versionLabel}</td>
                        <td>{r.isCurrent ? '● Current' : r.kind}</td>
                        <td>
                          {new Date(r.publishedAt).toLocaleString(locale)}
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
    </div>
  );
}
