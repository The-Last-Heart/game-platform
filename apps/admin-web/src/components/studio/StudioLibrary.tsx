'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminContentBulkPauseResponse,
  AdminContentTemplateListResponse,
  ContentLifecycleStatus,
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
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import { scheduleEffectTask } from '@/lib/react/schedule-effect-task';
import { StatusChip } from './StatusChip';
import { StudioPageHeader } from './StudioPageHeader';
import { partitionBulkLifecycleSelection } from './studio-library-bulk';

const STATUS_FILTERS: {
  value: ContentLifecycleStatus;
  labelKey: MessageKey;
}[] = [
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

const BULK_NAME_PREVIEW = 5;

type StudioLibraryProps = {
  locale: Locale;
  canDraft: boolean;
  canPublish: boolean;
};

type BulkAction = 'pause' | 'resume';

export function StudioLibrary({
  locale,
  canDraft,
  canPublish,
}: StudioLibraryProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useToast();
  const [data, setData] = useState<AdminContentTemplateListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

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
    setSelected(new Set());
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

  const items = useMemo(() => data?.items ?? [], [data]);
  const totalPages = data
    ? Math.max(Math.ceil(data.total / data.pageSize), 1)
    : 1;
  const pageIds = useMemo(() => items.map((tpl) => tpl.templateId), [items]);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id));
  const selectAllRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) {
        el.indeterminate = someSelected && !allSelected;
      }
    },
    [someSelected, allSelected],
  );

  const bulkPaused = bulkAction === 'pause';
  const { eligible: bulkEligible, skipped: bulkSkipped } = useMemo(
    () =>
      partitionBulkLifecycleSelection(
        items,
        selected,
        bulkAction == null ? true : bulkPaused,
      ),
    [items, selected, bulkAction, bulkPaused],
  );

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pageIds));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBulk(action: BulkAction) {
    if (!canPublish || selected.size === 0 || bulkBusy) return;
    setBulkReason('');
    setBulkAction(action);
  }

  function closeBulk() {
    if (bulkBusy) return;
    setBulkAction(null);
    setBulkReason('');
  }

  async function confirmBulk() {
    if (!canPublish || bulkAction == null || bulkBusy) return;
    if (bulkEligible.length === 0) return;
    if (bulkReason.trim().length < 3) {
      pushToast(t(locale, 'studio.ops.reasonHint'), 'error');
      document.getElementById('lib-bulk-reason')?.focus();
      return;
    }
    setBulkBusy(true);
    const result = await adminApiFetch<AdminContentBulkPauseResponse>(
      '/content/pause/bulk',
      {
        method: 'POST',
        body: JSON.stringify({
          templateIds: bulkEligible.map((item) => item.templateId),
          paused: bulkPaused,
          reason: bulkReason.trim(),
        }),
      },
    );
    if (!result.ok) {
      setBulkBusy(false);
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    pushToast(
      t(locale, 'studio.library.bulkSuccess')
        .replace('{updated}', String(result.data.updated.length))
        .replace(
          '{skipped}',
          String(result.data.skipped.length + bulkSkipped.length),
        ),
      'success',
    );
    setBulkAction(null);
    setBulkReason('');
    setBulkBusy(false);
    await load();
  }

  if (forbidden)
    return <ForbiddenState label={t(locale, 'common.forbidden')} />;

  const previewNames = bulkEligible.slice(0, BULK_NAME_PREVIEW);
  const extraNames = Math.max(bulkEligible.length - previewNames.length, 0);
  const bulkConfirmDisabled =
    bulkEligible.length === 0 || bulkReason.trim().length < 3;

  return (
    <div className="studio-layout">
      <StudioPageHeader
        title={t(locale, 'studio.library.title')}
        subtitle={t(locale, 'studio.library.subtitle')}
        primaryAction={
          canDraft ? (
            <Link
              className="btn btn-primary"
              href={`/${locale}/content/templates/new`}
            >
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
          <label htmlFor="lib-status">
            {t(locale, 'studio.library.filterStatus')}
          </label>
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
          <label htmlFor="lib-family">
            {t(locale, 'studio.library.filterFamily')}
          </label>
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
          {canPublish ? (
            <div className="studio-bulk-bar panel">
              <span>
                {t(locale, 'studio.library.selectedCount').replace(
                  '{count}',
                  String(selected.size),
                )}
              </span>
              <div className="inline-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => openBulk('pause')}
                >
                  {t(locale, 'studio.library.bulkPause')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => openBulk('resume')}
                >
                  {t(locale, 'studio.library.bulkResume')}
                </button>
              </div>
            </div>
          ) : null}
          <div className="panel table-wrap">
            <table className="studio-data-table">
              <thead>
                <tr>
                  {canPublish ? (
                    <th style={{ width: '2.5rem' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={selectAllRef}
                        onChange={toggleAll}
                        aria-label={t(locale, 'studio.library.selectAll')}
                        style={{ accentColor: 'var(--lh-accent)' }}
                      />
                    </th>
                  ) : null}
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
                    {canPublish ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(tpl.templateId)}
                          onChange={() => toggleRow(tpl.templateId)}
                          aria-label={t(
                            locale,
                            'studio.library.selectRow',
                          ).replace('{title}', tpl.internalTitle)}
                          style={{ accentColor: 'var(--lh-accent)' }}
                        />
                      </td>
                    ) : null}
                    <td>
                      <Link
                        href={`/${locale}/content/templates/${tpl.templateId}`}
                        style={{ fontWeight: 600 }}
                      >
                        {tpl.internalTitle}
                      </Link>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--lh-text-muted)',
                        }}
                      >
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
                          style={{
                            fontSize: '0.82rem',
                            padding: '0.25rem 0.5rem',
                          }}
                        >
                          {t(locale, 'studio.library.open')}
                        </Link>
                        {canDraft ? (
                          <Link
                            href={`/${locale}/content/templates/${tpl.templateId}/edit`}
                            className="btn btn-ghost"
                            style={{
                              fontSize: '0.82rem',
                              padding: '0.25rem 0.5rem',
                            }}
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
              {t(locale, 'common.page')} {page} {t(locale, 'common.of')}{' '}
              {totalPages}
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

      <ConfirmDialog
        locale={locale}
        open={bulkAction != null}
        title={
          bulkPaused
            ? t(locale, 'studio.library.bulkPauseTitle')
            : t(locale, 'studio.library.bulkResumeTitle')
        }
        message={
          bulkEligible.length === 0
            ? t(locale, 'studio.library.bulkNoneEligible')
            : (bulkPaused
                ? t(locale, 'studio.library.bulkPauseMessage')
                : t(locale, 'studio.library.bulkResumeMessage')
              ).replace('{count}', String(bulkEligible.length))
        }
        confirmLabel={
          bulkPaused
            ? t(locale, 'studio.ops.pauseAction')
            : t(locale, 'studio.ops.resumeAction')
        }
        danger={bulkPaused}
        busy={bulkBusy}
        confirmDisabled={bulkConfirmDisabled}
        onCancel={closeBulk}
        onConfirm={() => void confirmBulk()}
      >
        {bulkEligible.length > 0 ? (
          <ul className="dialog-name-list">
            {previewNames.map((item) => (
              <li key={item.templateId}>{item.internalTitle}</li>
            ))}
            {extraNames > 0 ? (
              <li>
                {t(locale, 'studio.library.bulkNamesMore').replace(
                  '{count}',
                  String(extraNames),
                )}
              </li>
            ) : null}
          </ul>
        ) : null}
        {bulkSkipped.length > 0 ? (
          <p>
            {t(locale, 'studio.library.bulkSkipped').replace(
              '{count}',
              String(bulkSkipped.length),
            )}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="lib-bulk-reason">
            {t(locale, 'studio.ops.reason')}
          </label>
          <input
            id="lib-bulk-reason"
            value={bulkReason}
            onChange={(event) => setBulkReason(event.target.value)}
            disabled={bulkBusy || bulkEligible.length === 0}
            placeholder={t(locale, 'studio.ops.reasonHint')}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
