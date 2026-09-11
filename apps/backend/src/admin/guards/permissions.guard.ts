import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminPermission } from '@thelastheart/contracts';
import type { Request } from 'express';
import { ADMIN_AUTH_REQUEST_KEY } from './admin-auth.guard';
import type { AdminAuthContext } from '../services/admin.types';
import { ADMIN_PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminPermission[]>(
      ADMIN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<
      Request & {
        [ADMIN_AUTH_REQUEST_KEY]?: AdminAuthContext;
      }
    >();
    const auth = req[ADMIN_AUTH_REQUEST_KEY];
    if (!auth) {
      throw new ForbiddenException({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Missing auth context' },
      });
    }

    const granted = new Set(auth.permissions);
    const ok = required.every((permission) => granted.has(permission));
    if (!ok) {
      throw new ForbiddenException({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }
    return true;
  }
}
