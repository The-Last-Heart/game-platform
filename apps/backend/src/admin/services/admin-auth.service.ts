import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCsrfToken, createOpaqueSessionToken } from '../security/tokens';
import {
  hashIpOptional,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../security/password';
import { AdminLoginThrottleService } from '../security/login-throttle.service';
import { DatabaseService } from '../../database/database.service';
import type { AppConfig } from '../../config/env.validation';
import { AdminAuditService } from './admin-audit.service';
import {
  toAuthenticatedUser,
  toIso,
  type AdminAuthContext,
  type AdminSessionRow,
  type AdminUserRow,
} from './admin.types';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly throttle: AdminLoginThrottleService,
    private readonly audit: AdminAuditService,
  ) {}

  issueCsrfToken(): string {
    const secret = this.config.get('ADMIN_CSRF_SECRET', { infer: true });
    return createCsrfToken(secret);
  }

  async login(input: {
    email: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }) {
    const email = input.email.toLowerCase();
    if (await this.throttle.isBlocked(email)) {
      throw new HttpException(
        {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many login attempts. Try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userResult = await this.db.query<AdminUserRow>(
      `SELECT * FROM admin_users WHERE email_normalized = $1 LIMIT 1`,
      [email],
    );
    const user = userResult.rows[0];
    const invalid = () =>
      new UnauthorizedException({
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        },
      });

    if (!user || user.status !== 'active') {
      await this.throttle.recordFailure(email);
      await this.audit.write({
        actorAdminId: user?.id ?? null,
        action: 'auth.login',
        entityType: 'admin_user',
        entityId: user?.id ?? email,
        outcome: 'failure',
        metadata: { reason: 'invalid_or_inactive' },
      });
      throw invalid();
    }

    const passwordOk = await verifyPassword(input.password, user.password_hash);
    if (!passwordOk) {
      await this.throttle.recordFailure(email);
      await this.audit.write({
        actorAdminId: user.id,
        action: 'auth.login',
        entityType: 'admin_user',
        entityId: user.id,
        outcome: 'failure',
        metadata: { reason: 'bad_password' },
      });
      throw invalid();
    }

    await this.throttle.clearFailures(email);

    const sessionToken = createOpaqueSessionToken();
    const tokenHash = sha256Hex(sessionToken);
    const ttlSeconds = this.config.get('ADMIN_SESSION_TTL_SECONDS', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const ipHash = hashIpOptional(input.ip);

    const session = await this.db.tx(async (client) => {
      // Insert a fresh session only (anti-fixation). Existing sessions stay active
      // until explicit revoke, password change, or deactivation.
      const inserted = await client.query<AdminSessionRow>(
        `INSERT INTO admin_sessions (
           admin_user_id, token_hash, expires_at, user_agent, ip_hash
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          user.id,
          tokenHash,
          expiresAt.toISOString(),
          input.userAgent ?? null,
          ipHash,
        ],
      );

      await client.query(
        `UPDATE admin_users
         SET last_login_at = now(), updated_at = now()
         WHERE id = $1`,
        [user.id],
      );

      await this.audit.write(
        {
          actorAdminId: user.id,
          action: 'auth.login',
          entityType: 'admin_user',
          entityId: user.id,
          outcome: 'success',
        },
        client,
      );

      return inserted.rows[0]!;
    });

    const refreshed = await this.db.query<AdminUserRow>(
      `SELECT * FROM admin_users WHERE id = $1`,
      [user.id],
    );

    return {
      user: toAuthenticatedUser(refreshed.rows[0]!),
      session: {
        sessionId: session.id,
        expiresAt: toIso(session.expires_at),
      },
      sessionToken,
      csrfToken: this.issueCsrfToken(),
    };
  }

  /**
   * Revoke the session for `token` if it is still active.
   * Always succeeds from the caller's perspective — never reveals whether the
   * token existed. Skips audit when nothing was revoked.
   */
  async logout(token: string, actorAdminId: string | null): Promise<void> {
    const tokenHash = sha256Hex(token);
    const result = await this.db.query<AdminSessionRow>(
      `UPDATE admin_sessions
       SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING *`,
      [tokenHash],
    );
    const session = result.rows[0];
    if (!session) {
      return;
    }
    await this.audit.write({
      actorAdminId: actorAdminId ?? session.admin_user_id,
      action: 'auth.logout',
      entityType: 'admin_session',
      entityId: session.id,
      outcome: 'success',
    });
  }

  /**
   * List active, non-expired sessions for the authenticated admin.
   * Never exposes token hashes, raw tokens, or ip_hash.
   */
  async listSessions(auth: AdminAuthContext): Promise<{
    sessions: Array<{
      sessionId: string;
      current: boolean;
      createdAt: string;
      lastSeenAt: string;
      expiresAt: string;
      deviceDescription: string;
    }>;
  }> {
    const result = await this.db.query<AdminSessionRow>(
      `SELECT *
       FROM admin_sessions
       WHERE admin_user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC`,
      [auth.user.id],
    );

    return {
      sessions: result.rows.map((row) => ({
        sessionId: row.id,
        current: row.id === auth.session.id,
        createdAt: toIso(row.created_at),
        lastSeenAt: toIso(row.last_seen_at),
        expiresAt: toIso(row.expires_at),
        deviceDescription: sanitizeDeviceDescription(row.user_agent),
      })),
    };
  }

  async resolveSession(token: string): Promise<AdminAuthContext> {
    const tokenHash = sha256Hex(token);
    const result = await this.db.query<{
      session_id: string;
      admin_user_id: string;
      token_hash: string;
      expires_at: Date;
      last_seen_at: Date;
      revoked_at: Date | null;
      session_created_at: Date;
      user_agent: string | null;
      ip_hash: string | null;
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      role: AdminUserRow['role'];
      status: AdminUserRow['status'];
      last_login_at: Date | null;
      password_changed_at: Date;
      created_at: Date;
      updated_at: Date;
      created_by: string | null;
    }>(
      `SELECT
         s.id AS session_id,
         s.admin_user_id,
         s.token_hash,
         s.expires_at,
         s.last_seen_at,
         s.revoked_at,
         s.created_at AS session_created_at,
         s.user_agent,
         s.ip_hash,
         u.id,
         u.email,
         u.display_name,
         u.password_hash,
         u.role,
         u.status,
         u.last_login_at,
         u.password_changed_at,
         u.created_at,
         u.updated_at,
         u.created_by
       FROM admin_sessions s
       INNER JOIN admin_users u ON u.id = s.admin_user_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      throw new UnauthorizedException({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (row.revoked_at) {
      throw new UnauthorizedException({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Session revoked' },
      });
    }

    if (row.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        ok: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
      });
    }

    if (row.status !== 'active') {
      throw new UnauthorizedException({
        ok: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Account deactivated',
        },
      });
    }

    await this.db.query(
      `UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1`,
      [row.session_id],
    );

    const user: AdminUserRow = {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      password_hash: row.password_hash,
      role: row.role,
      status: row.status,
      last_login_at: row.last_login_at,
      password_changed_at: row.password_changed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
    };

    const session: AdminSessionRow = {
      id: row.session_id,
      admin_user_id: row.admin_user_id,
      token_hash: row.token_hash,
      expires_at: row.expires_at,
      last_seen_at: new Date(),
      revoked_at: row.revoked_at,
      created_at: row.session_created_at,
      user_agent: row.user_agent,
      ip_hash: row.ip_hash,
    };

    return {
      user,
      session,
      permissions: toAuthenticatedUser(user).permissions,
    };
  }

  async changePassword(input: {
    auth: AdminAuthContext;
    currentPassword: string;
    newPassword: string;
    userAgent?: string;
    ip?: string;
  }) {
    const ok = await verifyPassword(
      input.currentPassword,
      input.auth.user.password_hash,
    );
    if (!ok) {
      await this.audit.write({
        actorAdminId: input.auth.user.id,
        action: 'auth.change_password',
        entityType: 'admin_user',
        entityId: input.auth.user.id,
        outcome: 'failure',
        metadata: { reason: 'bad_current_password' },
      });
      throw new UnauthorizedException({
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        },
      });
    }

    const passwordHash = await hashPassword(input.newPassword);
    const sessionToken = createOpaqueSessionToken();
    const tokenHash = sha256Hex(sessionToken);
    const ttlSeconds = this.config.get('ADMIN_SESSION_TTL_SECONDS', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const ipHash = hashIpOptional(input.ip);

    const session = await this.db.tx(async (client) => {
      await client.query(
        `UPDATE admin_users
         SET password_hash = $1,
             password_changed_at = now(),
             updated_at = now()
         WHERE id = $2`,
        [passwordHash, input.auth.user.id],
      );

      await client.query(
        `UPDATE admin_sessions
         SET revoked_at = now()
         WHERE admin_user_id = $1 AND revoked_at IS NULL`,
        [input.auth.user.id],
      );

      const inserted = await client.query<AdminSessionRow>(
        `INSERT INTO admin_sessions (
           admin_user_id, token_hash, expires_at, user_agent, ip_hash
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.auth.user.id,
          tokenHash,
          expiresAt.toISOString(),
          input.userAgent ?? null,
          ipHash,
        ],
      );

      await this.audit.write(
        {
          actorAdminId: input.auth.user.id,
          action: 'auth.change_password',
          entityType: 'admin_user',
          entityId: input.auth.user.id,
          outcome: 'success',
        },
        client,
      );

      return inserted.rows[0]!;
    });

    return {
      passwordChangedAt: new Date().toISOString(),
      session: {
        sessionId: session.id,
        expiresAt: toIso(session.expires_at),
      },
      sessionToken,
      csrfToken: this.issueCsrfToken(),
    };
  }

  async revokeOtherSessions(auth: AdminAuthContext): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE admin_sessions
       SET revoked_at = now()
       WHERE admin_user_id = $1
         AND revoked_at IS NULL
         AND id <> $2
       RETURNING id`,
      [auth.user.id, auth.session.id],
    );
    await this.audit.write({
      actorAdminId: auth.user.id,
      action: 'auth.revoke_other_sessions',
      entityType: 'admin_user',
      entityId: auth.user.id,
      outcome: 'success',
      metadata: { revokedCount: result.rowCount ?? 0 },
    });
    return result.rowCount ?? 0;
  }

  async countActiveSessions(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM admin_sessions
       WHERE revoked_at IS NULL AND expires_at > now()`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

const DEVICE_DESCRIPTION_MAX = 120;

/** Short, control-char-free device label derived from User-Agent. */
export function sanitizeDeviceDescription(
  userAgent: string | null | undefined,
): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const cleaned = Array.from(userAgent)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return 'Unknown device';
  }
  if (cleaned.length <= DEVICE_DESCRIPTION_MAX) {
    return cleaned;
  }
  return cleaned.slice(0, DEVICE_DESCRIPTION_MAX);
}
