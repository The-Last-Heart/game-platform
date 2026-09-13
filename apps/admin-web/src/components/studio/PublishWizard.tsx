'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

type PublishWizardProps = {
  locale: Locale;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (data: {
    versionLabel: string;
    changelog: string;
    immediate: boolean;
    scheduledAt?: string;
  }) => void;
};

export function PublishWizard({
  locale,
  open,
  busy,
  onCancel,
  onConfirm,
}: PublishWizardProps) {
  const [versionLabel, setVersionLabel] = useState('');
  const [changelog, setChangelog] = useState('');
  const [immediate, setImmediate] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!open) return null;

  function handlePublish() {
    setConfirmOpen(true);
  }

  function handleConfirm() {
    setConfirmOpen(false);
    onConfirm({
      versionLabel,
      changelog,
      immediate,
      scheduledAt: immediate ? undefined : scheduledAt,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={() => { if (!busy) onCancel(); }}>
      <div
        className="dialog"
        style={{ width: 'min(100%, 32rem)' }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t(locale, 'studio.publish.title')}</h2>
        <p style={{ color: 'var(--lh-text-muted)', marginBottom: '1rem' }}>
          {t(locale, 'studio.publish.subtitle')}
        </p>

        <div className="publish-wizard">
          <div className="field">
            <label htmlFor="publish-version">{t(locale, 'studio.publish.versionLabel')}</label>
            <input
              id="publish-version"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <label htmlFor="publish-changelog">{t(locale, 'studio.publish.changelog')}</label>
            <textarea
              id="publish-changelog"
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              style={{ minHeight: '4rem', resize: 'vertical' }}
              disabled={busy}
            />
            <span style={{ color: 'var(--lh-text-muted)', fontSize: '0.8rem' }}>
              {t(locale, 'studio.publish.changelogHint')}
            </span>
          </div>

          <div className="schedule-toggle">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="publish-timing"
                checked={immediate}
                onChange={() => setImmediate(true)}
                style={{ accentColor: 'var(--lh-accent)' }}
                disabled={busy}
              />
              {t(locale, 'studio.publish.immediate')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="publish-timing"
                checked={!immediate}
                onChange={() => setImmediate(false)}
                style={{ accentColor: 'var(--lh-accent)' }}
                disabled={busy}
              />
              {t(locale, 'studio.publish.schedule')}
            </label>
          </div>

          {!immediate ? (
            <div className="field">
              <label htmlFor="publish-schedule-at">{t(locale, 'studio.publish.scheduleAt')}</label>
              <input
                id="publish-schedule-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={busy}
              />
            </div>
          ) : null}
        </div>

        <div className="dialog-actions" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {t(locale, 'common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={busy || !versionLabel.trim()}
          >
            {busy ? t(locale, 'studio.publish.publishing') : t(locale, 'studio.publish.confirm')}
          </button>
        </div>

        <ConfirmDialog
          locale={locale}
          open={confirmOpen}
          message={`${t(locale, 'studio.publish.confirm')}: ${versionLabel}`}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
