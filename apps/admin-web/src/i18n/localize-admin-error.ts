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
 * Prefer specific backend conflict/forbidden messages over generic code copy.
 */
export function localizeAdminError(
  locale: Locale,
  code: string | undefined | null,
  fallback?: string,
): string {
  if (code && isAdminErrorCode(code)) {
    const localized = t(locale, `errors.${code}` as MessageKey);
    if (
      fallback &&
      fallback.trim() !== '' &&
      (code === 'CONFLICT' || code === 'FORBIDDEN') &&
      fallback !== 'Conflict' &&
      fallback !== localized
    ) {
      return fallback;
    }
    return localized;
  }
  if (fallback && fallback.trim() !== '') {
    return fallback;
  }
  return t(locale, 'errors.INTERNAL_ERROR');
}
