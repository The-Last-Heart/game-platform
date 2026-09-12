import { z } from 'zod';

export const adminEmergencyControlsSchema = z
  .object({
    matchmakingPaused: z.boolean(),
    matchmakingPauseReason: z.string().max(500).nullable(),
    matchmakingPausedAt: z.string().datetime().nullable(),
    botFillEnabled: z.boolean(),
    botFillWaitMs: z.number().int().min(0).max(600_000),
    offensivePowersDisabled: z.boolean(),
    offensivePowersDisableReason: z.string().max(500).nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AdminEmergencyControls = z.infer<typeof adminEmergencyControlsSchema>;

export const adminEmergencyControlsPatchRequestSchema = z
  .object({
    matchmakingPaused: z.boolean().optional(),
    matchmakingPauseReason: z.string().min(3).max(500).optional(),
    botFillEnabled: z.boolean().optional(),
    botFillWaitMs: z.number().int().min(0).max(600_000).optional(),
    offensivePowersDisabled: z.boolean().optional(),
    offensivePowersDisableReason: z.string().min(3).max(500).optional(),
    confirmation: z.literal(true),
    reason: z.string().min(3).max(500),
  })
  .strict()
  .refine(
    (data) =>
      data.matchmakingPaused !== undefined ||
      data.botFillEnabled !== undefined ||
      data.botFillWaitMs !== undefined ||
      data.offensivePowersDisabled !== undefined,
    { message: 'At least one control field is required' },
  );
