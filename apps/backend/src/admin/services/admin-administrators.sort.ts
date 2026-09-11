import type {
  AdminAdministratorSortField,
  AdminSortOrder,
} from '@thelastheart/contracts';

/**
 * Maps allowlisted contract sort fields to SQL column identifiers.
 * Client strings must NEVER be interpolated into ORDER BY.
 */
const SORT_COLUMN_BY_FIELD: Record<AdminAdministratorSortField, string> = {
  createdAt: 'created_at',
  email: 'email_normalized',
  displayName: 'display_name',
  lastLoginAt: 'last_login_at',
  role: 'role',
  status: 'status',
};

export function resolveAdministratorOrderBy(
  sortBy: AdminAdministratorSortField,
  sortOrder: AdminSortOrder,
): string {
  const column = SORT_COLUMN_BY_FIELD[sortBy];
  const direction = sortOrder === 'desc' ? 'DESC' : 'ASC';
  // Deterministic tie-break by id so pagination stays stable.
  return `${column} ${direction}, id ASC`;
}
