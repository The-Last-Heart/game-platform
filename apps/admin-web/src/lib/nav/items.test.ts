import { describe, expect, it } from 'vitest';
import { filterNavItems, navItemIsActive } from './items';

describe('admin nav permissions', () => {
  it('shows only permitted main items', () => {
    const items = filterNavItems(['dashboard:read', 'system:read']);
    expect(items.map((item) => item.id)).toEqual([
      'dashboard',
      'system',
      'profile',
      'profile-security',
    ]);
  });

  it('includes administrators only with administrators:read', () => {
    const without = filterNavItems(['dashboard:read']);
    expect(without.some((item) => item.id === 'administrators')).toBe(false);

    const withAdmin = filterNavItems(['dashboard:read', 'administrators:read']);
    expect(withAdmin.some((item) => item.id === 'administrators')).toBe(true);
  });

  it('includes audit only with audit:read', () => {
    const items = filterNavItems(['dashboard:read', 'audit:read']);
    expect(items.some((item) => item.id === 'audit-log')).toBe(true);
  });

  it('detects active nav paths with locale prefixes', () => {
    expect(navItemIsActive('/en/dashboard', '/dashboard')).toBe(true);
    expect(navItemIsActive('/ar/administrators/new', '/administrators')).toBe(
      true,
    );
    expect(navItemIsActive('/en/profile/security', '/profile')).toBe(false);
    expect(navItemIsActive('/en/profile/security', '/profile/security')).toBe(
      true,
    );
  });
});
