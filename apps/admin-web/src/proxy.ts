import { NextRequest, NextResponse } from 'next/server';
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  localeHeaderName,
  resolveRootLocale,
  type Locale,
} from './i18n/locale';

/** One year. Documented finite max age for lh_admin_locale. */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function withLocaleHeaders(request: NextRequest, locale: Locale): Headers {
  const headers = new Headers(request.headers);
  headers.set(localeHeaderName, locale);
  return headers;
}

function isSecureRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  return request.nextUrl.protocol === 'https:';
}

export function persistLocale(
  response: NextResponse,
  locale: Locale,
  request: NextRequest,
): void {
  response.cookies.set(localeCookieName, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
    secure: isSecureRequest(request),
  });
}

/** ISO-like segment that is not a supported admin locale. */
export function isUnsupportedLocaleSegment(
  segment: string | undefined,
): boolean {
  if (!segment || isLocale(segment)) {
    return false;
  }
  return /^[a-z]{2}(?:-[A-Za-z]{2})?$/i.test(segment);
}

/**
 * Builds the localized pathname for an unprefixed or unsupported-locale URL.
 * Preserves application paths such as /settings and /dashboard/settings.
 * Strips unsupported locale prefixes such as /fr and /fr/settings.
 */
export function localizeUnprefixedPath(
  pathname: string,
  locale: Locale,
): string {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (!first) {
    return `/${locale}`;
  }

  if (isLocale(first)) {
    return pathname;
  }

  if (isUnsupportedLocaleSegment(first)) {
    const rest = segments.slice(1).join('/');
    return rest ? `/${locale}/${rest}` : `/${locale}`;
  }

  return `/${locale}/${segments.join('/')}`;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  if (pathname === '/') {
    const locale = resolveRootLocale(
      request.cookies.get(localeCookieName)?.value,
    );
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}`;
    const response = NextResponse.redirect(redirectUrl);
    if (request.cookies.get(localeCookieName)?.value) {
      persistLocale(response, locale, request);
    }
    return response;
  }

  const segment = pathname.split('/')[1];
  if (!isLocale(segment)) {
    const locale = resolveRootLocale(
      request.cookies.get(localeCookieName)?.value,
    );
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = localizeUnprefixedPath(pathname, locale);
    const response = NextResponse.redirect(redirectUrl);
    persistLocale(response, locale, request);
    return response;
  }

  const locale = segment;
  const response = NextResponse.next({
    request: {
      headers: withLocaleHeaders(request, locale),
    },
  });
  persistLocale(response, locale, request);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export { defaultLocale };
