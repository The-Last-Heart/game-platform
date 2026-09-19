import { z } from 'zod';
import { stableSemVerSchema } from '../../content/v1/semver';

const httpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'store URL must use https',
  });

/**
 * Durable administrator-controlled mobile application version policy.
 * Secrets and credentials must never be stored here.
 */
export const adminAppVersionPolicySchema = z
  .object({
    policyId: z.literal('mobile_app_version'),
    minimumSupportedVersion: stableSemVerSchema,
    androidStoreUrl: httpsUrlSchema,
    iosStoreUrl: httpsUrlSchema,
    policyRevision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    updatedByAdminId: z.string().uuid().nullable(),
    updatedByDisplayName: z.string().min(1).max(120).nullable(),
    /** Connected sessions currently below the live minimum (best-effort). */
    sessionsBelowMinimum: z.number().int().nonnegative().optional(),
  })
  .strict();
export type AdminAppVersionPolicy = z.infer<typeof adminAppVersionPolicySchema>;

export const adminAppVersionPolicyPatchRequestSchema = z
  .object({
    minimumSupportedVersion: stableSemVerSchema,
    androidStoreUrl: httpsUrlSchema,
    iosStoreUrl: httpsUrlSchema,
    /** Optimistic concurrency — must match the loaded policy revision. */
    policyRevision: z.number().int().nonnegative(),
    confirmation: z.literal(true),
    reason: z.string().min(3).max(500),
  })
  .strict();
export type AdminAppVersionPolicyPatchRequest = z.infer<
  typeof adminAppVersionPolicyPatchRequestSchema
>;
