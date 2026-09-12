import type { AdminPermission } from '@thelastheart/contracts';
import type { MessageKey } from '@/i18n/messages/en';

export type NavItemId =
  | 'dashboard'
  | 'administrators'
  | 'audit-log'
  | 'content'
  | 'system'
  | 'profile'
  | 'profile-security';

export type NavItem = {
  id: NavItemId;
  href: string;
  labelKey: MessageKey;
  /** Required permission; omit for any authenticated admin. */
  permission?: AdminPermission;
  group: 'main' | 'account';
};

/**
 * Canonical admin navigation. Filter with `filterNavItems` using the
 * authenticated user's permissions. Future items: add here + dictionary keys.
 */
export const ADMIN_NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    href: '/dashboard',
    labelKey: 'nav.dashboard',
    permission: 'dashboard:read',
    group: 'main',
  },
  {
    id: 'administrators',
    href: '/administrators',
    labelKey: 'nav.administrators',
    permission: 'administrators:read',
    group: 'main',
  },
  {
    id: 'audit-log',
    href: '/audit-log',
    labelKey: 'nav.auditLog',
    permission: 'audit:read',
    group: 'main',
  },
  {
    id: 'content',
    href: '/content',
    labelKey: 'nav.content',
    permission: 'content:read',
    group: 'main',
  },
  {
    id: 'system',
    href: '/system',
    labelKey: 'nav.system',
    permission: 'system:read',
    group: 'main',
  },
  {
    id: 'profile',
    href: '/profile',
    labelKey: 'nav.profile',
    group: 'account',
  },
  {
    id: 'profile-security',
    href: '/profile/security',
    labelKey: 'nav.security',
    group: 'account',
  },
] as const;

export function filterNavItems(
  permissions: readonly AdminPermission[],
): NavItem[] {
  const granted = new Set(permissions);
  return ADMIN_NAV_ITEMS.filter((item) => {
    if (!item.permission) {
      return true;
    }
    return granted.has(item.permission);
  });
}

export function navItemIsActive(pathname: string, href: string): boolean {
  const bare = pathname.replace(/^\/(en|ar)/, '') || '/';
  if (href === '/dashboard') {
    return bare === '/dashboard' || bare === '/';
  }
  if (href === '/profile') {
    return bare === '/profile';
  }
  return bare === href || bare.startsWith(`${href}/`);
}
