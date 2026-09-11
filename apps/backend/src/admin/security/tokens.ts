import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE_NAME = 'lh_admin_session';
export const ADMIN_CSRF_COOKIE_NAME = 'lh_admin_csrf';
export const ADMIN_CSRF_HEADER_NAME = 'x-csrf-token';

const SESSION_TOKEN_BYTES = 32;

export function createOpaqueSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function createCsrfToken(secret: string): string {
  const nonce = randomBytes(24).toString('base64url');
  const mac = createHmac('sha256', secret).update(nonce).digest('base64url');
  return `${nonce}.${mac}`;
}

export function verifyCsrfToken(secret: string, token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }
  const [nonce, mac] = parts;
  if (!nonce || !mac) {
    return false;
  }
  const expected = createHmac('sha256', secret)
    .update(nonce)
    .digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (!header) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function extractSessionToken(options: {
  authorization?: string;
  cookieHeader?: string;
}): string | null {
  const auth = options.authorization?.trim();
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  const cookies = parseCookieHeader(options.cookieHeader);
  const fromCookie = cookies[ADMIN_SESSION_COOKIE_NAME];
  return fromCookie && fromCookie.length > 0 ? fromCookie : null;
}

export function extractCsrfToken(options: {
  headerToken?: string;
  cookieHeader?: string;
}): { header: string | null; cookie: string | null } {
  const cookies = parseCookieHeader(options.cookieHeader);
  const cookie = cookies[ADMIN_CSRF_COOKIE_NAME] ?? null;
  const header = options.headerToken?.trim() || null;
  return { header, cookie };
}
