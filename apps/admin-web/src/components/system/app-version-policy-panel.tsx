'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminAppVersionPolicy } from '@thelastheart/contracts';
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

export function AppVersionPolicyPanel({ locale }: { locale: Locale }) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AdminAppVersionPolicy | null>(null);
  const [minimumSupportedVersion, setMinimumSupportedVersion] = useState('');
  const [androidStoreUrl, setAndroidStoreUrl] = useState('');
  const [iosStoreUrl, setIosStoreUrl] = useState('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminAppVersionPolicy>(
      '/system/app-version-policy',
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
    setPolicy(result.data);
    setMinimumSupportedVersion(result.data.minimumSupportedVersion);
    setAndroidStoreUrl(result.data.androidStoreUrl);
    setIosStoreUrl(result.data.iosStoreUrl);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    const result = await adminApiFetch<AdminAppVersionPolicy>(
      '/system/app-version-policy',
      {
        method: 'PATCH',
        body: JSON.stringify({
          minimumSupportedVersion,
          androidStoreUrl,
          iosStoreUrl,
          policyRevision: policy.policyRevision,
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
    setPolicy(result.data);
    setMinimumSupportedVersion(result.data.minimumSupportedVersion);
    setAndroidStoreUrl(result.data.androidStoreUrl);
    setIosStoreUrl(result.data.iosStoreUrl);
    setConfirmation(false);
    setReason('');
    pushToast(t(locale, 'system.versionPolicySaved'), 'success');
  };

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>{t(locale, 'system.versionPolicyTitle')}</h2>
          <p>{t(locale, 'system.versionPolicySubtitle')}</p>
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

      {!loading && !error && policy ? (
        <div className="stack">
          <p className="muted">
            {t(locale, 'system.versionPolicyRevision')}: {policy.policyRevision}
            {policy.updatedAt
              ? ` · ${t(locale, 'system.versionPolicyUpdatedAt')}: ${policy.updatedAt}`
              : null}
            {policy.updatedByDisplayName
              ? ` · ${policy.updatedByDisplayName}`
              : null}
          </p>
          {typeof policy.sessionsBelowMinimum === 'number' ? (
            <p className="muted">
              {t(locale, 'system.versionPolicySessionsBelow')}:{' '}
              {policy.sessionsBelowMinimum}
            </p>
          ) : null}
          <p className="muted">
            {t(locale, 'system.versionPolicyRaiseWarning')}
          </p>

          <label className="field">
            <span>{t(locale, 'system.versionPolicyMinimum')}</span>
            <input
              value={minimumSupportedVersion}
              onChange={(e) => setMinimumSupportedVersion(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'system.versionPolicyAndroidUrl')}</span>
            <input
              value={androidStoreUrl}
              onChange={(e) => setAndroidStoreUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'system.versionPolicyIosUrl')}</span>
            <input
              value={iosStoreUrl}
              onChange={(e) => setIosStoreUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t(locale, 'liveOps.emergencyReason')}</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
            />
          </label>
          <label
            className="field"
            style={{ flexDirection: 'row', gap: '0.5rem' }}
          >
            <input
              type="checkbox"
              checked={confirmation}
              onChange={(e) => setConfirmation(e.target.checked)}
            />
            <span>
              {t(locale, 'system.versionPolicyConfirm')} (
              {policy.minimumSupportedVersion} → {minimumSupportedVersion})
            </span>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !confirmation || reason.trim().length < 3}
            onClick={() => void save()}
          >
            {t(locale, 'system.versionPolicySave')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
