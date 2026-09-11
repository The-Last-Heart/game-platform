import { Injectable } from '@nestjs/common';
import type { AdminAuditLogQuery } from '@thelastheart/contracts';
import { DatabaseService } from '../../database/database.service';
import { AdminAuditService } from './admin-audit.service';
import { toIso } from './admin.types';

type AuditRow = {
  id: string;
  actor_admin_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  outcome: 'success' | 'failure' | 'denied';
  metadata: Record<string, unknown> | string;
  created_at: Date;
};

@Injectable()
export class AdminAuditQueryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: AdminAuditLogQuery) {
    const filters: string[] = [];
    const params: unknown[] = [];

    if (query.actorAdminId) {
      params.push(query.actorAdminId);
      filters.push(`actor_admin_id = $${params.length}`);
    }
    if (query.action) {
      params.push(query.action);
      filters.push(`action = $${params.length}`);
    }
    if (query.entityType) {
      params.push(query.entityType);
      filters.push(`entity_type = $${params.length}`);
    }
    if (query.entityId) {
      params.push(query.entityId);
      filters.push(`entity_id = $${params.length}`);
    }
    if (query.outcome) {
      params.push(query.outcome);
      filters.push(`outcome = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      filters.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`created_at <= $${params.length}::timestamptz`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_audit_logs ${where}`,
      params,
    );
    const totalItems = Number(countResult.rows[0]?.count ?? 0);
    const offset = (query.page - 1) * query.pageSize;
    params.push(query.pageSize, offset);

    const rows = await this.db.query<AuditRow>(
      `SELECT * FROM admin_audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      items: rows.rows.map((row) => {
        const metadataRaw =
          typeof row.metadata === 'string'
            ? (JSON.parse(row.metadata) as Record<string, unknown>)
            : row.metadata;
        return {
          id: row.id,
          actorAdminId: row.actor_admin_id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          outcome: row.outcome,
          metadata: this.audit.redactMetadata(metadataRaw ?? {}),
          createdAt: toIso(row.created_at),
        };
      }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages:
          totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
      },
    };
  }
}
