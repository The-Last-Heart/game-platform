import Link from 'next/link';
import { t } from '@/i18n/get-dictionary';
import { localizePath, type Locale } from '@/i18n/locale';

type LanguageSwitcherProps = {
  locale: Locale;
  /** Current path including locale prefix, e.g. `/en` or `/ar/settings`. */
  currentPath: string;
};

export function LanguageSwitcher({
  locale,
  currentPath,
}: LanguageSwitcherProps) {
  const targetLocale: Locale = locale === 'en' ? 'ar' : 'en';
  const href = localizePath(currentPath, targetLocale);
  const label =
    targetLocale === 'ar'
      ? t(locale, 'language.switchToArabic')
      : t(locale, 'language.switchToEnglish');

  return (
    <nav aria-label={t(locale, 'language.current')}>
      <Link
        href={href}
        hrefLang={targetLocale}
        lang={targetLocale}
        aria-label={label}
      >
        {label}
      </Link>
    </nav>
  );
}
