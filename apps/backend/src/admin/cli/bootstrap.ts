import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../../database/migration-runner';
import { hashPassword } from '../security/password';

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
    join(__dirname, '..', '..', 'database', 'migrations'),
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
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const displayName =
    process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || 'Bootstrap Admin';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!email || !password) {
    throw new Error(
      'ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required',
    );
  }
  if (password.length < 12) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await runMigrations(pool, resolveMigrationsDir());

    const existing = await pool.query<{ id: string; role: string }>(
      `SELECT id, role FROM admin_users WHERE email_normalized = $1 LIMIT 1`,
      [email],
    );

    if (existing.rows[0]) {
      console.log(
        JSON.stringify({
          ok: true,
          created: false,
          administratorId: existing.rows[0].id,
          role: existing.rows[0].role,
          message: 'Bootstrap administrator already exists',
        }),
      );
      return;
    }

    const passwordHash = await hashPassword(password);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO admin_users (
         email, display_name, password_hash, role, status
       ) VALUES ($1, $2, $3, 'super_admin', 'active')
       RETURNING id`,
      [email, displayName, passwordHash],
    );

    // Never print password or hash.
    console.log(
      JSON.stringify({
        ok: true,
        created: true,
        administratorId: inserted.rows[0]!.id,
        role: 'super_admin',
        email,
        displayName,
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
