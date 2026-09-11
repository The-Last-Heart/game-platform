'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { t } from '@/i18n/get-dictionary';
import {
  documentDirection,
  documentLang,
  localizePath,
  type Locale,
} from '@/i18n/locale';
import {
  PREFERENCE_COOKIE_MAX_AGE,
  setClientCookie,
} from '@/lib/preferences/cookies';
import { THEME_COOKIE_NAME, type ThemePreference } from '@/lib/bff/constants';

type LanguageSwitcherProps = {
  locale: Locale;
  currentPath?: string;
};

function applyDocumentLocale(locale: Locale): void {
  const root = document.documentElement;
  root.lang = documentLang(locale);
  root.dir = documentDirection(locale);
}

export function LanguageSwitcher({
  locale,
  currentPath,
}: LanguageSwitcherProps) {
  const pathname = usePathname();
  const path = currentPath ?? pathname ?? `/${locale}`;
  const targetLocale: Locale = locale === 'en' ? 'ar' : 'en';
  const href = localizePath(path, targetLocale);
  const label =
    targetLocale === 'ar'
      ? t(locale, 'language.switchToArabic')
      : t(locale, 'language.switchToEnglish');

  return (
    <nav aria-label={t(locale, 'language.current')}>
      <Link
        className="btn btn-secondary"
        href={href}
        hrefLang={targetLocale}
        lang={targetLocale}
        aria-label={label}
        onClick={() => {
          // Apply immediately so RTL/LTR flips before the soft navigation settles.
          applyDocumentLocale(targetLocale);
        }}
      >
        {label}
      </Link>
    </nav>
  );
}

export function ThemeToggle({
  locale,
  initialTheme,
}: {
  locale: Locale;
  initialTheme: ThemePreference;
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      aria-label={t(locale, 'theme.toggle')}
      onClick={() => {
        const root = document.documentElement;
        const current =
          root.dataset.theme === 'dark' ? 'dark' : (initialTheme ?? 'light');
        const next: ThemePreference = current === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        root.style.colorScheme = next;
        setClientCookie(THEME_COOKIE_NAME, next, PREFERENCE_COOKIE_MAX_AGE);
      }}
    >
      {initialTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      <span className="nav-label">
        {initialTheme === 'dark'
          ? t(locale, 'theme.light')
          : t(locale, 'theme.dark')}
      </span>
    </button>
  );
}
