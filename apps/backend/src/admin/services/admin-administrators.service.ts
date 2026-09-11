import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminAdministratorCreateRequest,
  AdminAdministratorListQuery,
  AdminAdministratorPatchRequest,
  AdminRole,
} from '@thelastheart/contracts';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { hashPassword } from '../security/password';
import { AdminAuditService } from './admin-audit.service';
import { resolveAdministratorOrderBy } from './admin-administrators.sort';
import {
  toAdministratorDto,
  type AdminAuthContext,
  type AdminUserRow,
} from './admin.types';

@Injectable()
export class AdminAdministratorsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: AdminAdministratorListQuery) {
    const filters: string[] = [];
    const params: unknown[] = [];

    if (query.role) {
      params.push(query.role);
      filters.push(`role = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`);
      filters.push(
        `(email_normalized LIKE $${params.length} OR lower(display_name) LIKE $${params.length})`,
      );
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const orderBy = resolveAdministratorOrderBy(query.sortBy, query.sortOrder);
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_users ${where}`,
      params,
    );
    const totalItems = Number(countResult.rows[0]?.count ?? 0);
    const offset = (query.page - 1) * query.pageSize;
    params.push(query.pageSize, offset);
    const rows = await this.db.query<AdminUserRow>(
      `SELECT * FROM admin_users
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      items: rows.rows.map(toAdministratorDto),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages:
          totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async getById(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Administrator not found' },
      });
    }
    return { administrator: toAdministratorDto(user) };
  }

  async create(actor: AdminAuthContext, body: AdminAdministratorCreateRequest) {
    const passwordHash = await hashPassword(body.password);
    try {
      const inserted = await this.db.tx(async (client) => {
        const result = await client.query<AdminUserRow>(
          `INSERT INTO admin_users (
             email, display_name, password_hash, role, status, created_by
           ) VALUES ($1, $2, $3, $4, 'active', $5)
           RETURNING *`,
          [
            body.email,
            body.displayName,
            passwordHash,
            body.role,
            actor.user.id,
          ],
        );
        const user = result.rows[0]!;
        await this.audit.write(
          {
            actorAdminId: actor.user.id,
            action: 'administrators.create',
            entityType: 'admin_user',
            entityId: user.id,
            outcome: 'success',
            metadata: { role: user.role, email: user.email },
          },
          client,
        );
        return user;
      });
      return { administrator: toAdministratorDto(inserted) };
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          ok: false,
          error: {
            code: 'CONFLICT',
            message: 'Email already in use',
          },
        });
      }
      throw error;
    }
  }

  async patch(
    actor: AdminAuthContext,
    id: string,
    body: AdminAdministratorPatchRequest,
  ) {
    try {
      return await this.db.tx(async (client) => {
        const locked = await client.query<AdminUserRow>(
          `SELECT * FROM admin_users WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const target = locked.rows[0];
        if (!target) {
          throw new NotFoundException({
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Administrator not found' },
          });
        }

        if (actor.user.id === target.id) {
          if (body.status === 'deactivated') {
            throw new ForbiddenException({
              ok: false,
              error: {
                code: 'SELF_DEACTIVATION_FORBIDDEN',
                message: 'Cannot deactivate your own account',
              },
            });
          }
          if (
            target.role === 'super_admin' &&
            body.role !== undefined &&
            body.role !== 'super_admin'
          ) {
            throw new ForbiddenException({
              ok: false,
              error: {
                code: 'SELF_DEMOTION_FORBIDDEN',
                message: 'Cannot demote your own super_admin role',
              },
            });
          }
        }

        const nextRole: AdminRole = body.role ?? target.role;
        const nextStatus = body.status ?? target.status;
        const demotingOrDeactivatingFinalSuperAdmin =
          target.role === 'super_admin' &&
          target.status === 'active' &&
          (nextRole !== 'super_admin' || nextStatus !== 'active');

        if (demotingOrDeactivatingFinalSuperAdmin) {
          const isLast = await this.isLastActiveSuperAdmin(client, target.id);
          if (isLast) {
            throw new ForbiddenException({
              ok: false,
              error: {
                code: 'LAST_SUPER_ADMIN',
                message: 'Cannot remove the final active super_admin',
              },
            });
          }
        }

        let passwordHash = target.password_hash;
        let passwordChanged = false;
        if (body.password) {
          passwordHash = await hashPassword(body.password);
          passwordChanged = true;
        }

        const updated = await client.query<AdminUserRow>(
          `UPDATE admin_users
           SET display_name = COALESCE($1, display_name),
               role = $2,
               status = $3,
               password_hash = $4,
               password_changed_at = CASE WHEN $5 THEN now() ELSE password_changed_at END,
               updated_at = now()
           WHERE id = $6
           RETURNING *`,
          [
            body.displayName ?? null,
            nextRole,
            nextStatus,
            passwordHash,
            passwordChanged,
            id,
          ],
        );

        const deactivated =
          nextStatus === 'deactivated' && target.status !== 'deactivated';
        // Password reset by another admin: revoke ALL target sessions in this transaction.
        const revokeAllSessions =
          deactivated || (passwordChanged && actor.user.id !== target.id);

        if (revokeAllSessions) {
          await client.query(
            `UPDATE admin_sessions
             SET revoked_at = now()
             WHERE admin_user_id = $1 AND revoked_at IS NULL`,
            [id],
          );
        }

        // Reactivation only flips status; revoked sessions are intentionally not restored.

        await this.audit.write(
          {
            actorAdminId: actor.user.id,
            action: 'administrators.patch',
            entityType: 'admin_user',
            entityId: id,
            outcome: 'success',
            metadata: {
              role: nextRole,
              status: nextStatus,
              passwordChanged,
              sessionsRevoked: revokeAllSessions,
            },
          },
          client,
        );

        return { administrator: toAdministratorDto(updated.rows[0]!) };
      });
    } catch (error: unknown) {
      // Audit after the txn rolls back so FK checks are not blocked by FOR UPDATE locks.
      await this.auditDeniedAdministratorPatch(actor, id, error);
      throw error;
    }
  }

  /**
   * Revoke sessions for a target administrator.
   * Self-target: revoke all OTHER sessions (keep the actor's current session).
   * Other-target: revoke ALL of their sessions.
   */
  async revokeSessions(
    actor: AdminAuthContext,
    targetId: string,
  ): Promise<number> {
    return this.db.tx(async (client) => {
      const target = await client.query<AdminUserRow>(
        `SELECT * FROM admin_users WHERE id = $1 FOR UPDATE`,
        [targetId],
      );
      if (!target.rows[0]) {
        throw new NotFoundException({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Administrator not found' },
        });
      }

      const isSelf = actor.user.id === targetId;
      let result;
      if (isSelf) {
        result = await client.query<{ id: string }>(
          `UPDATE admin_sessions
           SET revoked_at = now()
           WHERE admin_user_id = $1
             AND revoked_at IS NULL
             AND id <> $2
           RETURNING id`,
          [targetId, actor.session.id],
        );
      } else {
        result = await client.query<{ id: string }>(
          `UPDATE admin_sessions
           SET revoked_at = now()
           WHERE admin_user_id = $1 AND revoked_at IS NULL
           RETURNING id`,
          [targetId],
        );
      }

      const revokedCount = result.rowCount ?? 0;
      await this.audit.write(
        {
          actorAdminId: actor.user.id,
          action: 'administrators.revoke_sessions',
          entityType: 'admin_user',
          entityId: targetId,
          outcome: 'success',
          metadata: { revokedCount, selfTarget: isSelf },
        },
        client,
      );
      return revokedCount;
    });
  }

  async countByStatus(): Promise<{
    activeCount: number;
    deactivatedCount: number;
  }> {
    const result = await this.db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM admin_users
       GROUP BY status`,
    );
    let activeCount = 0;
    let deactivatedCount = 0;
    for (const row of result.rows) {
      if (row.status === 'active') {
        activeCount = Number(row.count);
      } else if (row.status === 'deactivated') {
        deactivatedCount = Number(row.count);
      }
    }
    return { activeCount, deactivatedCount };
  }

  private async findById(id: string): Promise<AdminUserRow | undefined> {
    const result = await this.db.query<AdminUserRow>(
      `SELECT * FROM admin_users WHERE id = $1`,
      [id],
    );
    return result.rows[0];
  }

  private async isLastActiveSuperAdmin(
    client: PoolClient,
    excludeId: string,
  ): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM admin_users
       WHERE role = 'super_admin'
         AND status = 'active'
       FOR UPDATE`,
    );
    const others = result.rows.filter((row) => row.id !== excludeId);
    return others.length < 1;
  }

  private async auditDeniedAdministratorPatch(
    actor: AdminAuthContext,
    id: string,
    error: unknown,
  ): Promise<void> {
    const reason = this.forbiddenErrorCode(error);
    if (
      reason !== 'SELF_DEACTIVATION_FORBIDDEN' &&
      reason !== 'SELF_DEMOTION_FORBIDDEN' &&
      reason !== 'LAST_SUPER_ADMIN'
    ) {
      return;
    }
    await this.audit.write({
      actorAdminId: actor.user.id,
      action: 'administrators.patch',
      entityType: 'admin_user',
      entityId: id,
      outcome: 'denied',
      metadata: { reason },
    });
  }

  private forbiddenErrorCode(error: unknown): string | null {
    if (!(error instanceof ForbiddenException)) {
      return null;
    }
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null && 'error' in response) {
      const nested = (response as { error?: { code?: unknown } }).error;
      if (nested && typeof nested.code === 'string') {
        return nested.code;
      }
    }
    return null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
