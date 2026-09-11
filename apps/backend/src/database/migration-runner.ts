import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

const ADVISORY_LOCK_KEY = 704_004_001;

export type MigrationStatus = {
  applied: string[];
  pending: string[];
};

export type MigrationRunResult = {
  appliedNow: string[];
  alreadyApplied: string[];
};

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

export async function getMigrationStatus(
  pool: Pool,
  migrationsDir: string,
): Promise<MigrationStatus> {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const result = await client.query<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY id ASC',
    );
    const applied = result.rows.map((row) => row.id);
    const appliedSet = new Set(applied);
    const files = await listMigrationFiles(migrationsDir);
    const pending = files.filter(
      (file) => !appliedSet.has(basename(file, '.sql')),
    );
    return {
      applied,
      pending,
    };
  } finally {
    client.release();
  }
}

export async function runMigrations(
  pool: Pool,
  migrationsDir: string,
): Promise<MigrationRunResult> {
  const client = await pool.connect();
  const appliedNow: string[] = [];
  const alreadyApplied: string[] = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await ensureMigrationsTable(client);

    const appliedResult = await client.query<{ id: string }>(
      'SELECT id FROM schema_migrations',
    );
    const appliedSet = new Set(appliedResult.rows.map((row) => row.id));
    const files = await listMigrationFiles(migrationsDir);

    for (const file of files) {
      const id = basename(file, '.sql');
      if (appliedSet.has(id)) {
        alreadyApplied.push(id);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
          id,
        ]);
        await client.query('COMMIT');
        appliedNow.push(id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return { appliedNow, alreadyApplied };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch {
      // Unlock best-effort; connection release still happens.
    }
    client.release();
  }
}
