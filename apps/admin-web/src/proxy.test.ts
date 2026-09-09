import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import {
  isUnsupportedLocaleSegment,
  localizeUnprefixedPath,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  proxy,
} from './proxy';
import { localeCookieName } from './i18n/locale';

function requestFor(
  path: string,
  init?: { cookie?: string; protocol?: 'http' | 'https' },
): NextRequest {
  const url = `${init?.protocol === 'https' ? 'https' : 'http'}://localhost:3000${path}`;
  const headers = new Headers();
  if (init?.cookie) {
    headers.set('cookie', init.cookie);
  }
  return new NextRequest(url, { headers });
}

describe('admin locale proxy', () => {
  it('redirects / to /en without a cookie', async () => {
    const response = proxy(requestFor('/'));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get('location')!).pathname, '/en');
  });

  it('redirects / to /ar when cookie is ar', async () => {
    const response = proxy(
      requestFor('/', { cookie: `${localeCookieName}=ar` }),
    );
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get('location')!).pathname, '/ar');
  });

  it('preserves unprefixed application paths', () => {
    assert.equal(localizeUnprefixedPath('/settings', 'en'), '/en/settings');
    assert.equal(
      localizeUnprefixedPath('/dashboard/settings', 'en'),
      '/en/dashboard/settings',
    );
  });

  it('strips unsupported locale prefixes', () => {
    assert.equal(localizeUnprefixedPath('/fr', 'en'), '/en');
    assert.equal(localizeUnprefixedPath('/fr/settings', 'en'), '/en/settings');
    assert.equal(isUnsupportedLocaleSegment('fr'), true);
    assert.equal(isUnsupportedLocaleSegment('settings'), false);
  });

  it('redirects /settings to /en/settings and preserves query strings', async () => {
    const response = proxy(requestFor('/settings?tab=general'));
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.pathname, '/en/settings');
    assert.equal(location.search, '?tab=general');
  });

  it('redirects /fr/settings to /en/settings', async () => {
    const response = proxy(requestFor('/fr/settings'));
    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get('location')!).pathname,
      '/en/settings',
    );
  });

  it('falls back to English for invalid locale cookies', async () => {
    const response = proxy(
      requestFor('/', { cookie: `${localeCookieName}=nope` }),
    );
    assert.equal(new URL(response.headers.get('location')!).pathname, '/en');
  });

  it('sets httpOnly locale cookie with documented max age', async () => {
    const response = proxy(requestFor('/ar'));
    const cookie = response.cookies.get(localeCookieName);
    assert.ok(cookie);
    assert.equal(cookie.value, 'ar');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.path, '/');
    assert.equal(cookie.sameSite, 'lax');
    assert.equal(cookie.maxAge, LOCALE_COOKIE_MAX_AGE_SECONDS);
    assert.equal(cookie.secure, false);
  });

  it('sets secure cookie for https requests', async () => {
    const response = proxy(requestFor('/en', { protocol: 'https' }));
    const cookie = response.cookies.get(localeCookieName);
    assert.equal(cookie?.secure, true);
  });
});
