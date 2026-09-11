'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { useState } from 'react';
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
import {
  SIDEBAR_COOKIE_NAME,
  THEME_COOKIE_NAME,
  type SidebarPreference,
  type ThemePreference,
} from '@/lib/bff/constants';

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
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);
  const nextTheme: ThemePreference = theme === 'dark' ? 'light' : 'dark';
  const label = t(locale, nextTheme === 'dark' ? 'theme.dark' : 'theme.light');

  return (
    <button
      type="button"
      className="btn btn-secondary"
      aria-label={label}
      onClick={() => {
        const root = document.documentElement;
        root.dataset.theme = nextTheme;
        root.style.colorScheme = nextTheme;
        setClientCookie(
          THEME_COOKIE_NAME,
          nextTheme,
          PREFERENCE_COOKIE_MAX_AGE,
        );
        setTheme(nextTheme);
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      <span className="nav-label">{label}</span>
    </button>
  );
}

export function SidebarToggle({
  locale,
  initialSidebar,
}: {
  locale: Locale;
  initialSidebar: SidebarPreference;
}) {
  const [sidebar, setSidebar] = useState<SidebarPreference>(initialSidebar);
  const collapsed = sidebar === 'collapsed';
  const label = t(locale, collapsed ? 'nav.expand' : 'nav.collapse');

  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ color: 'inherit', marginTop: '0.75rem' }}
      onClick={() => {
        const next: SidebarPreference = collapsed ? 'expanded' : 'collapsed';
        document.documentElement.dataset.sidebar = next;
        setClientCookie(SIDEBAR_COOKIE_NAME, next, PREFERENCE_COOKIE_MAX_AGE);
        setSidebar(next);
      }}
      aria-label={label}
    >
      {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      <span className="nav-label">{label}</span>
    </button>
  );
}
