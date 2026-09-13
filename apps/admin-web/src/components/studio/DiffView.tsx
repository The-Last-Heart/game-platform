'use client';

import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

export type DiffEntry = {
  field: string;
  previous: string;
  current: string;
};

type DiffViewProps = {
  locale: Locale;
  entries: DiffEntry[];
};

export function DiffView({ locale, entries }: DiffViewProps) {
  if (entries.length === 0) {
    return (
      <div className="empty-block">
        <p>{t(locale, 'studio.diff.noChanges')}</p>
      </div>
    );
  }

  return (
    <div className="diff-list">
      <div className="diff-row" style={{ borderBottom: '2px solid var(--lh-border)' }}>
        <span className="diff-field" style={{ fontWeight: 700 }}>
          {t(locale, 'studio.diff.field')}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--lh-text-muted)', fontSize: '0.85rem' }}>
          {t(locale, 'studio.diff.previous')}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--lh-text-muted)', fontSize: '0.85rem' }}>
          {t(locale, 'studio.diff.current')}
        </span>
      </div>
      {entries.map((entry, i) => (
        <div key={`${entry.field}-${i}`} className="diff-row">
          <span className="diff-field">{entry.field}</span>
          <span className="diff-old">{entry.previous}</span>
          <span className="diff-new">{entry.current}</span>
        </div>
      ))}
    </div>
  );
}
