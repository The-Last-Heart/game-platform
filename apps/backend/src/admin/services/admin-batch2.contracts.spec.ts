import {
  adminAdministratorListQuerySchema,
  adminUpdateProfileRequestSchema,
} from '@thelastheart/contracts';

describe('admin batch-2 contract schemas', () => {
  it('accepts allowlisted administrator sort fields', () => {
    const parsed = adminAdministratorListQuerySchema.parse({
      sortBy: 'email',
      sortOrder: 'desc',
    });
    expect(parsed.sortBy).toBe('email');
    expect(parsed.sortOrder).toBe('desc');
  });

  it('rejects injection-like sort fields', () => {
    const result = adminAdministratorListQuerySchema.safeParse({
      sortBy: 'created_at;drop table admin_users',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects profile payloads that include role or email', () => {
    const result = adminUpdateProfileRequestSchema.safeParse({
      displayName: 'Name',
      role: 'viewer',
    });
    expect(result.success).toBe(false);
  });
});
