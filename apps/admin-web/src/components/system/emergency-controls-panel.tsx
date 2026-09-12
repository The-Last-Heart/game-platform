'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminEmergencyControls } from '@thelastheart/contracts';
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

export function EmergencyControlsPanel({ locale }: { locale: Locale }) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchmakingPaused, setMatchmakingPaused] = useState(false);
  const [botFillEnabled, setBotFillEnabled] = useState(false);
  const [botFillWaitMs, setBotFillWaitMs] = useState(15000);
  const [offensivePowersDisabled, setOffensivePowersDisabled] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminEmergencyControls>(
      '/emergency/controls',
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
    setMatchmakingPaused(result.data.matchmakingPaused);
    setBotFillEnabled(result.data.botFillEnabled);
    setBotFillWaitMs(result.data.botFillWaitMs);
    setOffensivePowersDisabled(result.data.offensivePowersDisabled);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  const save = async () => {
    setSaving(true);
    const result = await adminApiFetch<AdminEmergencyControls>(
      '/emergency/controls',
      {
        method: 'PATCH',
        body: JSON.stringify({
          matchmakingPaused,
          botFillEnabled,
          botFillWaitMs,
          offensivePowersDisabled,
          confirmation: true,
          reason,
        }),
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
    setMatchmakingPaused(result.data.matchmakingPaused);
    setBotFillEnabled(result.data.botFillEnabled);
    setBotFillWaitMs(result.data.botFillWaitMs);
    setOffensivePowersDisabled(result.data.offensivePowersDisabled);
    setConfirmation(false);
    pushToast(t(locale, 'liveOps.emergencySaved'), 'success');
  };

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>{t(locale, 'liveOps.emergencyTitle')}</h2>
          <p>{t(locale, 'liveOps.emergencySubtitle')}</p>
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
            <span>{t(locale, 'liveOps.matchmakingPaused')}</span>
            <input
              type="checkbox"
              checked={matchmakingPaused}
              onChange={(event) => setMatchmakingPaused(event.target.checked)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.botFillEnabled')}</span>
            <input
              type="checkbox"
              checked={botFillEnabled}
              onChange={(event) => setBotFillEnabled(event.target.checked)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.botFillWaitMs')}</span>
            <input
              type="number"
              min={0}
              max={600000}
              step={500}
              value={botFillWaitMs}
              onChange={(event) =>
                setBotFillWaitMs(Number.parseInt(event.target.value || '0', 10))
              }
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.offensivePowersDisabled')}</span>
            <input
              type="checkbox"
              checked={offensivePowersDisabled}
              onChange={(event) =>
                setOffensivePowersDisabled(event.target.checked)
              }
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.emergencyReason')}</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.emergencyConfirm')}</span>
            <input
              type="checkbox"
              checked={confirmation}
              onChange={(event) => setConfirmation(event.target.checked)}
            />
          </label>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !confirmation || reason.trim().length < 3}
              onClick={() => void save()}
            >
              {saving
                ? t(locale, 'common.saving')
                : t(locale, 'liveOps.emergencySave')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
