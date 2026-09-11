import { join } from 'node:path';
import { Pool } from 'pg';
import { runMigrations, getMigrationStatus } from './migration-runner';

const databaseUrl = process.env.DATABASE_URL;

const describeDb = databaseUrl ? describe : describe.skip;

describeDb('database migrations (integration)', () => {
  if (!databaseUrl) {
    it('skipped because DATABASE_URL is unset', () => {
      expect(databaseUrl).toBeTruthy();
    });
    return;
  }

  const migrationsDir = join(__dirname, 'migrations');
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies migrations and is idempotent on second run', async () => {
    const first = await runMigrations(pool, migrationsDir);
    expect(
      first.appliedNow.length + first.alreadyApplied.length,
    ).toBeGreaterThan(0);

    const second = await runMigrations(pool, migrationsDir);
    expect(second.appliedNow).toEqual([]);
    expect(second.alreadyApplied.length).toBeGreaterThan(0);

    const status = await getMigrationStatus(pool, migrationsDir);
    expect(status.pending).toEqual([]);
    expect(status.applied).toContain('001_admin_foundation');
    expect(status.applied).toContain('002_admin_audit_hardening');

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('admin_users', 'admin_sessions', 'admin_audit_logs')`,
    );
    expect(tables.rows.map((r) => r.table_name).sort()).toEqual([
      'admin_audit_logs',
      'admin_sessions',
      'admin_users',
    ]);
  });
});

if (!databaseUrl) {
  describe('database migrations (skipped)', () => {
    it('skips when DATABASE_URL is unavailable', () => {
      // Clear message for local/CI without Postgres.
      expect(process.env.DATABASE_URL).toBeUndefined();
    });
  });
}
