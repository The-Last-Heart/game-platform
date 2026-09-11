import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { runMigrations } from '../src/database/migration-runner';
import { hashPassword, sha256Hex } from '../src/admin/security/password';
import { ADMIN_CSRF_COOKIE_NAME } from '../src/admin/security/tokens';
import { FakeClock } from '../src/match/domain/types';
import { MatchService } from '../src/match/services/match.service';
import type { AppConfig } from '../src/config/env.validation';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

function http(app: INestApplication) {
  return request(app.getHttpServer() as App);
}

async function canReachPostgres(url: string): Promise<boolean> {
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 2000,
  });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
}

describe('admin API integration', () => {
  let enabled = false;
  let app: INestApplication;
  let pool: Pool;
  let matchService: MatchService;

  beforeAll(async () => {
    if (!databaseUrl) {
      console.warn('[admin integration] Skipping: DATABASE_URL is not set');
      return;
    }
    enabled = await canReachPostgres(databaseUrl);
    if (!enabled) {
      console.warn(
        '[admin integration] Skipping: PostgreSQL is not reachable at DATABASE_URL',
      );
      return;
    }

    process.env.NODE_ENV = 'test';
    process.env.PORT = '3456';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.HEALTH_CHECK_DEPENDENCIES = 'false';
    process.env.ADMIN_CSRF_SECRET = 'integration-csrf-secret';
    process.env.COOKIE_SECURE = 'false';
    process.env.ADMIN_SESSION_TTL_SECONDS = '3600';
    process.env.ADMIN_LOGIN_MAX_FAILURES = '3';
    process.env.ADMIN_LOGIN_THROTTLE_TTL_SECONDS = '60';
    delete process.env.ADMIN_ALLOWED_ORIGIN;

    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool, join(__dirname, '../src/database/migrations'));

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MatchService)
      .useValue(MatchService.forTests({ clock: new FakeClock() }))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    matchService = app.get(MatchService);
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await Promise.race([
        app.close(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 5_000);
        }),
      ]);
    }
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }, 30_000);

  async function insertAdmin(options: {
    email: string;
    password: string;
    role?: string;
    status?: string;
    displayName?: string;
  }): Promise<string> {
    const passwordHash = await hashPassword(options.password);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO admin_users (
         email, display_name, password_hash, role, status
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        options.email,
        options.displayName ?? 'Test Admin',
        passwordHash,
        options.role ?? 'super_admin',
        options.status ?? 'active',
      ],
    );
    return result.rows[0]!.id;
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{
    status: number;
    body: Record<string, unknown>;
    sessionToken?: string;
    csrfToken?: string;
  }> {
    const csrfResponse = await http(app).get('/api/admin/v1/auth/csrf');
    const csrfBody = csrfResponse.body as {
      data?: { csrfToken?: string };
    };
    const csrfToken = csrfBody.data?.csrfToken;
    expect(csrfResponse.status).toBe(200);
    expect(csrfToken).toBeDefined();

    const response = await http(app)
      .post('/api/admin/v1/auth/login')
      .set(
        'Cookie',
        `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken!)}`,
      )
      .set('X-CSRF-Token', csrfToken!)
      .send({ email, password });
    const body = response.body as Record<string, unknown>;
    const data = body['data'] as Record<string, unknown> | undefined;
    return {
      status: response.status,
      body,
      sessionToken:
        typeof data?.['sessionToken'] === 'string'
          ? data['sessionToken']
          : undefined,
      csrfToken:
        typeof data?.['csrfToken'] === 'string' ? data['csrfToken'] : csrfToken,
    };
  }

  function authHeaders(
    sessionToken: string,
    csrfToken: string,
  ): {
    Authorization: string;
    Cookie: string;
    'X-CSRF-Token': string;
  } {
    return {
      Authorization: `Bearer ${sessionToken}`,
      Cookie: `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`,
      'X-CSRF-Token': csrfToken,
    };
  }

  it('runs only when database is available', () => {
    if (!enabled) {
      expect(databaseUrl ? 'db-unreachable' : 'db-unset').toMatch(/db-/);
      return;
    }
    expect(app).toBeDefined();
  });

  it('logs in successfully and rejects bad credentials', async () => {
    if (!enabled) return;
    const email = uniqueEmail('login');
    const password = 'valid-password-12';
    await insertAdmin({ email, password });

    const okLogin = await login(email, password);
    expect(okLogin.status).toBe(200);
    expect(okLogin.body['ok']).toBe(true);
    expect(okLogin.sessionToken).toBeDefined();
    expect(okLogin.csrfToken).toBeDefined();

    const bad = await login(email, 'wrong-password-12');
    expect(bad.status).toBe(401);
    expect(JSON.stringify(bad.body)).toContain('INVALID_CREDENTIALS');
    expect(JSON.stringify(bad.body)).not.toContain(password);
  });

  it('throttles repeated login failures', async () => {
    if (!enabled) return;
    const config = app.get(ConfigService<AppConfig, true>);
    const maxFailures = config.get('ADMIN_LOGIN_MAX_FAILURES', { infer: true });

    const email = uniqueEmail('throttle');
    await insertAdmin({ email, password: 'valid-password-12' });

    for (let i = 0; i < maxFailures; i += 1) {
      const failed = await login(email, 'wrong-password-12');
      expect(failed.status).toBe(401);
    }
    const blocked = await login(email, 'wrong-password-12');
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).toContain('RATE_LIMITED');
  });

  it('rejects expired and revoked sessions', async () => {
    if (!enabled) return;
    const email = uniqueEmail('session');
    const password = 'valid-password-12';
    await insertAdmin({ email, password });
    const okLogin = await login(email, password);
    const sessionToken = okLogin.sessionToken!;
    const csrfToken = okLogin.csrfToken!;

    await pool.query(
      `UPDATE admin_sessions
       SET expires_at = now() - interval '1 minute'
       WHERE token_hash = $1`,
      [sha256Hex(sessionToken)],
    );

    const expired = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(sessionToken, csrfToken));
    expect(expired.status).toBe(401);

    const fresh = await login(email, password);
    expect(fresh.status).toBe(200);
    const logout = await http(app)
      .post('/api/admin/v1/auth/logout')
      .set(authHeaders(fresh.sessionToken!, fresh.csrfToken!));
    expect(logout.status).toBe(200);

    const afterLogout = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(fresh.sessionToken!, fresh.csrfToken!));
    expect(afterLogout.status).toBe(401);
  });

  it('enforces permissions with 401/403', async () => {
    if (!enabled) return;
    const viewerEmail = uniqueEmail('viewer');
    const password = 'valid-password-12';
    await insertAdmin({
      email: viewerEmail,
      password,
      role: 'viewer',
    });
    const viewerLogin = await login(viewerEmail, password);
    expect(viewerLogin.status).toBe(200);

    const unauthorized = await http(app).get('/api/admin/v1/administrators');
    expect(unauthorized.status).toBe(401);

    const forbidden = await http(app)
      .get('/api/admin/v1/administrators')
      .set(authHeaders(viewerLogin.sessionToken!, viewerLogin.csrfToken!));
    expect(forbidden.status).toBe(403);

    const dashboard = await http(app)
      .get('/api/admin/v1/dashboard/overview')
      .set(authHeaders(viewerLogin.sessionToken!, viewerLogin.csrfToken!));
    expect(dashboard.status).toBe(200);
  });

  it('supports administrator CRUD and duplicate email conflicts', async () => {
    if (!enabled) return;
    const email = uniqueEmail('super');
    const password = 'valid-password-12';
    await insertAdmin({ email, password, role: 'super_admin' });
    const superLogin = await login(email, password);

    const createEmail = uniqueEmail('created');
    const created = await http(app)
      .post('/api/admin/v1/administrators')
      .set(authHeaders(superLogin.sessionToken!, superLogin.csrfToken!))
      .send({
        email: createEmail,
        displayName: 'Created User',
        role: 'live_ops',
        password: 'another-password-12',
      });
    expect([200, 201]).toContain(created.status);
    expect((created.body as { ok?: boolean }).ok).toBe(true);

    const duplicate = await http(app)
      .post('/api/admin/v1/administrators')
      .set(authHeaders(superLogin.sessionToken!, superLogin.csrfToken!))
      .send({
        email: createEmail.toUpperCase(),
        displayName: 'Dup',
        role: 'viewer',
        password: 'another-password-12',
      });
    expect(duplicate.status).toBe(409);
  });

  it('protects the final active super_admin', async () => {
    if (!enabled) return;
    const email = uniqueEmail('final-super');
    const password = 'valid-password-12';
    const id = await insertAdmin({ email, password, role: 'super_admin' });

    const actorEmail = uniqueEmail('actor-super');
    const actorId = await insertAdmin({
      email: actorEmail,
      password,
      role: 'super_admin',
    });
    const actorLogin = await login(actorEmail, password);

    await pool.query(
      `UPDATE admin_users
       SET status = 'deactivated'
       WHERE role = 'super_admin'
         AND id NOT IN ($1, $2)`,
      [id, actorId],
    );

    const deactivateTarget = await http(app)
      .patch(`/api/admin/v1/administrators/${id}`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!))
      .send({ status: 'deactivated' });
    expect(deactivateTarget.status).toBe(200);

    const deactivateSelfLast = await http(app)
      .patch(`/api/admin/v1/administrators/${actorId}`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!))
      .send({ status: 'deactivated' });
    expect(deactivateSelfLast.status).toBe(403);
    expect(JSON.stringify(deactivateSelfLast.body)).toMatch(
      /SELF_DEACTIVATION_FORBIDDEN|LAST_SUPER_ADMIN/,
    );

    const demoteLast = await http(app)
      .patch(`/api/admin/v1/administrators/${actorId}`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!))
      .send({ role: 'viewer' });
    expect(demoteLast.status).toBe(403);
    expect(JSON.stringify(demoteLast.body)).toMatch(
      /SELF_DEMOTION_FORBIDDEN|LAST_SUPER_ADMIN/,
    );
  });

  it('redacts audit metadata on read', async () => {
    if (!enabled) return;
    const email = uniqueEmail('audit');
    const password = 'valid-password-12';
    const id = await insertAdmin({ email, password });
    await pool.query(
      `INSERT INTO admin_audit_logs (
         actor_admin_id, action, entity_type, entity_id, outcome, metadata
       ) VALUES ($1, 'test.action', 'admin_user', $2, 'success', $3::jsonb)`,
      [
        id,
        id,
        JSON.stringify({
          password: 'should-not-leak',
          note: 'visible',
        }),
      ],
    );

    const loginResult = await login(email, password);
    const listed = await http(app)
      .get('/api/admin/v1/audit-logs')
      .query({ action: 'test.action', pageSize: 10 })
      .set(authHeaders(loginResult.sessionToken!, loginResult.csrfToken!));
    expect(listed.status).toBe(200);
    const payload = JSON.stringify(listed.body);
    expect(payload).toContain('[REDACTED]');
    expect(payload).not.toContain('should-not-leak');
    expect(payload).toContain('visible');
  });

  it('keeps dashboard aggregates free of private match secrets', async () => {
    if (!enabled) return;
    const email = uniqueEmail('dash');
    const password = 'valid-password-12';
    await insertAdmin({ email, password });
    const created = await matchService.createDevMatch();
    await matchService.joinMatch(created.matchId);

    const loginResult = await login(email, password);
    const overview = await http(app)
      .get('/api/admin/v1/dashboard/overview')
      .set(authHeaders(loginResult.sessionToken!, loginResult.csrfToken!));
    expect(overview.status).toBe(200);
    const payload = JSON.stringify(overview.body);
    const overviewBody = overview.body as {
      data: { aggregates: { matchCount: number } };
    };
    expect(overviewBody.data.aggregates.matchCount).toBeGreaterThanOrEqual(1);
    expect(payload).not.toMatch(/resumeToken/i);
    expect(payload).not.toMatch(/serverConfig/i);
    expect(payload).not.toMatch(/signalToken/i);
  });

  it('allows multiple independent sessions until revoke-other', async () => {
    if (!enabled) return;
    const email = uniqueEmail('multi-session');
    const password = 'valid-password-12';
    await insertAdmin({ email, password });

    const first = await login(email, password);
    const second = await login(email, password);
    expect(first.sessionToken).toBeDefined();
    expect(second.sessionToken).toBeDefined();
    expect(first.sessionToken).not.toBe(second.sessionToken);

    const meFirst = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(first.sessionToken!, first.csrfToken!));
    const meSecond = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(second.sessionToken!, second.csrfToken!));
    expect(meFirst.status).toBe(200);
    expect(meSecond.status).toBe(200);

    const listed = await http(app)
      .get('/api/admin/v1/auth/sessions')
      .set(authHeaders(second.sessionToken!, second.csrfToken!));
    expect(listed.status).toBe(200);
    const listedBody = listed.body as {
      ok?: boolean;
      data?: {
        sessions?: Array<{
          sessionId: string;
          current: boolean;
          deviceDescription: string;
        }>;
      };
    };
    expect(listedBody.ok).toBe(true);
    expect(listedBody.data?.sessions?.length).toBe(2);
    expect(listedBody.data?.sessions?.filter((s) => s.current)).toHaveLength(1);
    const listedPayload = JSON.stringify(listed.body);
    expect(listedPayload).not.toMatch(/token_hash|sessionToken|ip_hash/i);
    expect(listedPayload).not.toContain(second.sessionToken!);

    const revoke = await http(app)
      .post('/api/admin/v1/auth/revoke-other-sessions')
      .set(authHeaders(second.sessionToken!, second.csrfToken!));
    expect(revoke.status).toBe(200);
    expect(
      (revoke.body as { data?: { revokedCount?: number } }).data?.revokedCount,
    ).toBe(1);

    const afterFirst = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(first.sessionToken!, first.csrfToken!));
    const afterSecond = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(second.sessionToken!, second.csrfToken!));
    expect(afterFirst.status).toBe(401);
    expect(afterSecond.status).toBe(200);
  });

  it('supports idempotent logout with CSRF and rejects missing CSRF', async () => {
    if (!enabled) return;
    const email = uniqueEmail('logout');
    const password = 'valid-password-12';
    await insertAdmin({ email, password });
    const okLogin = await login(email, password);

    const logoutOnce = await http(app)
      .post('/api/admin/v1/auth/logout')
      .set(authHeaders(okLogin.sessionToken!, okLogin.csrfToken!));
    expect(logoutOnce.status).toBe(200);
    expect(
      (logoutOnce.body as { data?: { revoked?: boolean } }).data?.revoked,
    ).toBe(true);

    const logoutStale = await http(app)
      .post('/api/admin/v1/auth/logout')
      .set(authHeaders(okLogin.sessionToken!, okLogin.csrfToken!));
    expect(logoutStale.status).toBe(200);
    expect(
      (logoutStale.body as { data?: { revoked?: boolean } }).data?.revoked,
    ).toBe(true);

    const csrfResponse = await http(app).get('/api/admin/v1/auth/csrf');
    const csrfToken = (csrfResponse.body as { data?: { csrfToken?: string } })
      .data?.csrfToken;
    expect(csrfToken).toBeDefined();

    const logoutMissingSession = await http(app)
      .post('/api/admin/v1/auth/logout')
      .set(
        'Cookie',
        `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken!)}`,
      )
      .set('X-CSRF-Token', csrfToken!);
    expect(logoutMissingSession.status).toBe(200);
    expect(
      (logoutMissingSession.body as { data?: { revoked?: boolean } }).data
        ?.revoked,
    ).toBe(true);

    const logoutNoCsrf = await http(app).post('/api/admin/v1/auth/logout');
    expect(logoutNoCsrf.status).toBe(403);
    expect(JSON.stringify(logoutNoCsrf.body)).toContain('CSRF_REJECTED');
  });

  it('rejects wrong Origin when ADMIN_ALLOWED_ORIGIN is configured', async () => {
    if (!enabled) return;
    const config = app.get(ConfigService<AppConfig, true>);
    const originalGet = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation(((
      key: keyof AppConfig,
      options?: unknown,
    ) => {
      if (key === 'ADMIN_ALLOWED_ORIGIN') {
        return 'http://127.0.0.1:3001';
      }
      return originalGet(key, options as never);
    }) as typeof config.get);

    try {
      const csrfResponse = await http(app).get('/api/admin/v1/auth/csrf');
      const csrfToken = (csrfResponse.body as { data?: { csrfToken?: string } })
        .data?.csrfToken;
      expect(csrfToken).toBeDefined();

      const rejected = await http(app)
        .post('/api/admin/v1/auth/login')
        .set('Origin', 'http://evil.example')
        .set(
          'Cookie',
          `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken!)}`,
        )
        .set('X-CSRF-Token', csrfToken!)
        .send({
          email: uniqueEmail('origin'),
          password: 'valid-password-12',
        });
      expect(rejected.status).toBe(403);
      expect(JSON.stringify(rejected.body)).toContain('ORIGIN_REJECTED');
    } finally {
      spy.mockRestore();
    }
  });
});
