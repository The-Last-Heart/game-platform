'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AdminAuthenticatedUser,
  AdminSessionsResponse,
} from '@thelastheart/contracts';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import type { AdminSessionSnapshot } from '@/lib/auth/session';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';

export function ProfilePanel({
  locale,
  session,
}: {
  locale: Locale;
  session: AdminSessionSnapshot;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [user, setUser] = useState<AdminAuthenticatedUser>(session.user);
  const [displayName, setDisplayName] = useState(session.user.displayName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const nextName = displayName.trim();
    if (!nextName) {
      setError(t(locale, 'common.error'));
      return;
    }
    setSubmitting(true);
    const result = await adminApiFetch<{ user: AdminAuthenticatedUser }>(
      '/auth/profile',
      {
        method: 'PATCH',
        body: JSON.stringify({ displayName: nextName }),
      },
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setUser(result.data.user);
    setDisplayName(result.data.user.displayName);
    pushToast(t(locale, 'profile.saveSuccess'), 'success');
    router.refresh();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'profile.title')}</h1>
          <p>{t(locale, 'profile.subtitle')}</p>
        </div>
        <Link
          className="btn btn-secondary"
          href={`/${locale}/profile/security`}
        >
          {t(locale, 'profile.securityLink')}
        </Link>
      </div>
      <section className="panel stack">
        <form className="stack" onSubmit={onSubmit}>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="field">
            <label htmlFor="profile-display-name">
              {t(locale, 'profile.displayName')}
            </label>
            <input
              id="profile-display-name"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={120}
              disabled={submitting}
              aria-describedby="profile-display-name-hint"
            />
            <span id="profile-display-name-hint">
              {t(locale, 'profile.displayNameHint')}
            </span>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting
              ? t(locale, 'common.saving')
              : t(locale, 'profile.updateDisplayName')}
          </button>
        </form>
        <dl className="definition-list">
          <div>
            <dt>{t(locale, 'profile.email')}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{t(locale, 'profile.role')}</dt>
            <dd>{t(locale, `admins.role.${user.role}` as MessageKey)}</dd>
          </div>
          <div>
            <dt>{t(locale, 'profile.status')}</dt>
            <dd>{t(locale, `admins.status.${user.status}` as MessageKey)}</dd>
          </div>
          <div>
            <dt>{t(locale, 'profile.lastLogin')}</dt>
            <dd>
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString(locale)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t(locale, 'profile.passwordChanged')}</dt>
            <dd>{new Date(user.passwordChangedAt).toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t(locale, 'profile.sessionExpires')}</dt>
            <dd>
              {new Date(session.session.expiresAt).toLocaleString(locale)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export function SecurityPanel({ locale }: { locale: Locale }) {
  const { pushToast } = useToast();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [sessions, setSessions] = useState<AdminSessionsResponse | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    const result = await adminApiFetch<AdminSessionsResponse>('/auth/sessions');
    if (!result.ok) {
      setSessions(null);
      setSessionsError(
        result.error.message || t(locale, 'security.sessionsLoadError'),
      );
      setSessionsLoading(false);
      return;
    }
    setSessionsError(null);
    setSessions(result.data);
    setSessionsLoading(false);
  }, [locale]);

  useEffect(
    () => scheduleEffectTask(() => void loadSessions()),
    [loadSessions],
  );

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (newPassword.length < 12) {
      setPasswordError(t(locale, 'security.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t(locale, 'security.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    const result = await adminApiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSubmitting(false);
    if (!result.ok) {
      setPasswordError(result.error.message);
      return;
    }
    event.currentTarget.reset();
    pushToast(t(locale, 'security.passwordSuccess'), 'success');
    void loadSessions();
  }

  async function revokeOthers() {
    if (revoking) return;
    setRevoking(true);
    const result = await adminApiFetch<{ revokedCount: number }>(
      '/auth/revoke-other-sessions',
      { method: 'POST' },
    );
    setRevoking(false);
    setConfirmOpen(false);
    if (!result.ok) {
      pushToast(result.error.message, 'error');
      return;
    }
    pushToast(
      `${t(locale, 'security.revokeSuccess')} (${t(locale, 'security.revokedCount')}: ${result.data.revokedCount})`,
      'success',
    );
    void loadSessions();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'security.title')}</h1>
          <p>{t(locale, 'security.subtitle')}</p>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>{t(locale, 'security.changePassword')}</h2>
          <form className="stack" onSubmit={onChangePassword}>
            {passwordError ? (
              <p className="form-error">{passwordError}</p>
            ) : null}
            <div className="field">
              <label htmlFor="current-password">
                {t(locale, 'security.currentPassword')}
              </label>
              <input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">
                {t(locale, 'security.newPassword')}
              </label>
              <input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">
                {t(locale, 'security.confirmPassword')}
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                disabled={submitting}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? t(locale, 'common.saving')
                : t(locale, 'common.save')}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>{t(locale, 'security.sessionsTitle')}</h2>
          <p>{t(locale, 'security.sessionsBody')}</p>

          {sessionsLoading ? (
            <LoadingState label={t(locale, 'common.loading')} />
          ) : null}
          {!sessionsLoading && sessionsError ? (
            <ErrorState
              label={sessionsError}
              retryLabel={t(locale, 'common.retry')}
              onRetry={() => void loadSessions()}
            />
          ) : null}
          {!sessionsLoading &&
          !sessionsError &&
          sessions &&
          sessions.sessions.length === 0 ? (
            <EmptyState label={t(locale, 'security.sessionsEmpty')} />
          ) : null}
          {!sessionsLoading &&
          !sessionsError &&
          sessions &&
          sessions.sessions.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'security.sessionDevice')}</th>
                    <th>{t(locale, 'security.sessionCreated')}</th>
                    <th>{t(locale, 'security.sessionLastSeen')}</th>
                    <th>{t(locale, 'security.sessionExpires')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.sessions.map((row) => (
                    <tr key={row.sessionId}>
                      <td>
                        {row.current ? (
                          <span className="env-badge">
                            {t(locale, 'security.sessionCurrent')}
                          </span>
                        ) : null}{' '}
                        {row.deviceDescription}
                      </td>
                      <td>{new Date(row.createdAt).toLocaleString(locale)}</td>
                      <td>{new Date(row.lastSeenAt).toLocaleString(locale)}</td>
                      <td>{new Date(row.expiresAt).toLocaleString(locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setConfirmOpen(true)}
            disabled={revoking}
          >
            {t(locale, 'security.revokeOthers')}
          </button>
        </section>
      </div>

      <ConfirmDialog
        locale={locale}
        open={confirmOpen}
        message={t(locale, 'security.revokeConfirm')}
        danger
        busy={revoking}
        onCancel={() => {
          if (revoking) return;
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          void revokeOthers();
        }}
      />
    </div>
  );
}
