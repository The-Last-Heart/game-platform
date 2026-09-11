import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  adminChangePasswordRequestSchema,
  adminLoginRequestSchema,
  adminSuccessEnvelopeSchema,
  adminCsrfResponseSchema,
  adminLoginResponseSchema,
  adminLogoutResponseSchema,
  adminMeResponseSchema,
  adminChangePasswordResponseSchema,
  adminRevokeOtherSessionsResponseSchema,
  adminSessionsResponseSchema,
} from '@thelastheart/contracts';
import type { Request, Response } from 'express';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminAuthService } from '../services/admin-auth.service';
import type { AdminAuthContext } from '../services/admin.types';
import { AdminRequestSecurityService } from '../security/request-security.service';
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  extractSessionToken,
} from '../security/tokens';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly requestSecurity: AdminRequestSecurityService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = this.auth.issueCsrfToken();
    this.setCsrfCookie(res, csrfToken);
    const parsed = adminSuccessEnvelopeSchema(adminCsrfResponseSchema).parse(
      ok({ csrfToken }),
    );
    return parsed;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.requestSecurity.assertMutatingRequestAllowed(req);
    const parsedBody = adminLoginRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid login payload',
          details: parsedBody.error.flatten(),
        },
      });
    }

    const result = await this.auth.login({
      email: parsedBody.data.email,
      password: parsedBody.data.password,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });

    this.setSessionCookie(res, result.sessionToken);
    this.setCsrfCookie(res, result.csrfToken);

    return adminSuccessEnvelopeSchema(adminLoginResponseSchema).parse(
      ok(result),
    );
  }

  /**
   * Idempotent logout: CSRF + Origin required; valid session is NOT required.
   * Always clears cookies and returns `{ revoked: true }` without leaking token state.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requestSecurity.assertMutatingRequestAllowed(req);
    const token = extractSessionToken({
      authorization: req.header('authorization') ?? undefined,
      cookieHeader: req.header('cookie') ?? undefined,
    });
    if (token) {
      await this.auth.logout(token, null);
    }
    this.clearAuthCookies(res);
    return adminSuccessEnvelopeSchema(adminLogoutResponseSchema).parse(
      ok({ revoked: true as const }),
    );
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminAuthContext) {
    const data = {
      user: {
        id: admin.user.id,
        email: admin.user.email,
        displayName: admin.user.display_name,
        role: admin.user.role,
        status: admin.user.status,
        permissions: [...admin.permissions],
        passwordChangedAt: admin.user.password_changed_at.toISOString(),
        lastLoginAt: admin.user.last_login_at
          ? admin.user.last_login_at.toISOString()
          : null,
      },
      session: {
        sessionId: admin.session.id,
        expiresAt: admin.session.expires_at.toISOString(),
      },
    };
    return adminSuccessEnvelopeSchema(adminMeResponseSchema).parse(ok(data));
  }

  @Get('sessions')
  @UseGuards(AdminAuthGuard)
  async sessions(@CurrentAdmin() admin: AdminAuthContext) {
    const data = await this.auth.listSessions(admin);
    return adminSuccessEnvelopeSchema(adminSessionsResponseSchema).parse(
      ok(data),
    );
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AdminAuthGuard)
  async changePassword(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentAdmin() admin: AdminAuthContext,
  ) {
    const parsedBody = adminChangePasswordRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid change-password payload',
          details: parsedBody.error.flatten(),
        },
      });
    }

    const result = await this.auth.changePassword({
      auth: admin,
      currentPassword: parsedBody.data.currentPassword,
      newPassword: parsedBody.data.newPassword,
      userAgent: req.header('user-agent') ?? undefined,
      ip: req.ip,
    });

    this.setSessionCookie(res, result.sessionToken);
    this.setCsrfCookie(res, result.csrfToken);

    return adminSuccessEnvelopeSchema(adminChangePasswordResponseSchema).parse(
      ok(result),
    );
  }

  @Post('revoke-other-sessions')
  @HttpCode(200)
  @UseGuards(AdminAuthGuard)
  async revokeOtherSessions(@CurrentAdmin() admin: AdminAuthContext) {
    const revokedCount = await this.auth.revokeOtherSessions(admin);
    return adminSuccessEnvelopeSchema(
      adminRevokeOtherSessionsResponseSchema,
    ).parse(ok({ revokedCount }));
  }

  private setSessionCookie(res: Response, token: string): void {
    const secure = this.config.get('COOKIE_SECURE', { infer: true });
    const ttl = this.config.get('ADMIN_SESSION_TTL_SECONDS', { infer: true });
    res.cookie(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: ttl * 1000,
      path: '/',
    });
  }

  private setCsrfCookie(res: Response, token: string): void {
    const secure = this.config.get('COOKIE_SECURE', { infer: true });
    const ttl = this.config.get('ADMIN_SESSION_TTL_SECONDS', { infer: true });
    res.cookie(ADMIN_CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      maxAge: ttl * 1000,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response): void {
    const secure = this.config.get('COOKIE_SECURE', { infer: true });
    res.clearCookie(ADMIN_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    });
    res.clearCookie(ADMIN_CSRF_COOKIE_NAME, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      path: '/',
    });
  }
}
