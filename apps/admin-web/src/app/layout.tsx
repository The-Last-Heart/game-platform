import type { Metadata } from 'next';
import {
  Fraunces,
  IBM_Plex_Sans_Arabic,
  Noto_Naskh_Arabic,
  Source_Sans_3,
} from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { t } from '@/i18n/get-dictionary';
import {
  defaultLocale,
  documentDirection,
  documentLang,
  isLocale,
  localeHeaderName,
  type Locale,
} from '@/i18n/locale';
import { SIDEBAR_COOKIE_NAME, THEME_COOKIE_NAME } from '@/lib/bff/constants';
import {
  parseSidebar,
  parseTheme,
  preferenceBootstrapScript,
} from '@/lib/preferences/cookies';
import './globals.css';

const sourceSans = Source_Sans_3({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-source-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  display: 'swap',
});

/** Premium Arabic UI face — dense admin chrome, tables, forms. */
const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-arabic',
  display: 'swap',
});

/** Refined Arabic display face — brand / section titles. */
const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-naskh-arabic',
  display: 'swap',
});

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
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const sidebar = parseSidebar(cookieStore.get(SIDEBAR_COOKIE_NAME)?.value);

  return (
    <html
      lang={lang}
      dir={dir}
      data-theme={theme}
      data-sidebar={sidebar}
      className={`${sourceSans.variable} ${fraunces.variable} ${ibmPlexArabic.variable} ${notoNaskhArabic.variable}`}
      style={
        {
          colorScheme: theme,
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: preferenceBootstrapScript() }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
