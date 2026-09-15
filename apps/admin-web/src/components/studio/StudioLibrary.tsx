'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AdminContentTemplateListResponse,
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
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { StatusChip } from './StatusChip';
import { StudioPageHeader } from './StudioPageHeader';

const STATUS_FILTERS: { value: ContentLifecycleStatus; labelKey: MessageKey }[] = [
  { value: 'draft', labelKey: 'studio.status.draft' },
  { value: 'submitted', labelKey: 'studio.status.submitted' },
  { value: 'in_review', labelKey: 'studio.status.inReview' },
  { value: 'approved', labelKey: 'studio.status.approved' },
  { value: 'scheduled', labelKey: 'studio.status.scheduled' },
  { value: 'published', labelKey: 'studio.status.published' },
  { value: 'paused', labelKey: 'studio.status.paused' },
  { value: 'retired', labelKey: 'studio.status.retired' },
];

const ENGINE_FAMILY_FILTERS: { value: string; labelKey: MessageKey }[] = [
  { value: 'reaction', labelKey: 'studio.catalog.category.reaction' },
  { value: 'trap', labelKey: 'studio.catalog.category.trap' },
  { value: 'gesture', labelKey: 'studio.catalog.category.gesture' },
  { value: 'tap', labelKey: 'studio.catalog.category.tap' },
  { value: 'memory', labelKey: 'studio.catalog.category.memory' },
  { value: 'hold', labelKey: 'studio.catalog.category.hold' },
  { value: 'motion', labelKey: 'studio.catalog.category.motion' },
  { value: 'audio', labelKey: 'studio.catalog.category.audio' },
  { value: 'social', labelKey: 'studio.catalog.category.social' },
  { value: 'tactical', labelKey: 'studio.catalog.category.tactical' },
  { value: 'trivia', labelKey: 'studio.catalog.category.trivia' },
  { value: 'geography', labelKey: 'studio.catalog.category.geography' },
  { value: 'focus', labelKey: 'studio.catalog.category.focus' },
  { value: 'order', labelKey: 'studio.catalog.category.order' },
  { value: 'precision', labelKey: 'studio.catalog.category.precision' },
  { value: 'logic', labelKey: 'studio.catalog.category.logic' },
  { value: 'search', labelKey: 'studio.catalog.category.search' },
];

type StudioLibraryProps = {
  locale: Locale;
  canDraft: boolean;
};

export function StudioLibrary({ locale, canDraft }: StudioLibraryProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<AdminContentTemplateListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const family = searchParams.get('family') ?? '';
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (q) params.set('search', q);
    if (status) params.set('status', status);
    if (family) params.set('familyId', family);

    const result = await adminApiFetch<AdminContentTemplateListResponse>(
      `/content/templates?${params.toString()}`,
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
  }, [locale, page, q, status, family]);

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

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1;

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
          <input
            id="lib-q"
            name="q"
            defaultValue={q}
            placeholder={t(locale, 'studio.library.search')}
          />
        </div>
        <div className="field">
          <label htmlFor="lib-status">{t(locale, 'studio.library.filterStatus')}</label>
          <select id="lib-status" name="status" defaultValue={status}>
            <option value="">{t(locale, 'common.all')}</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {t(locale, s.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lib-family">{t(locale, 'studio.library.filterFamily')}</label>
          <select id="lib-family" name="family" defaultValue={family}>
            <option value="">{t(locale, 'common.all')}</option>
            {ENGINE_FAMILY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {t(locale, f.labelKey)}
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
      {!loading && data && items.length === 0 ? (
        <EmptyState label={t(locale, 'studio.library.empty')} />
      ) : null}
      {!loading && data && items.length > 0 ? (
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
                {items.map((tpl) => (
                  <tr key={tpl.templateId}>
                    <td>
                      <Link
                        href={`/${locale}/content/templates/${tpl.templateId}`}
                        style={{ fontWeight: 600 }}
                      >
                        {tpl.internalTitle}
                      </Link>
                      <div style={{ fontSize: '0.8rem', color: 'var(--lh-text-muted)' }}>
                        {tpl.slug}
                      </div>
                    </td>
                    <td>{tpl.engineId ?? tpl.familyId}</td>
                    <td>
                      <StatusChip locale={locale} status={tpl.status} />
                    </td>
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
