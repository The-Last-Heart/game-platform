import { describe, expect, it } from 'vitest';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import ar from '@/i18n/messages/ar';
import en from '@/i18n/messages/en';

describe('localizeAdminError', () => {
  it('maps known codes to English and Arabic catalog messages', () => {
    expect(localizeAdminError('en', 'FORBIDDEN')).toBe(en['errors.FORBIDDEN']);
    expect(localizeAdminError('ar', 'FORBIDDEN')).toBe(ar['errors.FORBIDDEN']);
    expect(localizeAdminError('ar', 'INVALID_CREDENTIALS')).toBe(
      ar['errors.INVALID_CREDENTIALS'],
    );
    expect(localizeAdminError('ar', 'FORBIDDEN')).not.toBe(
      en['errors.FORBIDDEN'],
    );
  });

  it('falls back for unknown codes without leaking English operational copy on ar', () => {
    expect(localizeAdminError('ar', 'NOT_A_REAL_CODE')).toBe(
      ar['errors.INTERNAL_ERROR'],
    );
    expect(localizeAdminError('en', 'NOT_A_REAL_CODE', 'Custom')).toBe(
      'Custom',
    );
  });
});
