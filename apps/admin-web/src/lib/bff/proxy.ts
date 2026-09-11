import { NextRequest, NextResponse } from 'next/server';
import { buildBackendAdminUrl } from './backend-url';
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_CSRF_HEADER_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
} from './constants';
import {
  applyCsrfCookie,
  applySessionCookie,
  clearAuthCookies,
  stripSecretsFromAuthPayload,
} from './cookies';
import { safeInternalError, toSafeAdminError } from './errors';
import { assertBffOriginAllowed, trustedOriginForBackend } from './origin';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sessionMaxAgeSeconds(expiresAt: unknown): number {
  if (typeof expiresAt !== 'string') {
    return ADMIN_SESSION_TTL_SECONDS;
  }
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return ADMIN_SESSION_TTL_SECONDS;
  }
  const seconds = Math.floor((expiresMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : ADMIN_SESSION_TTL_SECONDS;
}

function readJsonSafe(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function logoutSuccessResponse(request: NextRequest): NextResponse {
  const response = NextResponse.json(
    { ok: true, data: { revoked: true as const } },
    { status: 200 },
  );
  clearAuthCookies(response, request);
  return response;
}

/**
 * Proxy a browser request to the backend admin API.
 * Forwards session + CSRF; never exposes BACKEND_INTERNAL_URL or session tokens to JS.
 */
export async function proxyAdminRequest(
  request: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const method = request.method.toUpperCase();
  const incomingUrl = new URL(request.url);
  const pathKey = pathSegments.join('/');

  if (MUTATING.has(method)) {
    const originError = assertBffOriginAllowed(request);
    if (originError) {
      return NextResponse.json(originError, {
        status: originError.error.code === 'ORIGIN_REJECTED' ? 403 : 500,
      });
    }
  }

  let backendUrl: string;
  try {
    backendUrl = buildBackendAdminUrl(pathSegments);
  } catch {
    return NextResponse.json(safeInternalError(), { status: 500 });
  }

  if (incomingUrl.search) {
    backendUrl += incomingUrl.search;
  }

  const headers = new Headers();
  headers.set('accept', 'application/json');

  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }

  const trustedOrigin = trustedOriginForBackend();
  if (trustedOrigin) {
    headers.set('origin', trustedOrigin);
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    headers.set('authorization', `Bearer ${sessionToken}`);
    headers.set(
      'cookie',
      `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    );
  }

  const csrfCookie = request.cookies.get(ADMIN_CSRF_COOKIE_NAME)?.value;
  const csrfHeader =
    request.headers.get(ADMIN_CSRF_HEADER_NAME) ??
    request.headers.get('X-CSRF-Token');

  if (MUTATING.has(method)) {
    if (csrfCookie) {
      const existing = headers.get('cookie');
      const csrfPair = `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfCookie)}`;
      headers.set('cookie', existing ? `${existing}; ${csrfPair}` : csrfPair);
    }
    if (csrfHeader) {
      headers.set(ADMIN_CSRF_HEADER_NAME, csrfHeader);
    }
  } else if (csrfCookie) {
    const existing = headers.get('cookie');
    const csrfPair = `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfCookie)}`;
    headers.set('cookie', existing ? `${existing}; ${csrfPair}` : csrfPair);
  }

  let body: ArrayBuffer | undefined;
  if (MUTATING.has(method) && method !== 'DELETE') {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(safeInternalError(), { status: 502 });
  }

  const rawText = await upstream.text();
  const parsed = readJsonSafe(rawText);

  if (!upstream.ok) {
    // Prefer backend always-200 logout; if session is already gone, still clear.
    if (
      pathKey === 'auth/logout' &&
      (upstream.status === 401 ||
        (parsed &&
          typeof parsed === 'object' &&
          (parsed as { error?: { code?: string } }).error?.code ===
            'UNAUTHORIZED') ||
        (parsed &&
          typeof parsed === 'object' &&
          (parsed as { error?: { code?: string } }).error?.code ===
            'SESSION_EXPIRED'))
    ) {
      return logoutSuccessResponse(request);
    }

    const safe = toSafeAdminError(upstream.status, parsed);
    const response = NextResponse.json(safe, { status: upstream.status });
    if (
      upstream.status === 401 ||
      safe.error.code === 'SESSION_EXPIRED' ||
      safe.error.code === 'UNAUTHORIZED'
    ) {
      // Do not clear cookies on login INVALID_CREDENTIALS (401 with that code).
      if (
        pathKey !== 'auth/login' &&
        safe.error.code !== 'INVALID_CREDENTIALS'
      ) {
        clearAuthCookies(response, request);
      }
    }
    return response;
  }

  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json(safeInternalError(), { status: 502 });
  }

  const envelope = parsed as {
    ok?: unknown;
    data?: Record<string, unknown>;
  };

  let responseBody: unknown = parsed;

  if (envelope.ok === true && envelope.data) {
    const data = envelope.data;
    const sessionTokenValue =
      typeof data.sessionToken === 'string' ? data.sessionToken : undefined;
    const csrfTokenValue =
      typeof data.csrfToken === 'string' ? data.csrfToken : undefined;
    const expiresAt =
      data.session && typeof data.session === 'object'
        ? (data.session as { expiresAt?: unknown }).expiresAt
        : undefined;

    const sanitizedData = stripSecretsFromAuthPayload(data) as Record<
      string,
      unknown
    >;
    // CSRF token may remain in body for convenience; cookie is authoritative.
    responseBody = { ok: true, data: sanitizedData };

    const response = NextResponse.json(responseBody, {
      status: upstream.status,
    });

    if (sessionTokenValue) {
      applySessionCookie(
        response,
        request,
        sessionTokenValue,
        sessionMaxAgeSeconds(expiresAt),
      );
    }
    if (csrfTokenValue) {
      applyCsrfCookie(
        response,
        request,
        csrfTokenValue,
        sessionMaxAgeSeconds(expiresAt),
      );
    }

    if (pathKey === 'auth/logout') {
      clearAuthCookies(response, request);
    }

    return response;
  }

  return NextResponse.json(responseBody, { status: upstream.status });
}
