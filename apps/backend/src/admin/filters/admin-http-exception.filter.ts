import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { AdminErrorCode } from '@thelastheart/contracts';
import type { Request, Response } from 'express';

type AdminErrorEnvelope = {
  ok: false;
  error: {
    code: AdminErrorCode;
    message: string;
    details?: unknown;
  };
};

function isAdminErrorEnvelope(value: unknown): value is AdminErrorEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as {
    ok?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  return (
    candidate.ok === false &&
    typeof candidate.error?.code === 'string' &&
    typeof candidate.error?.message === 'string'
  );
}

function codeForStatus(status: number): AdminErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

function defaultMessage(code: AdminErrorCode): string {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 'Request validation failed';
    case 'UNAUTHORIZED':
      return 'Authentication required';
    case 'FORBIDDEN':
      return 'Forbidden';
    case 'NOT_FOUND':
      return 'Resource not found';
    case 'CONFLICT':
      return 'Conflict';
    case 'RATE_LIMITED':
      return 'Too many requests';
    default:
      return 'An unexpected error occurred';
  }
}

/**
 * Ensures admin API errors use `{ ok: false, error: { code, message } }`.
 * Maps Nest pipe failures (e.g. invalid UUID params) to VALIDATION_ERROR.
 */
@Catch()
export class AdminHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!request.path?.startsWith('/api/admin/')) {
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        response.status(status).json(exception.getResponse());
        return;
      }
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (isAdminErrorEnvelope(raw)) {
        response.status(status).json(raw);
        return;
      }

      const code = codeForStatus(status);
      const messageFromNest =
        typeof raw === 'string'
          ? raw
          : raw &&
              typeof raw === 'object' &&
              'message' in raw &&
              (typeof (raw as { message: unknown }).message === 'string' ||
                Array.isArray((raw as { message: unknown }).message))
            ? Array.isArray((raw as { message: unknown }).message)
              ? (raw as { message: string[] }).message.join('; ') ||
                defaultMessage(code)
              : (raw as { message: string }).message || defaultMessage(code)
            : defaultMessage(code);

      const envelope: AdminErrorEnvelope = {
        ok: false,
        error: {
          code,
          message:
            code === 'VALIDATION_ERROR'
              ? 'Request validation failed'
              : messageFromNest.slice(0, 500) || defaultMessage(code),
          ...(code === 'VALIDATION_ERROR' && typeof raw === 'object'
            ? { details: raw }
            : {}),
        },
      };
      response.status(status).json(envelope);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    } satisfies AdminErrorEnvelope);
  }
}
