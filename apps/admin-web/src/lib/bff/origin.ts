import type { NextRequest } from 'next/server';
import { safeInternalError, type SafeAdminError } from './errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Normalize a configured public origin (scheme + host[:port], no trailing slash).
 */
export function normalizePublicOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }
    // Path must be empty or `/` only — origins are never path-qualified.
    if (url.pathname !== '/' && url.pathname !== '') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function readAdminPublicOrigin(): string | undefined {
  const raw = process.env.ADMIN_PUBLIC_ORIGIN;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  return normalizePublicOrigin(raw) ?? undefined;
}

function extractBrowserOrigin(request: NextRequest): string | undefined {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return undefined;
    }
  }
  const referer = request.headers.get('referer');
  if (!referer) {
    return undefined;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

function originRejectedError(): SafeAdminError {
  return {
    ok: false,
    error: {
      code: 'ORIGIN_REJECTED',
      message: 'Request origin rejected',
    },
  };
}

/**
 * Validate browser Origin/Referer for mutating BFF requests.
 * Returns a safe error envelope when the request must be rejected, else null.
 */
export function assertBffOriginAllowed(
  request: NextRequest,
): SafeAdminError | null {
  const method = request.method.toUpperCase();
  if (!MUTATING.has(method)) {
    return null;
  }

  const configured = readAdminPublicOrigin();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !configured) {
    return safeInternalError();
  }

  const browserOrigin = extractBrowserOrigin(request);

  if (configured) {
    if (!browserOrigin || browserOrigin !== configured) {
      return originRejectedError();
    }
    return null;
  }

  // Development / test without ADMIN_PUBLIC_ORIGIN: allow matching localhost only.
  if (!browserOrigin) {
    return originRejectedError();
  }
  const requestOrigin = new URL(request.url).origin;
  if (
    isLocalhostOrigin(browserOrigin) &&
    isLocalhostOrigin(requestOrigin) &&
    browserOrigin === requestOrigin
  ) {
    return null;
  }
  return originRejectedError();
}

/**
 * Trusted Origin header value to forward to the backend (never the client Origin).
 */
export function trustedOriginForBackend(): string | undefined {
  return readAdminPublicOrigin();
}
