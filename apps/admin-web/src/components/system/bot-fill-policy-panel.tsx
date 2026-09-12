'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminBotFillPolicy } from '@thelastheart/contracts';
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

export function BotFillPolicyPanel({ locale }: { locale: Locale }) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [waitMs, setWaitMs] = useState(15000);
  const [reason, setReason] = useState('bot-fill policy update');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminBotFillPolicy>(
      '/matchmaking/bot-fill-policy',
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
      setLoading(false);
      return;
    }
    setForbidden(false);
    setError(null);
    setEnabled(result.data.enabled);
    setWaitMs(result.data.waitMs);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  const save = async () => {
    setSaving(true);
    const result = await adminApiFetch<AdminBotFillPolicy>(
      '/matchmaking/bot-fill-policy',
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled, waitMs, reason }),
      },
    );
    setSaving(false);
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    setEnabled(result.data.enabled);
    setWaitMs(result.data.waitMs);
    pushToast(t(locale, 'liveOps.botFillSaved'), 'success');
  };

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>{t(locale, 'liveOps.botFillTitle')}</h2>
          <p>{t(locale, 'liveOps.botFillSubtitle')}</p>
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
        <div className="stack">
          <label className="field">
            <span>{t(locale, 'liveOps.botFillEnabled')}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.botFillWaitMs')}</span>
            <input
              type="number"
              min={0}
              max={600000}
              step={500}
              value={waitMs}
              onChange={(event) =>
                setWaitMs(Number.parseInt(event.target.value || '0', 10))
              }
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.botFillReason')}</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving
                ? t(locale, 'common.saving')
                : t(locale, 'liveOps.botFillSave')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
