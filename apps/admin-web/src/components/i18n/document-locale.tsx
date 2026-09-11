'use client';

import { useLayoutEffect } from 'react';
import { documentDirection, documentLang, type Locale } from '@/i18n/locale';

/**
 * Keeps <html lang/dir> aligned with the active locale.
 * Next.js root layout does not re-render on client locale switches, so soft
 * navigation from /en/... to /ar/... would otherwise leave dir="ltr".
 */
export function DocumentLocaleAttributes({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = documentLang(locale);
    root.dir = documentDirection(locale);
  }, [locale]);

  return null;
}
