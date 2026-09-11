import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applySessionCookie,
  clearAuthCookies,
  stripSecretsFromAuthPayload,
} from './cookies';
import { toSafeAdminError } from './errors';
import {
  assertBffOriginAllowed,
  normalizePublicOrigin,
  originsMatch,
  readAdminPublicOrigin,
} from './origin';

describe('BFF cookie helpers', () => {
  it('strips sessionToken from auth payloads', () => {
    const sanitized = stripSecretsFromAuthPayload({
      user: { id: '1' },
      sessionToken: 'super-secret-session-token-value',
      csrfToken: 'csrf-token-value',
    }) as Record<string, unknown>;
    expect(sanitized.sessionToken).toBeUndefined();
    expect(sanitized.csrfToken).toBe('csrf-token-value');
    expect(sanitized.user).toEqual({ id: '1' });
  });

  it('sets httpOnly session cookie and clears auth cookies', () => {
    const request = new Request(
      'http://localhost:3001/api/admin/v1/auth/login',
    );
    const response = NextResponse.json({ ok: true });
    applySessionCookie(response, request, 'session-token-value-32bytes!!');
    const session = response.cookies.get('lh_admin_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.value).toBe('session-token-value-32bytes!!');

    clearAuthCookies(response, request);
    expect(response.cookies.get('lh_admin_session')?.value).toBe('');
    expect(response.cookies.get('lh_admin_csrf')?.value).toBe('');
  });
});

describe('BFF error mapping', () => {
  it('maps known backend envelopes to safe messages', () => {
    const safe = toSafeAdminError(401, {
      ok: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'internal stack should not leak',
      },
    });
    expect(safe.error.code).toBe('INVALID_CREDENTIALS');
    expect(safe.error.message).toBe('Invalid email or password');
    expect(safe.error.message).not.toContain('stack');
  });

  it('maps LAST_SUPER_ADMIN without leaking internals', () => {
    const safe = toSafeAdminError(409, {
      ok: false,
      error: {
        code: 'LAST_SUPER_ADMIN',
        message: 'SELECT FOR UPDATE detail',
      },
    });
    expect(safe.error.code).toBe('LAST_SUPER_ADMIN');
    expect(safe.error.message).toContain('final active super administrator');
    expect(safe.error.message).not.toContain('SELECT');
  });

  it('falls back safely for unknown bodies', () => {
    const safe = toSafeAdminError(500, { weird: true });
    expect(safe.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('BFF origin validation', () => {
  const originalOrigin = process.env.ADMIN_PUBLIC_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.ADMIN_PUBLIC_ORIGIN;
    } else {
      process.env.ADMIN_PUBLIC_ORIGIN = originalOrigin;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  function mutatingRequest(
    origin: string | undefined,
    url = 'http://127.0.0.1:3001/api/admin/v1/auth/logout',
  ): NextRequest {
    const headers = new Headers();
    if (origin) {
      headers.set('origin', origin);
    }
    return new NextRequest(url, { method: 'POST', headers });
  }

  it('normalizes configured public origins', () => {
    expect(normalizePublicOrigin('http://127.0.0.1:3001/')).toBe(
      'http://127.0.0.1:3001',
    );
    expect(normalizePublicOrigin('http://evil.example/admin')).toBeNull();
  });

  it('accepts matching Origin when ADMIN_PUBLIC_ORIGIN is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_PUBLIC_ORIGIN = 'http://127.0.0.1:3001';
    expect(readAdminPublicOrigin()).toBe('http://127.0.0.1:3001');
    expect(
      assertBffOriginAllowed(mutatingRequest('http://127.0.0.1:3001')),
    ).toBeNull();
  });

  it('treats localhost and 127.0.0.1 as equivalent loopback origins', () => {
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_PUBLIC_ORIGIN = 'http://127.0.0.1:3001';
    expect(originsMatch('http://localhost:3001', 'http://127.0.0.1:3001')).toBe(
      true,
    );
    expect(
      assertBffOriginAllowed(mutatingRequest('http://localhost:3001')),
    ).toBeNull();
  });

  it('rejects mismatched Origin', () => {
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_PUBLIC_ORIGIN = 'http://127.0.0.1:3001';
    const rejected = assertBffOriginAllowed(
      mutatingRequest('http://evil.example'),
    );
    expect(rejected?.error.code).toBe('ORIGIN_REJECTED');
  });

  it('rejects missing Origin when ADMIN_PUBLIC_ORIGIN is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_PUBLIC_ORIGIN = 'http://127.0.0.1:3001';
    const rejected = assertBffOriginAllowed(mutatingRequest(undefined));
    expect(rejected?.error.code).toBe('ORIGIN_REJECTED');
  });

  it('rejects production requests when ADMIN_PUBLIC_ORIGIN is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_PUBLIC_ORIGIN;
    const rejected = assertBffOriginAllowed(
      mutatingRequest('http://127.0.0.1:3001'),
    );
    expect(rejected?.error.code).toBe('INTERNAL_ERROR');
  });

  it('skips Origin checks for GET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_PUBLIC_ORIGIN;
    const request = new NextRequest(
      'http://127.0.0.1:3001/api/admin/v1/auth/me',
      { method: 'GET' },
    );
    expect(assertBffOriginAllowed(request)).toBeNull();
  });
});
