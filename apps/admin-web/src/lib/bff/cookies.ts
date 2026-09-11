import { NextResponse } from 'next/server';
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
} from './constants';

export function isSecureRequest(request: Request): boolean {
  // Prefer the request URL. Force Secure only when explicitly configured
  // (production HTTPS deployments should set COOKIE_SECURE=true).
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.COOKIE_SECURE === 'false') {
    return false;
  }
  const url = new URL(request.url);
  return url.protocol === 'https:';
}

export function applySessionCookie(
  response: NextResponse,
  request: Request,
  sessionToken: string,
  maxAgeSeconds = ADMIN_SESSION_TTL_SECONDS,
): void {
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function applyCsrfCookie(
  response: NextResponse,
  request: Request,
  csrfToken: string,
  maxAgeSeconds = ADMIN_SESSION_TTL_SECONDS,
): void {
  response.cookies.set(ADMIN_CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearAuthCookies(
  response: NextResponse,
  request: Request,
): void {
  const secure = isSecureRequest(request);
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(ADMIN_CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
}

/**
 * Remove opaque tokens from auth payloads before returning to the browser.
 * Session remains only in the HttpOnly cookie.
 */
export function stripSecretsFromAuthPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const clone = { ...(data as Record<string, unknown>) };
  delete clone.sessionToken;
  return clone;
}
