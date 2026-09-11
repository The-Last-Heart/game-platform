import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  applyAuthGate,
  isUnsupportedLocaleSegment,
  localizeUnprefixedPath,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  proxy,
} from './proxy';
import { localeCookieName } from './i18n/locale';
import { ADMIN_SESSION_COOKIE_NAME } from './lib/bff/constants';

function requestFor(
  path: string,
  init?: { cookie?: string; protocol?: 'http' | 'https' },
): NextRequest {
  const url = `${init?.protocol === 'https' ? 'https' : 'http'}://localhost:3001${path}`;
  const headers = new Headers();
  if (init?.cookie) {
    headers.set('cookie', init.cookie);
  }
  return new NextRequest(url, { headers });
}

describe('admin locale proxy', () => {
  it('redirects / to /en/login without a cookie', () => {
    const response = proxy(requestFor('/'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/en/login',
    );
  });

  it('redirects / to /ar/login when locale cookie is ar', () => {
    const response = proxy(
      requestFor('/', { cookie: `${localeCookieName}=ar` }),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/ar/login',
    );
  });

  it('redirects / to dashboard when session cookie exists', () => {
    const response = proxy(
      requestFor('/', {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=session-token-value-32bytes!!`,
      }),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/en/dashboard',
    );
  });

  it('preserves unprefixed application paths', () => {
    expect(localizeUnprefixedPath('/settings', 'en')).toBe('/en/settings');
    expect(localizeUnprefixedPath('/dashboard/settings', 'en')).toBe(
      '/en/dashboard/settings',
    );
  });

  it('strips unsupported locale prefixes', () => {
    expect(localizeUnprefixedPath('/fr', 'en')).toBe('/en');
    expect(localizeUnprefixedPath('/fr/settings', 'en')).toBe('/en/settings');
    expect(isUnsupportedLocaleSegment('fr')).toBe(true);
    expect(isUnsupportedLocaleSegment('settings')).toBe(false);
  });

  it('redirects /settings to /en/settings and preserves query strings', () => {
    const response = proxy(requestFor('/settings?tab=general'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/en/settings');
    expect(location.search).toBe('?tab=general');
  });

  it('redirects /fr/settings to /en/settings', () => {
    const response = proxy(requestFor('/fr/settings'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/en/settings',
    );
  });

  it('falls back to English for invalid locale cookies', () => {
    const response = proxy(
      requestFor('/', { cookie: `${localeCookieName}=nope` }),
    );
    expect(new URL(response.headers.get('location')!).pathname).toBe(
      '/en/login',
    );
  });

  it('sets httpOnly locale cookie with documented max age', () => {
    const response = proxy(
      requestFor('/ar/login', { cookie: `${localeCookieName}=ar` }),
    );
    const cookie = response.cookies.get(localeCookieName);
    expect(cookie).toBeTruthy();
    expect(cookie!.value).toBe('ar');
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.path).toBe('/');
    expect(cookie!.sameSite).toBe('lax');
    expect(cookie!.maxAge).toBe(LOCALE_COOKIE_MAX_AGE_SECONDS);
    expect(cookie!.secure).toBe(false);
  });

  it('sets secure cookie for https requests', () => {
    const response = proxy(requestFor('/en/login', { protocol: 'https' }));
    const cookie = response.cookies.get(localeCookieName);
    expect(cookie?.secure).toBe(true);
  });

  it('redirects protected routes to localized login without session', () => {
    const response = applyAuthGate(requestFor('/en/dashboard'), 'en');
    expect(response?.status).toBe(307);
    const location = new URL(response!.headers.get('location')!);
    expect(location.pathname).toBe('/en/login');
    expect(location.searchParams.get('next')).toBe('/en/dashboard');
  });

  it('does not redirect stale session cookie on /en/login', () => {
    const response = applyAuthGate(
      requestFor('/en/login', {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=stale-or-unknown-session-token!!`,
      }),
      'en',
    );
    expect(response).toBeNull();
  });

  it('allows login through middleware when a session cookie is present', () => {
    const response = applyAuthGate(
      requestFor('/en/login', {
        cookie: `${ADMIN_SESSION_COOKIE_NAME}=session-token-value-32bytes!!`,
      }),
      'en',
    );
    expect(response).toBeNull();
  });

  it('redirects protected routes without a session cookie to login', () => {
    const response = applyAuthGate(requestFor('/en/administrators'), 'en');
    expect(response?.status).toBe(307);
    const location = new URL(response!.headers.get('location')!);
    expect(location.pathname).toBe('/en/login');
    expect(location.searchParams.get('next')).toBe('/en/administrators');
  });
});
