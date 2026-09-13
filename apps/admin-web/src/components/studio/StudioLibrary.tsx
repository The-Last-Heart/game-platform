'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AdminContentTemplateSummary,
  ContentLifecycleStatus,
} from '@thelastheart/contracts';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import { adminApiFetch } from '@/lib/api/client';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { StatusChip } from './StatusChip';
import { StudioPageHeader } from './StudioPageHeader';

const STATUSES: ContentLifecycleStatus[] = [
  'draft', 'submitted', 'in_review', 'approved', 'scheduled', 'published', 'paused', 'retired',
];

const ENGINE_FAMILIES = [
  'wait_for_signal', 'no_touch', 'reverse_swipe', 'precision', 'memory',
  'hold', 'shake', 'tilt', 'audio', 'pair_sync', 'risk_choice',
];

type StudioLibraryProps = {
  locale: Locale;
  canDraft: boolean;
};

export function StudioLibrary({ locale, canDraft }: StudioLibraryProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<AdminContentTemplateSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const family = searchParams.get('family') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminApiFetch<AdminContentTemplateSummary[]>(
      '/content/templates',
    );
    if (!result.ok) {
      setForbidden(result.status === 403 || result.error.code === 'FORBIDDEN');
      setError(localizeAdminError(locale, result.error.code, result.error.message));
      setData(null);
      setLoading(false);
      return;
    }
    setForbidden(false);
    setError(null);
    setData(result.data);
    setLoading(false);
  }, [locale]);

  useEffect(() => scheduleEffectTask(() => void load()), [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    next.set('page', '1');
    const nextQ = String(form.get('q') ?? '').trim();
    const nextStatus = String(form.get('status') ?? '');
    const nextFamily = String(form.get('family') ?? '');
    if (nextQ) next.set('q', nextQ);
    if (nextStatus) next.set('status', nextStatus);
    if (nextFamily) next.set('family', nextFamily);
    router.push(`/${locale}/content/library?${next.toString()}`);
  }

  // Client-side filtering since API may return all
  const filtered = (data ?? []).filter((tpl) => {
    if (q && !tpl.internalTitle.toLowerCase().includes(q.toLowerCase()) && !tpl.slug.toLowerCase().includes(q.toLowerCase())) {
      return false;
    }
    if (status && tpl.status !== status) return false;
    if (family && tpl.familyId !== family) return false;
    return true;
  });

  const pageSize = 20;
  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (forbidden) return <ForbiddenState label={t(locale, 'common.forbidden')} />;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, 'studio.library.title')}
        subtitle={t(locale, 'studio.library.subtitle')}
        primaryAction={
          canDraft ? (
            <Link className="btn btn-primary" href={`/${locale}/content/templates/new`}>
              {t(locale, 'studio.library.newChallenge')}
            </Link>
          ) : null
        }
      />

      <form className="filters panel" onSubmit={applyFilters}>
        <div className="field">
          <label htmlFor="lib-q">{t(locale, 'studio.library.search')}</label>
          <input id="lib-q" name="q" defaultValue={q} placeholder={t(locale, 'studio.library.search')} />
        </div>
        <div className="field">
          <label htmlFor="lib-status">{t(locale, 'studio.library.filterStatus')}</label>
          <select id="lib-status" name="status" defaultValue={status}>
            <option value="">{t(locale, 'common.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(locale, `studio.status.${s}` as keyof typeof import('@/i18n/messages/en').default)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lib-family">{t(locale, 'studio.library.filterFamily')}</label>
          <select id="lib-family" name="family" defaultValue={family}>
            <option value="">{t(locale, 'common.all')}</option>
            {ENGINE_FAMILIES.map((f) => (
              <option key={f} value={f}>{t(locale, `studio.engine.${f}` as keyof typeof import('@/i18n/messages/en').default)}</option>
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
      {!loading && data && paged.length === 0 ? (
        <EmptyState label={t(locale, 'studio.library.empty')} />
      ) : null}
      {!loading && data && paged.length > 0 ? (
        <>
          <div className="panel table-wrap">
            <table className="studio-data-table">
              <thead>
                <tr>
                  <th>{t(locale, 'studio.library.col.title')}</th>
                  <th>{t(locale, 'studio.library.col.engine')}</th>
                  <th>{t(locale, 'studio.library.col.status')}</th>
                  <th>{t(locale, 'studio.library.col.version')}</th>
                  <th>{t(locale, 'studio.library.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((tpl) => (
                  <tr key={tpl.templateId}>
                    <td>
                      <Link href={`/${locale}/content/templates/${tpl.templateId}`} style={{ fontWeight: 600 }}>
                        {tpl.internalTitle}
                      </Link>
                      <div style={{ fontSize: '0.8rem', color: 'var(--lh-text-muted)' }}>
                        {tpl.slug}
                      </div>
                    </td>
                    <td>{tpl.familyId}</td>
                    <td><StatusChip locale={locale} status={tpl.status} /></td>
                    <td>{tpl.latestVersion ?? '—'}</td>
                    <td>
                      <div className="cell-actions">
                        <Link
                          href={`/${locale}/content/templates/${tpl.templateId}`}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.82rem', padding: '0.25rem 0.5rem' }}
                        >
                          {t(locale, 'studio.library.open')}
                        </Link>
                        {canDraft ? (
                          <Link
                            href={`/${locale}/content/templates/${tpl.templateId}/edit`}
                            className="btn btn-ghost"
                            style={{ fontSize: '0.82rem', padding: '0.25rem 0.5rem' }}
                          >
                            {t(locale, 'studio.library.edit')}
                          </Link>
                        ) : null}
                      </div>
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
                router.push(`/${locale}/content/library?${next.toString()}`);
              }}
            >
              {t(locale, 'common.previous')}
            </button>
            <span>
              {t(locale, 'common.page')} {page} {t(locale, 'common.of')} {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.set('page', String(page + 1));
                router.push(`/${locale}/content/library?${next.toString()}`);
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
