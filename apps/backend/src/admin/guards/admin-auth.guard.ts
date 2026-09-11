import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from '../services/admin-auth.service';
import type { AdminAuthContext } from '../services/admin.types';
import { AdminRequestSecurityService } from '../security/request-security.service';

export const ADMIN_AUTH_REQUEST_KEY = 'adminAuth';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly requestSecurity: AdminRequestSecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & {
        [ADMIN_AUTH_REQUEST_KEY]?: AdminAuthContext;
      }
    >();

    this.requestSecurity.assertMutatingRequestAllowed(req);
    const token = this.requestSecurity.requireSessionToken(req);
    try {
      const auth = await this.auth.resolveSession(token);
      req[ADMIN_AUTH_REQUEST_KEY] = auth;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
  }
}
