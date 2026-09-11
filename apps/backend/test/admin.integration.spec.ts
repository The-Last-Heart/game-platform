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
import { MatchmakingService } from '../src/match/services/matchmaking.service';
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
  let matchmakingService: MatchmakingService;

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
    matchmakingService = app.get(MatchmakingService);
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
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
      .set('Origin', process.env.ADMIN_ALLOWED_ORIGIN || 'http://127.0.0.1:3001')
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
    Origin: string;
  } {
    return {
      Authorization: `Bearer ${sessionToken}`,
      Cookie: `${ADMIN_CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`,
      'X-CSRF-Token': csrfToken,
      Origin: process.env.ADMIN_ALLOWED_ORIGIN || 'http://127.0.0.1:3001',
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
    const items = (
      listed.body as {
        data?: { items?: Array<{ sequenceId?: string }> };
      }
    ).data?.items;
    expect(items?.[0]?.sequenceId).toMatch(/^\d+$/);
  });

  it('records failed login with null actor and rejects from>to audit filter', async () => {
    if (!enabled) return;
    const email = uniqueEmail('fail-actor');
    const password = 'valid-password-12';
    const id = await insertAdmin({ email, password });

    const bad = await login(email, 'wrong-password-12');
    expect(bad.status).toBe(401);

    const rows = await pool.query<{
      actor_admin_id: string | null;
      outcome: string;
    }>(
      `SELECT actor_admin_id, outcome
       FROM admin_audit_logs
       WHERE action = 'auth.login'
         AND entity_id = $1
         AND outcome = 'failure'
       ORDER BY sequence_id DESC
       LIMIT 1`,
      [id],
    );
    expect(rows.rows[0]?.actor_admin_id).toBeNull();

    const okLogin = await login(email, password);
    const invalidRange = await http(app)
      .get('/api/admin/v1/audit-logs')
      .query({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      })
      .set(authHeaders(okLogin.sessionToken!, okLogin.csrfToken!));
    expect(invalidRange.status).toBe(400);
    expect(JSON.stringify(invalidRange.body)).toContain('VALIDATION_ERROR');
  });

  it('keeps dashboard aggregates free of private match secrets', async () => {
    if (!enabled) return;
    const email = uniqueEmail('dash');
    const password = 'valid-password-12';
    await insertAdmin({ email, password });
    const created = await matchService.createDevMatch();
    await matchService.joinMatch(created.matchId);
    const completed = await matchService.createDevMatch();
    const store = matchService.getStoreForTests();
    const completedMatch = (await store.get(completed.matchId))!;
    completedMatch.phase = 'completed';
    completedMatch.status = 'completed';
    await store.save(completedMatch);

    const loginResult = await login(email, password);
    const overview = await http(app)
      .get('/api/admin/v1/dashboard/overview')
      .set(authHeaders(loginResult.sessionToken!, loginResult.csrfToken!));
    expect(overview.status).toBe(200);
    const payload = JSON.stringify(overview.body);
    const overviewBody = overview.body as {
      data: {
        aggregates: {
          activeMatchCount: number;
          matchesByPhase: { completed: number };
        };
      };
    };
    expect(
      overviewBody.data.aggregates.activeMatchCount,
    ).toBeGreaterThanOrEqual(1);
    expect(
      overviewBody.data.aggregates.matchesByPhase.completed,
    ).toBeGreaterThanOrEqual(1);
    expect(payload).not.toMatch(/resumeToken/i);
    expect(payload).not.toMatch(/serverConfig/i);
    expect(payload).not.toMatch(/signalToken/i);
    expect(payload).not.toMatch(/DATABASE_URL/i);
    expect(payload).not.toMatch(/answer/i);
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

  it('revokes target sessions and returns envelope for invalid UUID', async () => {
    if (!enabled) return;
    const actorEmail = uniqueEmail('revoke-actor');
    const targetEmail = uniqueEmail('revoke-target');
    const password = 'valid-password-12';
    const actorId = await insertAdmin({
      email: actorEmail,
      password,
      role: 'super_admin',
    });
    const targetId = await insertAdmin({
      email: targetEmail,
      password,
      role: 'viewer',
    });

    const actorLogin = await login(actorEmail, password);
    const targetLoginA = await login(targetEmail, password);
    const targetLoginB = await login(targetEmail, password);

    const revoked = await http(app)
      .post(`/api/admin/v1/administrators/${targetId}/revoke-sessions`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!));
    expect(revoked.status).toBe(200);
    expect(
      (revoked.body as { data?: { revokedCount?: number } }).data?.revokedCount,
    ).toBeGreaterThanOrEqual(2);

    const staleA = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(targetLoginA.sessionToken!, targetLoginA.csrfToken!));
    expect(staleA.status).toBe(401);

    const staleB = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(targetLoginB.sessionToken!, targetLoginB.csrfToken!));
    expect(staleB.status).toBe(401);

    const keepSession = await login(actorEmail, password);
    const prior = await login(actorEmail, password);
    const keepCurrent = await http(app)
      .post(`/api/admin/v1/administrators/${actorId}/revoke-sessions`)
      .set(authHeaders(keepSession.sessionToken!, keepSession.csrfToken!));
    expect(keepCurrent.status).toBe(200);
    expect(
      (keepCurrent.body as { data?: { revokedCount?: number } }).data
        ?.revokedCount,
    ).toBeGreaterThanOrEqual(1);

    const stillCurrent = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(keepSession.sessionToken!, keepSession.csrfToken!));
    expect(stillCurrent.status).toBe(200);

    const otherGone = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(prior.sessionToken!, prior.csrfToken!));
    expect(otherGone.status).toBe(401);

    const badUuid = await http(app)
      .get('/api/admin/v1/administrators/not-a-uuid')
      .set(authHeaders(keepSession.sessionToken!, keepSession.csrfToken!));
    expect(badUuid.status).toBe(400);
    expect(badUuid.body).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('revokes sessions on password reset and deactivation; reactivation does not restore', async () => {
    if (!enabled) return;
    const actorEmail = uniqueEmail('pw-actor');
    const targetEmail = uniqueEmail('pw-target');
    const password = 'valid-password-12';
    await insertAdmin({ email: actorEmail, password, role: 'super_admin' });
    const targetId = await insertAdmin({
      email: targetEmail,
      password,
      role: 'viewer',
    });
    const actorLogin = await login(actorEmail, password);
    const targetSession = await login(targetEmail, password);

    const reset = await http(app)
      .patch(`/api/admin/v1/administrators/${targetId}`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!))
      .send({ password: 'reset-password-12' });
    expect(reset.status).toBe(200);

    const afterReset = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(targetSession.sessionToken!, targetSession.csrfToken!));
    expect(afterReset.status).toBe(401);

    const targetFresh = await login(targetEmail, 'reset-password-12');
    expect(targetFresh.status).toBe(200);

    const deactivate = await http(app)
      .patch(`/api/admin/v1/administrators/${targetId}`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!))
      .send({ status: 'deactivated' });
    expect(deactivate.status).toBe(200);

    const afterDeactivate = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(targetFresh.sessionToken!, targetFresh.csrfToken!));
    expect(afterDeactivate.status).toBe(401);

    const reactivate = await http(app)
      .patch(`/api/admin/v1/administrators/${targetId}`)
      .set(authHeaders(actorLogin.sessionToken!, actorLogin.csrfToken!))
      .send({ status: 'active' });
    expect(reactivate.status).toBe(200);

    const stillRevoked = await http(app)
      .get('/api/admin/v1/auth/me')
      .set(authHeaders(targetFresh.sessionToken!, targetFresh.csrfToken!));
    expect(stillRevoked.status).toBe(401);

    const loginAgain = await login(targetEmail, 'reset-password-12');
    expect(loginAgain.status).toBe(200);
  });

  it('updates own profile display name only', async () => {
    if (!enabled) return;
    const email = uniqueEmail('profile');
    const password = 'valid-password-12';
    await insertAdmin({
      email,
      password,
      displayName: 'Before Name',
    });
    const okLogin = await login(email, password);

    const updated = await http(app)
      .patch('/api/admin/v1/auth/profile')
      .set(authHeaders(okLogin.sessionToken!, okLogin.csrfToken!))
      .send({ displayName: 'After Name' });
    expect(updated.status).toBe(200);
    expect(
      (updated.body as { data?: { user?: { displayName?: string } } }).data
        ?.user?.displayName,
    ).toBe('After Name');

    const rejected = await http(app)
      .patch('/api/admin/v1/auth/profile')
      .set(authHeaders(okLogin.sessionToken!, okLogin.csrfToken!))
      .send({ displayName: 'X', role: 'viewer' });
    expect(rejected.status).toBe(400);
    expect(JSON.stringify(rejected.body)).toContain('VALIDATION_ERROR');
  });

  it('reads and updates matchmaking bot-fill policy for live_ops', async () => {
    if (!enabled) return;

    const viewerEmail = uniqueEmail('botfill-viewer');
    const liveOpsEmail = uniqueEmail('botfill-liveops');
    const password = 'valid-password-12';
    await insertAdmin({
      email: viewerEmail,
      password,
      role: 'viewer',
    });
    await insertAdmin({
      email: liveOpsEmail,
      password,
      role: 'live_ops',
    });

    const viewerLogin = await login(viewerEmail, password);
    const liveOpsLogin = await login(liveOpsEmail, password);
    expect(viewerLogin.status).toBe(200);
    expect(liveOpsLogin.status).toBe(200);
    expect(viewerLogin.sessionToken).toBeTruthy();
    expect(liveOpsLogin.sessionToken).toBeTruthy();

    const unauthorized = await http(app).get(
      '/api/admin/v1/matchmaking/bot-fill-policy',
    );
    expect(unauthorized.status).toBe(401);

    const forbiddenRead = await http(app)
      .get('/api/admin/v1/matchmaking/bot-fill-policy')
      .set(authHeaders(viewerLogin.sessionToken!, viewerLogin.csrfToken!));
    expect(forbiddenRead.status).toBe(403);

    const initial = await http(app)
      .get('/api/admin/v1/matchmaking/bot-fill-policy')
      .set(authHeaders(liveOpsLogin.sessionToken!, liveOpsLogin.csrfToken!));
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      ok: true,
      data: {
        enabled: expect.any(Boolean),
        waitMs: expect.any(Number),
      },
    });

    const forbiddenWrite = await http(app)
      .patch('/api/admin/v1/matchmaking/bot-fill-policy')
      .set(authHeaders(viewerLogin.sessionToken!, viewerLogin.csrfToken!))
      .send({ enabled: true, waitMs: 20_000 });
    expect(forbiddenWrite.status).toBe(403);

    const updated = await http(app)
      .patch('/api/admin/v1/matchmaking/bot-fill-policy')
      .set(authHeaders(liveOpsLogin.sessionToken!, liveOpsLogin.csrfToken!))
      .send({ enabled: true, waitMs: 20_000 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      ok: true,
      data: { enabled: true, waitMs: 20_000 },
    });
    expect(matchmakingService.getBotFillPolicy()).toEqual({
      enabled: true,
      waitMs: 20_000,
    });

    const invalid = await http(app)
      .patch('/api/admin/v1/matchmaking/bot-fill-policy')
      .set(authHeaders(liveOpsLogin.sessionToken!, liveOpsLogin.csrfToken!))
      .send({});
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('sorts administrators with allowlisted fields and rejects injection', async () => {
    if (!enabled) return;
    const email = uniqueEmail('sort-actor');
    const password = 'valid-password-12';
    await insertAdmin({ email, password, role: 'super_admin' });
    const loginResult = await login(email, password);

    const stamp = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const alphaName = `Alpha Sort ${stamp}`;
    const zuluName = `Zulu Sort ${stamp}`;
    await insertAdmin({
      email: uniqueEmail('sort-a'),
      password,
      displayName: alphaName,
      role: 'viewer',
    });
    await insertAdmin({
      email: uniqueEmail('sort-z'),
      password,
      displayName: zuluName,
      role: 'viewer',
    });

    const sorted = await http(app)
      .get('/api/admin/v1/administrators')
      .query({
        q: stamp,
        sortBy: 'displayName',
        sortOrder: 'asc',
        pageSize: 100,
      })
      .set(authHeaders(loginResult.sessionToken!, loginResult.csrfToken!));
    expect(sorted.status).toBe(200);
    const items = (
      sorted.body as {
        data?: { items?: Array<{ displayName: string }> };
      }
    ).data?.items;
    expect(items).toBeDefined();
    const names = items!.map((item) => item.displayName);
    const alphaIdx = names.indexOf(alphaName);
    const zuluIdx = names.indexOf(zuluName);
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(zuluIdx).toBeGreaterThan(alphaIdx);

    const injection = await http(app)
      .get('/api/admin/v1/administrators')
      .query({
        sortBy: 'created_at;drop table admin_users',
        sortOrder: 'asc',
      })
      .set(authHeaders(loginResult.sessionToken!, loginResult.csrfToken!));
    expect(injection.status).toBe(400);
    expect(injection.body).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
