import type { Locale } from './locale';
import type { MessageKey } from './messages/en';
import ar from './messages/ar';
import en from './messages/en';

const dictionaries = {
  en,
  ar,
} as const;

export function getDictionary(locale: Locale): Record<MessageKey, string> {
  return dictionaries[locale];
}

export function t(locale: Locale, key: MessageKey): string {
  const dictionary = getDictionary(locale);
  const value = dictionary[key];
  if (value == null || value.trim() === '') {
    throw new Error(
      `[i18n] Missing translation for key "${key}" in locale "${locale}"`,
    );
  }
  return value;
}
