import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/env.validation';
import {
  ADMIN_CSRF_HEADER_NAME,
  extractCsrfToken,
  extractSessionToken,
  verifyCsrfToken,
} from './tokens';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AdminRequestSecurityService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  assertMutatingRequestAllowed(req: Request): void {
    const method = (req.method ?? 'GET').toUpperCase();
    if (!MUTATING_METHODS.has(method)) {
      return;
    }

    this.assertOriginAllowed(req);
    this.assertCsrf(req);
  }

  private assertOriginAllowed(req: Request): void {
    const allowedOrigin = this.config.get('ADMIN_ALLOWED_ORIGIN', {
      infer: true,
    });
    if (!allowedOrigin) {
      return;
    }

    const origin = req.header('origin');
    const referer = req.header('referer');
    let candidate: string | undefined = origin ?? undefined;
    if (!candidate && referer) {
      try {
        candidate = new URL(referer).origin;
      } catch {
        candidate = undefined;
      }
    }

    if (!candidate || candidate !== allowedOrigin) {
      throw new ForbiddenException({
        ok: false,
        error: {
          code: 'ORIGIN_REJECTED',
          message: 'Origin/Referer rejected',
        },
      });
    }
  }

  private assertCsrf(req: Request): void {
    const secret = this.config.get('ADMIN_CSRF_SECRET', { infer: true });
    const headerName =
      Object.keys(req.headers).find(
        (key) => key.toLowerCase() === ADMIN_CSRF_HEADER_NAME,
      ) ?? ADMIN_CSRF_HEADER_NAME;
    const headerValue = req.header(headerName);
    const { header, cookie } = extractCsrfToken({
      headerToken: headerValue,
      cookieHeader: req.header('cookie') ?? undefined,
    });

    if (!header || !cookie || header !== cookie) {
      throw new ForbiddenException({
        ok: false,
        error: {
          code: 'CSRF_REJECTED',
          message: 'CSRF token missing or mismatched',
        },
      });
    }

    if (!verifyCsrfToken(secret, header)) {
      throw new ForbiddenException({
        ok: false,
        error: {
          code: 'CSRF_REJECTED',
          message: 'CSRF token invalid',
        },
      });
    }
  }

  requireSessionToken(req: Request): string {
    const token = extractSessionToken({
      authorization: req.header('authorization') ?? undefined,
      cookieHeader: req.header('cookie') ?? undefined,
    });
    if (!token) {
      throw new UnauthorizedException({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }
    return token;
  }
}
