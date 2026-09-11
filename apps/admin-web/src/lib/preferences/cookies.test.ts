import { describe, expect, it } from 'vitest';
import { parseSidebar, parseTheme, preferenceBootstrapScript } from './cookies';

describe('preference cookies', () => {
  it('defaults theme and sidebar safely', () => {
    expect(parseTheme(undefined)).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('neon')).toBe('light');
    expect(parseSidebar(undefined)).toBe('expanded');
    expect(parseSidebar('collapsed')).toBe('collapsed');
  });

  it('emits a before-paint bootstrap script that sets dataset attributes', () => {
    const script = preferenceBootstrapScript();
    expect(script).toContain('lh_admin_theme');
    expect(script).toContain('lh_admin_sidebar');
    expect(script).toContain('dataset.theme');
    expect(script).toContain('dataset.sidebar');
    expect(script).toContain('colorScheme');
  });
});
