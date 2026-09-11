import type { AdminErrorCode } from '@thelastheart/contracts';
import { ADMIN_ERROR_CODES } from '@thelastheart/contracts';

const SAFE_MESSAGES: Record<AdminErrorCode, string> = {
  VALIDATION_ERROR: 'Request validation failed',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'The request conflicts with the current state',
  INVALID_CREDENTIALS: 'Invalid email or password',
  RATE_LIMITED: 'Too many attempts. Try again later',
  CSRF_REJECTED: 'Security token rejected. Refresh and try again',
  ORIGIN_REJECTED: 'Request origin rejected',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again',
  ACCOUNT_DEACTIVATED: 'This account has been deactivated',
  LAST_SUPER_ADMIN: 'Cannot modify the final active super administrator',
  SELF_DEMOTION_FORBIDDEN: 'You cannot demote your own super admin role',
  SELF_DEACTIVATION_FORBIDDEN: 'You cannot deactivate your own account',
  INTERNAL_ERROR: 'An unexpected error occurred',
};

function isAdminErrorCode(value: unknown): value is AdminErrorCode {
  return (
    typeof value === 'string' &&
    (ADMIN_ERROR_CODES as readonly string[]).includes(value)
  );
}

export type SafeAdminError = {
  ok: false;
  error: {
    code: AdminErrorCode;
    message: string;
    details?: unknown;
  };
};

/**
 * Map backend / unknown failures to a safe envelope for the browser.
 * Never forwards stacks, SQL, or internal exception text.
 */
export function toSafeAdminError(
  status: number,
  body: unknown,
): SafeAdminError {
  if (body && typeof body === 'object') {
    const envelope = body as {
      ok?: unknown;
      error?: { code?: unknown; message?: unknown; details?: unknown };
    };
    if (envelope.ok === false && envelope.error) {
      const code = isAdminErrorCode(envelope.error.code)
        ? envelope.error.code
        : mapStatusToCode(status);
      const details =
        code === 'VALIDATION_ERROR' ? envelope.error.details : undefined;
      return {
        ok: false,
        error: {
          code,
          message: SAFE_MESSAGES[code],
          ...(details !== undefined ? { details } : {}),
        },
      };
    }
  }

  const code = mapStatusToCode(status);
  return {
    ok: false,
    error: {
      code,
      message: SAFE_MESSAGES[code],
    },
  };
}

function mapStatusToCode(status: number): AdminErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

export function safeInternalError(): SafeAdminError {
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: SAFE_MESSAGES.INTERNAL_ERROR,
    },
  };
}
