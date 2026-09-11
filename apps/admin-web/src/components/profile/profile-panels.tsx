'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import type { AdminSessionSnapshot } from '@/lib/auth/session';

export function ProfilePanel({
  locale,
  session,
}: {
  locale: Locale;
  session: AdminSessionSnapshot;
}) {
  const { user } = session;
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
      <section className="panel">
        <dl className="definition-list">
          <div>
            <dt>{t(locale, 'profile.displayName')}</dt>
            <dd>{user.displayName}</dd>
          </div>
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
  }

  async function revokeOthers() {
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
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          void revokeOthers();
        }}
      />
    </div>
  );
}
