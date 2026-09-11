'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AdminAdministrator,
  AdminAdministratorListResponse,
  AdminRole,
  AdminUserStatus,
} from '@thelastheart/contracts';
import { ADMIN_ROLES, ADMIN_USER_STATUSES } from '@thelastheart/contracts';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';

function roleLabel(locale: Locale, role: AdminRole): string {
  return t(locale, `admins.role.${role}` as MessageKey);
}

function statusLabel(locale: Locale, status: AdminUserStatus): string {
  return t(locale, `admins.status.${status}` as MessageKey);
}

export function AdministratorsList({
  locale,
  canWrite,
}: {
  locale: Locale;
  canWrite: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<AdminAdministratorListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const page = Number(searchParams.get('page') ?? '1') || 1;
  const q = searchParams.get('q') ?? '';
  const role = searchParams.get('role') ?? '';
  const status = searchParams.get('status') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (q.trim()) params.set('q', q.trim());
    if (role) params.set('role', role);
    if (status) params.set('status', status);

    const result = await adminApiFetch<AdminAdministratorListResponse>(
      `/administrators?${params.toString()}`,
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(result.error.message);
      setData(null);
      setLoading(false);
      return;
    }
    setForbidden(false);
    setError(null);
    setData(result.data);
    setLoading(false);
  }, [page, q, role, status]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    next.set('page', '1');
    const nextQ = String(form.get('q') ?? '').trim();
    const nextRole = String(form.get('role') ?? '');
    const nextStatus = String(form.get('status') ?? '');
    if (nextQ) next.set('q', nextQ);
    if (nextRole) next.set('role', nextRole);
    if (nextStatus) next.set('status', nextStatus);
    router.push(`/${locale}/administrators?${next.toString()}`);
  }

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'admins.title')}</h1>
          <p>{t(locale, 'admins.subtitle')}</p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary"
            href={`/${locale}/administrators/new`}
          >
            {t(locale, 'admins.create')}
          </Link>
        ) : null}
      </div>

      <form className="filters panel" onSubmit={applyFilters}>
        <div className="field">
          <label htmlFor="admins-q">{t(locale, 'common.search')}</label>
          <input id="admins-q" name="q" defaultValue={q} />
        </div>
        <div className="field">
          <label htmlFor="admins-role">{t(locale, 'common.role')}</label>
          <select id="admins-role" name="role" defaultValue={role}>
            <option value="">{t(locale, 'common.all')}</option>
            {ADMIN_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="admins-status">{t(locale, 'common.status')}</label>
          <select id="admins-status" name="status" defaultValue={status}>
            <option value="">{t(locale, 'common.all')}</option>
            {ADMIN_USER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          {t(locale, 'common.applyFilters')}
        </button>
      </form>

      {loading ? <LoadingState label={t(locale, 'common.loading')} /> : null}
      {!loading && error ? (
        <ErrorState
          label={error}
          retryLabel={t(locale, 'common.retry')}
          onRetry={() => void load()}
        />
      ) : null}
      {!loading && data && data.items.length === 0 ? (
        <EmptyState label={t(locale, 'admins.empty')} />
      ) : null}
      {!loading && data && data.items.length > 0 ? (
        <>
          <div className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(locale, 'admins.displayName')}</th>
                  <th>{t(locale, 'admins.email')}</th>
                  <th>{t(locale, 'admins.role')}</th>
                  <th>{t(locale, 'admins.status')}</th>
                  <th>{t(locale, 'admins.lastLogin')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((admin) => (
                  <tr key={admin.id}>
                    <td>
                      <Link href={`/${locale}/administrators/${admin.id}`}>
                        {admin.displayName}
                      </Link>
                    </td>
                    <td>{admin.email}</td>
                    <td>{roleLabel(locale, admin.role)}</td>
                    <td>{statusLabel(locale, admin.status)}</td>
                    <td>
                      {admin.lastLoginAt
                        ? new Date(admin.lastLoginAt).toLocaleString(locale)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.set('page', String(page - 1));
                router.push(`/${locale}/administrators?${next.toString()}`);
              }}
            >
              {t(locale, 'common.previous')}
            </button>
            <span>
              {t(locale, 'common.page')} {data.pagination.page}{' '}
              {t(locale, 'common.of')} {Math.max(data.pagination.totalPages, 1)}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= data.pagination.totalPages}
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.set('page', String(page + 1));
                router.push(`/${locale}/administrators?${next.toString()}`);
              }}
            >
              {t(locale, 'common.next')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AdministratorCreateForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    const result = await adminApiFetch<{ administrator: AdminAdministrator }>(
      '/administrators',
      {
        method: 'POST',
        body: JSON.stringify({
          email: String(form.get('email') ?? '').trim(),
          displayName: String(form.get('displayName') ?? '').trim(),
          role: String(form.get('role') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      },
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    pushToast(t(locale, 'admins.createSuccess'), 'success');
    router.push(`/${locale}/administrators/${result.data.administrator.id}`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'admins.createTitle')}</h1>
        </div>
        <Link className="btn btn-secondary" href={`/${locale}/administrators`}>
          {t(locale, 'common.back')}
        </Link>
      </div>
      <form className="panel stack" onSubmit={onSubmit}>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="field">
          <label htmlFor="create-email">{t(locale, 'admins.email')}</label>
          <input id="create-email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="create-name">{t(locale, 'admins.displayName')}</label>
          <input id="create-name" name="displayName" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="create-role">{t(locale, 'admins.role')}</label>
          <select id="create-role" name="role" defaultValue="viewer" required>
            {ADMIN_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="create-password">
            {t(locale, 'admins.password')}
          </label>
          <input
            id="create-password"
            name="password"
            type="password"
            minLength={12}
            required
            aria-describedby="create-password-hint"
          />
          <span id="create-password-hint" className="field-error">
            {t(locale, 'admins.passwordHint')}
          </span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting
            ? t(locale, 'common.creating')
            : t(locale, 'common.create')}
        </button>
      </form>
    </div>
  );
}

export function AdministratorDetailForm({
  locale,
  id,
}: {
  locale: Locale;
  id: string;
}) {
  const { pushToast } = useToast();
  const [admin, setAdmin] = useState<AdminAdministrator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<{ administrator: AdminAdministrator }>(
      `/administrators/${id}`,
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(result.error.message);
      setAdmin(null);
      setLoading(false);
      return;
    }
    setAdmin(result.data.administrator);
    setError(null);
    setForbidden(false);
    setLoading(false);
  }, [id]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin) return;
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const body: Record<string, string> = {
      displayName: String(form.get('displayName') ?? '').trim(),
      role: String(form.get('role') ?? ''),
      status: String(form.get('status') ?? ''),
    };
    if (password) {
      body.password = password;
    }
    setSubmitting(true);
    const result = await adminApiFetch<{ administrator: AdminAdministrator }>(
      `/administrators/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    setAdmin(result.data.administrator);
    pushToast(t(locale, 'admins.saveSuccess'), 'success');
  }

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }
  if (loading) {
    return <LoadingState label={t(locale, 'common.loading')} />;
  }
  if (error || !admin) {
    return (
      <ErrorState
        label={error ?? t(locale, 'common.error')}
        retryLabel={t(locale, 'common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'admins.detailTitle')}</h1>
          <p>{admin.email}</p>
        </div>
        <Link className="btn btn-secondary" href={`/${locale}/administrators`}>
          {t(locale, 'common.back')}
        </Link>
      </div>
      <form className="panel stack" onSubmit={onSubmit}>
        {formError ? <p className="form-error">{formError}</p> : null}
        <div className="field">
          <label htmlFor="detail-name">{t(locale, 'admins.displayName')}</label>
          <input
            id="detail-name"
            name="displayName"
            defaultValue={admin.displayName}
            required
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="detail-role">{t(locale, 'admins.role')}</label>
          <select id="detail-role" name="role" defaultValue={admin.role}>
            {ADMIN_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="detail-status">{t(locale, 'admins.status')}</label>
          <select id="detail-status" name="status" defaultValue={admin.status}>
            {ADMIN_USER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="detail-password">
            {t(locale, 'admins.newPassword')}
          </label>
          <input
            id="detail-password"
            name="password"
            type="password"
            minLength={12}
            aria-describedby="detail-password-hint"
          />
          <span id="detail-password-hint">
            {t(locale, 'admins.passwordHint')}
          </span>
        </div>
        <dl className="definition-list">
          <div>
            <dt>{t(locale, 'admins.lastLogin')}</dt>
            <dd>
              {admin.lastLoginAt
                ? new Date(admin.lastLoginAt).toLocaleString(locale)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t(locale, 'admins.createdAt')}</dt>
            <dd>{new Date(admin.createdAt).toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t(locale, 'admins.updatedAt')}</dt>
            <dd>{new Date(admin.updatedAt).toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t(locale, 'admins.passwordChangedAt')}</dt>
            <dd>{new Date(admin.passwordChangedAt).toLocaleString(locale)}</dd>
          </div>
        </dl>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? t(locale, 'common.saving') : t(locale, 'common.save')}
        </button>
      </form>
    </div>
  );
}
