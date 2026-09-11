import { z } from 'zod';
import { adminPaginatedSchema, adminPaginationQuerySchema } from './pagination';

export const ADMIN_AUDIT_OUTCOMES = ['success', 'failure', 'denied'] as const;
export const adminAuditOutcomeSchema = z.enum(ADMIN_AUDIT_OUTCOMES);
export type AdminAuditOutcome = z.infer<typeof adminAuditOutcomeSchema>;

/** Monotonic audit sequence as a decimal string (avoids JS number precision loss). */
export const adminAuditSequenceIdSchema = z
  .string()
  .regex(/^\d+$/, 'sequenceId must be an unsigned decimal integer string');

export const adminAuditLogEntrySchema = z
  .object({
    id: z.string().uuid(),
    sequenceId: adminAuditSequenceIdSchema,
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
  .strict()
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from must be less than or equal to to',
        path: ['from'],
      });
    }
  });
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;

export const adminAuditLogListResponseSchema = adminPaginatedSchema(
  adminAuditLogEntrySchema,
);
export type AdminAuditLogListResponse = z.infer<
  typeof adminAuditLogListResponseSchema
>;
