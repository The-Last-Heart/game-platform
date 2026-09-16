import { describe, expect, it } from 'vitest';
import { buildAdminBreadcrumbs } from './breadcrumbs';

describe('buildAdminBreadcrumbs', () => {
  it('replaces a template id crumb with the challenge name', () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc21';
    const crumbs = buildAdminBreadcrumbs(
      'en',
      `/en/content/templates/${id}/edit`,
      { [`/content/templates/${id}`]: 'Fog wipe' },
    );

    expect(crumbs.map((crumb) => crumb.label)).toEqual([
      'Dashboard',
      'Challenge Studio',
      'Challenge library',
      'Fog wipe',
      'Edit',
    ]);
  });

  it('falls back to the template id when no name is registered', () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc21';
    const crumbs = buildAdminBreadcrumbs(
      'en',
      `/en/content/templates/${id}/edit`,
    );

    expect(crumbs.map((crumb) => crumb.label)).toContain(id);
    expect(crumbs.at(-1)?.label).toBe('Edit');
  });
});
