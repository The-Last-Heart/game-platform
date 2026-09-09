import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { t } from '@/i18n/get-dictionary';
import {
  defaultLocale,
  documentDirection,
  documentLang,
  isLocale,
  localeHeaderName,
  type Locale,
} from '@/i18n/locale';
import './globals.css';

async function resolveLocaleFromHeaders(): Promise<Locale> {
  const headerList = await headers();
  const headerLocale = headerList.get(localeHeaderName);
  if (isLocale(headerLocale)) {
    return headerLocale;
  }
  return defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocaleFromHeaders();
  return {
    title: t(locale, 'app.title'),
    description: t(locale, 'app.description'),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocaleFromHeaders();
  const lang = documentLang(locale);
  const dir = documentDirection(locale);

  return (
    <html lang={lang} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
