'use client';

import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

export type ValidationError = {
  path: string;
  message: string;
};

type ValidationSummaryProps = {
  locale: Locale;
  errors: ValidationError[];
};

export function ValidationSummary({ locale, errors }: ValidationSummaryProps) {
  if (errors.length === 0) {
    return (
      <div className="validation-summary validation-summary-ok">
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          ✓ {t(locale, 'studio.validation.noErrors')}
        </span>
      </div>
    );
  }

  return (
    <div className="validation-summary" role="alert">
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--lh-danger)' }}>
        {t(locale, 'studio.validation.hasErrors')}
      </span>
      {errors.map((err, i) => (
        <div key={`${err.path}-${i}`} className="validation-row">
          <span className="validation-path">{err.path}</span>
          <span className="validation-message">{err.message}</span>
        </div>
      ))}
    </div>
  );
}
