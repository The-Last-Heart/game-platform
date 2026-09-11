import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME } from './lib/bff/constants';
import { isSecureRequest } from './lib/bff/cookies';
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

const PUBLIC_PATHS = new Set(['/login']);

function withLocaleHeaders(request: NextRequest, locale: Locale): Headers {
  const headers = new Headers(request.headers);
  headers.set(localeHeaderName, locale);
  return headers;
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

function barePathAfterLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return '/';
  }
  if (isLocale(segments[0])) {
    const rest = segments.slice(1).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname || '/';
}

function hasSessionCookie(request: NextRequest): boolean {
  const value = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  return Boolean(value && value.length > 0);
}

/**
 * Cookie-presence gate to avoid flashing protected chrome.
 * Full session validation still happens in server layouts.
 */
export function applyAuthGate(
  request: NextRequest,
  locale: Locale,
): NextResponse | null {
  const bare = barePathAfterLocale(request.nextUrl.pathname);
  const authed = hasSessionCookie(request);

  if (bare === '/' || bare === '') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = authed ? `/${locale}/dashboard` : `/${locale}/login`;
    return NextResponse.redirect(redirectUrl);
  }

  // Allow /login through even when a session cookie is present.
  // Stale cookies must not bounce login↔dashboard; login page validates via /auth/me.
  if (PUBLIC_PATHS.has(bare)) {
    return null;
  }

  if (!authed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/login`;
    redirectUrl.search = `?next=${encodeURIComponent(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    )}`;
    return NextResponse.redirect(redirectUrl);
  }

  return null;
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
    redirectUrl.pathname = hasSessionCookie(request)
      ? `/${locale}/dashboard`
      : `/${locale}/login`;
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
  const authRedirect = applyAuthGate(request, locale);
  if (authRedirect) {
    persistLocale(authRedirect, locale, request);
    return authRedirect;
  }

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
