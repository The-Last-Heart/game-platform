'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AdminAuditLogListResponse,
  AdminAuditOutcome,
} from '@thelastheart/contracts';
import { ADMIN_AUDIT_OUTCOMES } from '@thelastheart/contracts';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';

function outcomeLabel(locale: Locale, outcome: AdminAuditOutcome): string {
  return t(locale, `audit.outcome.${outcome}` as MessageKey);
}

/** Normalize filter datetime values to ISO-8601 for the contracts schema. */
function toIsoFilter(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  return parsed.toISOString();
}

const FILTER_KEYS = [
  'action',
  'entityType',
  'entityId',
  'outcome',
  'actorAdminId',
  'from',
  'to',
] as const;

export function AuditLogPanel({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<AdminAuditLogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const page = Number(searchParams.get('page') ?? '1') || 1;
  const action = searchParams.get('action') ?? '';
  const entityType = searchParams.get('entityType') ?? '';
  const entityId = searchParams.get('entityId') ?? '';
  const outcome = searchParams.get('outcome') ?? '';
  const actorAdminId = searchParams.get('actorAdminId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (action.trim()) params.set('action', action.trim());
    if (entityType.trim()) params.set('entityType', entityType.trim());
    if (entityId.trim()) params.set('entityId', entityId.trim());
    if (outcome) params.set('outcome', outcome);
    if (actorAdminId.trim()) params.set('actorAdminId', actorAdminId.trim());
    const fromIso = toIsoFilter(from);
    const toIso = toIsoFilter(to);
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);

    const result = await adminApiFetch<AdminAuditLogListResponse>(
      `/audit-logs?${params.toString()}`,
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
  }, [page, action, entityType, entityId, outcome, actorAdminId, from, to]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    next.set('page', '1');
    for (const key of FILTER_KEYS) {
      const value = String(form.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    router.push(`/${locale}/audit-log?${next.toString()}`);
  }

  if (forbidden) {
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t(locale, 'audit.title')}</h1>
          <p>{t(locale, 'audit.subtitle')}</p>
        </div>
      </div>

      <form className="filters panel" onSubmit={applyFilters}>
        <div className="field">
          <label htmlFor="audit-action">{t(locale, 'audit.action')}</label>
          <input id="audit-action" name="action" defaultValue={action} />
        </div>
        <div className="field">
          <label htmlFor="audit-entity">{t(locale, 'audit.entityType')}</label>
          <input
            id="audit-entity"
            name="entityType"
            defaultValue={entityType}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-entity-id">{t(locale, 'audit.entityId')}</label>
          <input
            id="audit-entity-id"
            name="entityId"
            defaultValue={entityId}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-actor">{t(locale, 'audit.actor')}</label>
          <input
            id="audit-actor"
            name="actorAdminId"
            defaultValue={actorAdminId}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-outcome">{t(locale, 'audit.outcome')}</label>
          <select id="audit-outcome" name="outcome" defaultValue={outcome}>
            <option value="">{t(locale, 'common.all')}</option>
            {ADMIN_AUDIT_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {outcomeLabel(locale, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audit-from">{t(locale, 'audit.from')}</label>
          <input
            id="audit-from"
            name="from"
            type="datetime-local"
            defaultValue={from}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-to">{t(locale, 'audit.to')}</label>
          <input
            id="audit-to"
            name="to"
            type="datetime-local"
            defaultValue={to}
          />
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
        <EmptyState label={t(locale, 'audit.empty')} />
      ) : null}
      {!loading && data && data.items.length > 0 ? (
        <>
          <div className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(locale, 'audit.createdAt')}</th>
                  <th>{t(locale, 'audit.action')}</th>
                  <th>{t(locale, 'audit.actor')}</th>
                  <th>{t(locale, 'audit.entityType')}</th>
                  <th>{t(locale, 'audit.outcome')}</th>
                  <th>{t(locale, 'audit.metadata')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString(locale)}</td>
                    <td>{entry.action}</td>
                    <td>{entry.actorAdminId ?? '—'}</td>
                    <td>
                      {entry.entityType}
                      {entry.entityId ? ` / ${entry.entityId}` : ''}
                    </td>
                    <td>{outcomeLabel(locale, entry.outcome)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [entry.id]: !prev[entry.id],
                          }))
                        }
                      >
                        {expanded[entry.id]
                          ? t(locale, 'audit.collapse')
                          : t(locale, 'audit.expand')}
                      </button>
                      {expanded[entry.id] ? (
                        <pre className="metadata-pre">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      ) : null}
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
                // Preserve all active filters while changing page.
                const next = new URLSearchParams(searchParams.toString());
                next.set('page', String(page - 1));
                router.push(`/${locale}/audit-log?${next.toString()}`);
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
                router.push(`/${locale}/audit-log?${next.toString()}`);
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
