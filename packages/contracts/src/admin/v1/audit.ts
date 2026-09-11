import { z } from 'zod';
import { adminPaginatedSchema, adminPaginationQuerySchema } from './pagination';

export const ADMIN_AUDIT_OUTCOMES = ['success', 'failure', 'denied'] as const;
export const adminAuditOutcomeSchema = z.enum(ADMIN_AUDIT_OUTCOMES);
export type AdminAuditOutcome = z.infer<typeof adminAuditOutcomeSchema>;

export const adminAuditLogEntrySchema = z
  .object({
    id: z.string().uuid(),
    actorAdminId: z.string().uuid().nullable(),
    action: z.string().min(1).max(128),
    entityType: z.string().min(1).max(64),
    entityId: z.string().min(1).max(128).nullable(),
    outcome: adminAuditOutcomeSchema,
    /** Redacted metadata — never passwords, tokens, or raw secrets. */
    metadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AdminAuditLogEntry = z.infer<typeof adminAuditLogEntrySchema>;

export const adminAuditLogQuerySchema = adminPaginationQuerySchema
  .extend({
    actorAdminId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(128).optional(),
    entityType: z.string().trim().min(1).max(64).optional(),
    entityId: z.string().trim().min(1).max(128).optional(),
    outcome: adminAuditOutcomeSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;

export const adminAuditLogListResponseSchema = adminPaginatedSchema(
  adminAuditLogEntrySchema,
);
export type AdminAuditLogListResponse = z.infer<
  typeof adminAuditLogListResponseSchema
>;
