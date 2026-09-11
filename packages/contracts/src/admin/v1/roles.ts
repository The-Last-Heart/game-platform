import { z } from 'zod';

export const ADMIN_ROLES = [
  'super_admin',
  'content_manager',
  'live_ops',
  'translator',
  'viewer',
] as const;

export const adminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const ADMIN_USER_STATUSES = ['active', 'deactivated'] as const;
export const adminUserStatusSchema = z.enum(ADMIN_USER_STATUSES);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;
