import type {
  AdminPermission,
  AdminRole,
  AdminUserStatus,
} from '@thelastheart/contracts';
import { permissionsForRole } from '@thelastheart/contracts';

export type AdminUserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: AdminRole;
  status: AdminUserStatus;
  last_login_at: Date | null;
  password_changed_at: Date;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
};

export type AdminSessionRow = {
  id: string;
  admin_user_id: string;
  token_hash: string;
  expires_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  user_agent: string | null;
  ip_hash: string | null;
};

export type AdminAuthContext = {
  user: AdminUserRow;
  session: AdminSessionRow;
  permissions: readonly AdminPermission[];
};

export function toIso(value: Date): string {
  return value.toISOString();
}

export function toAuthenticatedUser(user: AdminUserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    permissions: [...permissionsForRole(user.role)],
    passwordChangedAt: toIso(user.password_changed_at),
    lastLoginAt: user.last_login_at ? toIso(user.last_login_at) : null,
  };
}

export function toAdministratorDto(user: AdminUserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    lastLoginAt: user.last_login_at ? toIso(user.last_login_at) : null,
    passwordChangedAt: toIso(user.password_changed_at),
    createdAt: toIso(user.created_at),
    updatedAt: toIso(user.updated_at),
    createdBy: user.created_by,
  };
}
