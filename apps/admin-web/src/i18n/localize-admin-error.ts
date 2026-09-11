import type { AdminErrorCode } from '@thelastheart/contracts';
import { ADMIN_ERROR_CODES } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';

function isAdminErrorCode(value: string): value is AdminErrorCode {
  return (ADMIN_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Map a stable backend error code to a localized browser message.
 * Falls back to a provided message only when the code is unknown.
 */
export function localizeAdminError(
  locale: Locale,
  code: string | undefined | null,
  fallback?: string,
): string {
  if (code && isAdminErrorCode(code)) {
    return t(locale, `errors.${code}` as MessageKey);
  }
  if (fallback && fallback.trim() !== '') {
    return fallback;
  }
  return t(locale, 'errors.INTERNAL_ERROR');
}
