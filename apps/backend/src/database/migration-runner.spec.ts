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
    expect(status.applied).toContain(
      '027_lh009_circuit_rotation_uuid_repair',
    );

    const circuitVid = 'dddddddd-dddd-4ddd-8ddd-dddddddddd27';
    const circuitDefId = 'precision.circuit_rotation.dev';
    const circuitEngine = 'precision.circuit_rotation';

    const version = await pool.query<{
      engine_id: string;
      definition_id: string;
      template_slug: string;
    }>(
      `SELECT v.definition->>'engineId' AS engine_id,
              v.definition->>'definitionId' AS definition_id,
              t.slug AS template_slug
       FROM content_template_versions v
       JOIN content_templates t ON t.id = v.template_id
       WHERE v.id = $1::uuid`,
      [circuitVid],
    );
    expect(version.rows[0]).toEqual({
      engine_id: circuitEngine,
      definition_id: circuitDefId,
      template_slug: 'precision.circuit_rotation',
    });

    const catalog = await pool.query<{
      definition_id: string;
      template_version_id: string;
      version_engine: string | null;
    }>(
      `SELECT e->>'definitionId' AS definition_id,
              e->>'templateVersionId' AS template_version_id,
              v.definition->>'engineId' AS version_engine
       FROM content_current_releases c
       JOIN content_releases r ON r.id = c.release_id
       CROSS JOIN LATERAL jsonb_array_elements(r.payload->'entries') e
       LEFT JOIN content_template_versions v
         ON v.id = (e->>'templateVersionId')::uuid
       WHERE c.kind = 'challenge_catalog'
         AND e->>'definitionId' IN (
           'precision.circuit_rotation.dev',
           'gesture.fog_wipe.dev'
         )
       ORDER BY e->>'definitionId'`,
    );
    const byId = Object.fromEntries(
      catalog.rows.map((row) => [row.definition_id, row]),
    );
    expect(byId[circuitDefId]).toMatchObject({
      definition_id: circuitDefId,
      template_version_id: circuitVid,
      version_engine: circuitEngine,
    });
    expect(byId['gesture.fog_wipe.dev']?.version_engine).toBe(
      'gesture.fog_wipe',
    );
    expect(byId['gesture.fog_wipe.dev']?.template_version_id).not.toBe(
      circuitVid,
    );

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
