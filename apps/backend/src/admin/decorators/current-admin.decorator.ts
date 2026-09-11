import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_AUTH_REQUEST_KEY } from '../guards/admin-auth.guard';
import type { AdminAuthContext } from '../services/admin.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminAuthContext => {
    const req = ctx.switchToHttp().getRequest<
      Request & {
        [ADMIN_AUTH_REQUEST_KEY]?: AdminAuthContext;
      }
    >();
    const auth = req[ADMIN_AUTH_REQUEST_KEY];
    if (!auth) {
      throw new Error('CurrentAdmin used without AdminAuthGuard');
    }
    return auth;
  },
);
