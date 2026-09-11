import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';
import {
  applySessionCookie,
  clearAuthCookies,
  stripSecretsFromAuthPayload,
} from './cookies';
import { toSafeAdminError } from './errors';

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
