'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AdminAdministrator,
  AdminAdministratorListResponse,
  AdminAdministratorSortField,
  AdminRole,
  AdminSortOrder,
  AdminUserStatus,
} from '@thelastheart/contracts';
import {
  ADMIN_ADMINISTRATOR_SORT_FIELDS,
  ADMIN_ROLES,
  ADMIN_USER_STATUSES,
} from '@thelastheart/contracts';
import {
  ConfirmDialog,
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

function roleLabel(locale: Locale, role: AdminRole): string {
  return t(locale, `admins.role.${role}` as MessageKey);
}

function statusLabel(locale: Locale, status: AdminUserStatus): string {
  return t(locale, `admins.status.${status}` as MessageKey);
}

const ROLE_RANK: Record<AdminRole, number> = {
  super_admin: 5,
  content_manager: 4,
  live_ops: 3,
  translator: 2,
  viewer: 1,
};

type PendingDanger = 'deactivate' | 'passwordReset' | 'roleReduction';

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
  const sortBy = (searchParams.get('sortBy') ??
    'createdAt') as AdminAdministratorSortField;
  const sortOrder = (searchParams.get('sortOrder') ?? 'asc') as AdminSortOrder;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (q.trim()) params.set('q', q.trim());
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);

    const result = await adminApiFetch<AdminAdministratorListResponse>(
      `/administrators?${params.toString()}`,
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
      setData(null);
      setLoading(false);
      return;
    }
    setForbidden(false);
    setError(null);
    setData(result.data);
    setLoading(false);
  }, [page, q, role, status, sortBy, sortOrder, locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    next.set('page', '1');
    const nextQ = String(form.get('q') ?? '').trim();
    const nextRole = String(form.get('role') ?? '');
    const nextStatus = String(form.get('status') ?? '');
    const nextSortBy = String(form.get('sortBy') ?? 'createdAt');
    const nextSortOrder = String(form.get('sortOrder') ?? 'asc');
    if (nextQ) next.set('q', nextQ);
    if (nextRole) next.set('role', nextRole);
    if (nextStatus) next.set('status', nextStatus);
    next.set('sortBy', nextSortBy);
    next.set('sortOrder', nextSortOrder);
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
        <div className="field">
          <label htmlFor="admins-sort-by">{t(locale, 'admins.sortBy')}</label>
          <select id="admins-sort-by" name="sortBy" defaultValue={sortBy}>
            {ADMIN_ADMINISTRATOR_SORT_FIELDS.map((value) => (
              <option key={value} value={value}>
                {t(locale, `admins.sort.${value}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="admins-sort-order">
            {t(locale, 'admins.sortOrder')}
          </label>
          <select
            id="admins-sort-order"
            name="sortOrder"
            defaultValue={sortOrder}
          >
            <option value="asc">{t(locale, 'admins.sort.asc')}</option>
            <option value="desc">{t(locale, 'admins.sort.desc')}</option>
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
      setError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
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
  canWrite,
  viewerId,
}: {
  locale: Locale;
  id: string;
  canWrite: boolean;
  viewerId: string;
}) {
  const { pushToast } = useToast();
  const [admin, setAdmin] = useState<AdminAdministrator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<Record<string, string> | null>(
    null,
  );
  const [confirmKind, setConfirmKind] = useState<PendingDanger | null>(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<{ administrator: AdminAdministrator }>(
      `/administrators/${id}`,
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
      setAdmin(null);
      setLoading(false);
      return;
    }
    setAdmin(result.data.administrator);
    setError(null);
    setForbidden(false);
    setLoading(false);
  }, [id, locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  async function submitPatch(body: Record<string, string>) {
    setSubmitting(true);
    const result = await adminApiFetch<{ administrator: AdminAdministrator }>(
      `/administrators/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    setSubmitting(false);
    setConfirmKind(null);
    setPendingBody(null);
    if (!result.ok) {
      setFormError(
        localizeAdminError(locale, result.error.code, result.error.message),
      );
      return;
    }
    setAdmin(result.data.administrator);
    pushToast(t(locale, 'admins.saveSuccess'), 'success');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || !canWrite || submitting) return;
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const nextRole = String(form.get('role') ?? '') as AdminRole;
    const nextStatus = String(form.get('status') ?? '') as AdminUserStatus;
    const body: Record<string, string> = {
      displayName: String(form.get('displayName') ?? '').trim(),
      role: nextRole,
      status: nextStatus,
    };
    if (password) {
      body.password = password;
    }

    const isOther = viewerId !== admin.id;
    const deactivating =
      nextStatus === 'deactivated' && admin.status !== 'deactivated';
    const passwordReset = Boolean(password) && isOther;
    const roleReduction =
      ROLE_RANK[nextRole] < ROLE_RANK[admin.role] && nextRole !== admin.role;

    if (deactivating) {
      setPendingBody(body);
      setConfirmKind('deactivate');
      return;
    }
    if (passwordReset) {
      setPendingBody(body);
      setConfirmKind('passwordReset');
      return;
    }
    if (roleReduction) {
      setPendingBody(body);
      setConfirmKind('roleReduction');
      return;
    }

    void submitPatch(body);
  }

  async function revokeSessions() {
    if (!canWrite || revoking) return;
    setRevoking(true);
    const result = await adminApiFetch<{ revokedCount: number }>(
      `/administrators/${id}/revoke-sessions`,
      { method: 'POST' },
    );
    setRevoking(false);
    setRevokeConfirmOpen(false);
    if (!result.ok) {
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    pushToast(
      `${t(locale, 'admins.revokeSessionsSuccess')} (${result.data.revokedCount})`,
      'success',
    );
  }

  function confirmMessage(): string {
    if (confirmKind === 'deactivate') {
      return t(locale, 'admins.confirmDeactivate');
    }
    if (confirmKind === 'passwordReset') {
      return t(locale, 'admins.confirmPasswordReset');
    }
    if (confirmKind === 'roleReduction') {
      return t(locale, 'admins.confirmRoleReduction');
    }
    return t(locale, 'confirm.title');
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

  const readOnly = !canWrite;

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
      {readOnly ? (
        <p className="panel">{t(locale, 'admins.readOnly')}</p>
      ) : null}
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
            disabled={readOnly || submitting}
            key={`name-${admin.updatedAt}`}
          />
        </div>
        <div className="field">
          <label htmlFor="detail-role">{t(locale, 'admins.role')}</label>
          <select
            id="detail-role"
            name="role"
            defaultValue={admin.role}
            disabled={readOnly || submitting}
            key={`role-${admin.updatedAt}`}
          >
            {ADMIN_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="detail-status">{t(locale, 'admins.status')}</label>
          <select
            id="detail-status"
            name="status"
            defaultValue={admin.status}
            disabled={readOnly || submitting}
            key={`status-${admin.updatedAt}`}
          >
            {ADMIN_USER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        {canWrite ? (
          <div className="field">
            <label htmlFor="detail-password">
              {t(locale, 'admins.newPassword')}
            </label>
            <input
              id="detail-password"
              name="password"
              type="password"
              minLength={12}
              disabled={submitting}
              aria-describedby="detail-password-hint"
            />
            <span id="detail-password-hint">
              {t(locale, 'admins.passwordHint')}
            </span>
          </div>
        ) : null}
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
        {canWrite ? (
          <div className="dialog-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || revoking}
            >
              {submitting
                ? t(locale, 'common.saving')
                : t(locale, 'common.save')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={submitting || revoking}
              onClick={() => setRevokeConfirmOpen(true)}
            >
              {t(locale, 'admins.revokeSessions')}
            </button>
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        locale={locale}
        open={confirmKind !== null}
        message={confirmMessage()}
        danger
        busy={submitting}
        onCancel={() => {
          if (submitting) return;
          setConfirmKind(null);
          setPendingBody(null);
        }}
        onConfirm={() => {
          if (!pendingBody || submitting) return;
          void submitPatch(pendingBody);
        }}
      />

      <ConfirmDialog
        locale={locale}
        open={revokeConfirmOpen}
        message={t(locale, 'admins.revokeSessionsConfirm')}
        danger
        busy={revoking}
        onCancel={() => {
          if (revoking) return;
          setRevokeConfirmOpen(false);
        }}
        onConfirm={() => {
          void revokeSessions();
        }}
      />
    </div>
  );
}
