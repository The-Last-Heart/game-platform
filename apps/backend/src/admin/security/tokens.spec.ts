import {
  createCsrfToken,
  createOpaqueSessionToken,
  extractSessionToken,
  parseCookieHeader,
  verifyCsrfToken,
} from './tokens';

describe('admin tokens', () => {
  it('creates opaque session tokens of sufficient length', () => {
    const token = createOpaqueSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('round-trips CSRF tokens with HMAC verification', () => {
    const secret = 'test-csrf-secret-value';
    const token = createCsrfToken(secret);
    expect(verifyCsrfToken(secret, token)).toBe(true);
    expect(verifyCsrfToken(secret, `${token}x`)).toBe(false);
    expect(verifyCsrfToken('other-secret-value!!', token)).toBe(false);
  });

  it('extracts bearer or cookie session tokens', () => {
    expect(
      extractSessionToken({
        authorization: 'Bearer abcdefghijklmnopqrstuvwxyz012345',
      }),
    ).toBe('abcdefghijklmnopqrstuvwxyz012345');

    expect(
      extractSessionToken({
        cookieHeader: 'lh_admin_session=cookie-token-value-32bytes!!; other=1',
      }),
    ).toBe('cookie-token-value-32bytes!!');
  });

  it('parses cookie headers', () => {
    expect(parseCookieHeader('a=1; b=two%20words')).toEqual({
      a: '1',
      b: 'two words',
    });
  });
});
