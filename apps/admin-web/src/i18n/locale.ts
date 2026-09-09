export const locales = ['en', 'ar'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeCookieName = 'lh_admin_locale';

export const localeHeaderName = 'x-lh-locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'en' || value === 'ar';
}

export function documentDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function documentLang(locale: Locale): Locale {
  return locale;
}

/**
 * Resolve locale for `/` when no prior cookie exists.
 * Browser language must not override English on first visit.
 */
export function resolveRootLocale(cookieValue: string | undefined): Locale {
  if (isLocale(cookieValue)) {
    return cookieValue;
  }
  return defaultLocale;
}

export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/');
  const maybeLocale = segments[1];
  if (isLocale(maybeLocale)) {
    const rest = segments.slice(2).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname || '/';
}

export function localizePath(pathname: string, locale: Locale): string {
  const bare = stripLocalePrefix(pathname);
  if (bare === '/') {
    return `/${locale}`;
  }
  return `/${locale}${bare}`;
}
