import { z } from 'zod';
import type { AdminRole } from './roles';
import { ADMIN_ROLES } from './roles';

/**
 * Stable permission identifiers for admin RBAC.
 * Controllers declare required permissions; roles map to permission sets.
 */
export const ADMIN_PERMISSIONS = [
  'administrators:read',
  'administrators:write',
  'dashboard:read',
  'system:read',
  'audit:read',
] as const;

export const adminPermissionSchema = z.enum(ADMIN_PERMISSIONS);
export type AdminPermission = z.infer<typeof adminPermissionSchema>;

const ALL_PERMISSIONS: readonly AdminPermission[] = ADMIN_PERMISSIONS;

/**
 * Role → permissions map. Reusable by backend guards and admin UI.
 * `super_admin` receives every permission; narrower roles are least-privilege.
 */
export const ADMIN_ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,
  content_manager: ['dashboard:read', 'system:read'] as const satisfies readonly AdminPermission[],
  live_ops: [
    'dashboard:read',
    'system:read',
    'audit:read',
  ] as const satisfies readonly AdminPermission[],
  translator: ['dashboard:read'] as const satisfies readonly AdminPermission[],
  viewer: [
    'dashboard:read',
    'system:read',
  ] as const satisfies readonly AdminPermission[],
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export function permissionsForRole(role: AdminRole): readonly AdminPermission[] {
  return ADMIN_ROLE_PERMISSIONS[role];
}

export function roleHasPermission(
  role: AdminRole,
  permission: AdminPermission,
): boolean {
  const granted: readonly AdminPermission[] = ADMIN_ROLE_PERMISSIONS[role];
  return granted.includes(permission);
}

export const adminRolePermissionsSchema = z
  .object({
    role: z.enum(ADMIN_ROLES),
    permissions: z.array(adminPermissionSchema),
  })
  .strict();
