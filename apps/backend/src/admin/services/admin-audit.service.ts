import { Injectable } from '@nestjs/common';
import type { AdminAuditOutcome } from '@thelastheart/contracts';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

const REDACT_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|hash|credential|session|database|connection.?string|answer|server.?config|resume|signal)/i;

export type AuditWriteInput = {
  actorAdminId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AdminAuditOutcome;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AdminAuditService {
  constructor(private readonly db: DatabaseService) {}

  redactMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!metadata) {
      return {};
    }
    return this.redactValue(metadata) as Record<string, unknown>;
  }

  private redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value)) {
        if (REDACT_KEY_PATTERN.test(key)) {
          out[key] = '[REDACTED]';
        } else {
          out[key] = this.redactValue(nested);
        }
      }
      return out;
    }
    if (typeof value === 'string' && value.length > 256) {
      return `${value.slice(0, 64)}…[truncated]`;
    }
    return value;
  }

  async write(input: AuditWriteInput, client?: PoolClient): Promise<void> {
    const metadata = this.redactMetadata(input.metadata);
    const sql = `
      INSERT INTO admin_audit_logs (
        actor_admin_id, action, entity_type, entity_id, outcome, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `;
    const params = [
      input.actorAdminId,
      input.action,
      input.entityType,
      input.entityId,
      input.outcome,
      JSON.stringify(metadata),
    ];
    if (client) {
      await client.query(sql, params);
      return;
    }
    await this.db.query(sql, params);
  }
}
