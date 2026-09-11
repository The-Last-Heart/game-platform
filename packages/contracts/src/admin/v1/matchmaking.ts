import { z } from 'zod';

export const adminBotFillPolicySchema = z
  .object({
    enabled: z.boolean(),
    waitMs: z.number().int().min(0).max(600_000),
  })
  .strict();
export type AdminBotFillPolicy = z.infer<typeof adminBotFillPolicySchema>;

export const adminBotFillPolicyResponseSchema = adminBotFillPolicySchema;

export const adminBotFillPolicyPatchRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    waitMs: z.number().int().min(0).max(600_000).optional(),
  })
  .strict()
  .refine(
    (data) => data.enabled !== undefined || data.waitMs !== undefined,
    { message: 'At least one of enabled or waitMs is required' },
  );
