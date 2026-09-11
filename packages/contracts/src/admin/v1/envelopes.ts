import { z } from 'zod';

export const ADMIN_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_CREDENTIALS',
  'RATE_LIMITED',
  'CSRF_REJECTED',
  'ORIGIN_REJECTED',
  'SESSION_EXPIRED',
  'ACCOUNT_DEACTIVATED',
  'LAST_SUPER_ADMIN',
  'SELF_DEMOTION_FORBIDDEN',
  'SELF_DEACTIVATION_FORBIDDEN',
  'INTERNAL_ERROR',
] as const;

export const adminErrorCodeSchema = z.enum(ADMIN_ERROR_CODES);
export type AdminErrorCode = z.infer<typeof adminErrorCodeSchema>;

export const adminErrorBodySchema = z
  .object({
    code: adminErrorCodeSchema,
    message: z.string().min(1).max(500),
    details: z.unknown().optional(),
  })
  .strict();
export type AdminErrorBody = z.infer<typeof adminErrorBodySchema>;

export const adminErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: adminErrorBodySchema,
  })
  .strict();
export type AdminErrorEnvelope = z.infer<typeof adminErrorEnvelopeSchema>;

export function adminSuccessEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({
      ok: z.literal(true),
      data: dataSchema,
    })
    .strict();
}

export type AdminSuccessEnvelope<T> = {
  readonly ok: true;
  readonly data: T;
};
