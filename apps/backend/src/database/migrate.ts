import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from './migration-runner';

function loadLocalEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }
  const text = readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    join(process.cwd(), 'src', 'database', 'migrations'),
    join(process.cwd(), 'dist', 'database', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Unable to locate database migrations directory');
}

async function main(): Promise<void> {
  loadLocalEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const migrationsDir = resolveMigrationsDir();
    const result = await runMigrations(pool, migrationsDir);
    // Never print connection strings or secrets.
    console.log(
      JSON.stringify({
        ok: true,
        appliedNow: result.appliedNow,
        alreadyApplied: result.alreadyApplied,
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'UnknownError';
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
