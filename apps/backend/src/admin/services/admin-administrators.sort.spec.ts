import { resolveAdministratorOrderBy } from './admin-administrators.sort';

describe('resolveAdministratorOrderBy', () => {
  it('maps allowlisted fields to SQL columns with id tie-break', () => {
    expect(resolveAdministratorOrderBy('email', 'asc')).toBe(
      'email_normalized ASC, id ASC',
    );
    expect(resolveAdministratorOrderBy('displayName', 'desc')).toBe(
      'display_name DESC, id ASC',
    );
    expect(resolveAdministratorOrderBy('lastLoginAt', 'desc')).toBe(
      'last_login_at DESC, id ASC',
    );
    expect(resolveAdministratorOrderBy('createdAt', 'asc')).toBe(
      'created_at ASC, id ASC',
    );
    expect(resolveAdministratorOrderBy('role', 'asc')).toBe('role ASC, id ASC');
    expect(resolveAdministratorOrderBy('status', 'desc')).toBe(
      'status DESC, id ASC',
    );
  });
});
