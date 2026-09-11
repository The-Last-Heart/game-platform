import { join } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from './migration-runner';

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('admin audit hardening migration (integration)', () => {
  if (!databaseUrl) {
    it('skipped because DATABASE_URL is unset', () => {
      expect(databaseUrl).toBeTruthy();
    });
    return;
  }

  const migrationsDir = join(__dirname, 'migrations');
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool, migrationsDir);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('is idempotent and enforces sequence + append-only triggers', async () => {
    const first = await runMigrations(pool, migrationsDir);
    expect(first.appliedNow).toEqual([]);
    expect(first.alreadyApplied).toContain('002_admin_audit_hardening');

    const second = await runMigrations(pool, migrationsDir);
    expect(second.appliedNow).toEqual([]);

    const column = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'admin_audit_logs'
         AND column_name = 'sequence_id'`,
    );
    expect(column.rows).toHaveLength(1);

    const inserted = await pool.query<{
      id: string;
      sequence_id: string;
    }>(
      `INSERT INTO admin_audit_logs (
         actor_admin_id, action, entity_type, entity_id, outcome, metadata
       ) VALUES (NULL, 'test.seq', 'admin_user', 'entity-a', 'success', '{}'::jsonb)
       RETURNING id, sequence_id::text AS sequence_id`,
    );
    const firstRow = inserted.rows[0]!;
    expect(firstRow.sequence_id).toMatch(/^\d+$/);

    const inserted2 = await pool.query<{
      id: string;
      sequence_id: string;
    }>(
      `INSERT INTO admin_audit_logs (
         actor_admin_id, action, entity_type, entity_id, outcome, metadata
       ) VALUES (NULL, 'test.seq', 'admin_user', 'entity-b', 'success', '{}'::jsonb)
       RETURNING id, sequence_id::text AS sequence_id`,
    );
    const secondRow = inserted2.rows[0]!;
    expect(BigInt(secondRow.sequence_id)).toBeGreaterThan(
      BigInt(firstRow.sequence_id),
    );

    await expect(
      pool.query(`UPDATE admin_audit_logs SET action = 'mutated' WHERE id = $1`, [
        firstRow.id,
      ]),
    ).rejects.toThrow(/append-only/i);

    await expect(
      pool.query(`DELETE FROM admin_audit_logs WHERE id = $1`, [firstRow.id]),
    ).rejects.toThrow(/append-only/i);

    const ordered = await pool.query<{ entity_id: string }>(
      `SELECT entity_id
       FROM admin_audit_logs
       WHERE action = 'test.seq'
       ORDER BY sequence_id DESC, id DESC
       LIMIT 2`,
    );
    expect(ordered.rows.map((row) => row.entity_id)).toEqual([
      'entity-b',
      'entity-a',
    ]);
  });
});
