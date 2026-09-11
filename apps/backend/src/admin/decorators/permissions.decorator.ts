import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '@thelastheart/contracts';

export const ADMIN_PERMISSIONS_KEY = 'adminPermissions';

export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);
