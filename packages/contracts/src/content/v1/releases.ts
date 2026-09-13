import { z } from 'zod';

/** Immutable release identifier (uuid). */
export const releaseIdSchema = z.string().uuid();

export const releaseKindSchema = z.enum([
  'challenge_catalog',
  'game_mode_rules',
  'localization',
  'power_configuration',
]);
export type ReleaseKind = z.infer<typeof releaseKindSchema>;

/**
 * Four release pins attached at match creation and kept for the match lifetime.
 * Active matches must not re-resolve "current" releases.
 */
export const matchReleasePinsSchema = z
  .object({
    challengeCatalogReleaseId: releaseIdSchema,
    gameModeRuleReleaseId: releaseIdSchema,
    localizationReleaseId: releaseIdSchema,
    powerConfigurationReleaseId: releaseIdSchema,
  })
  .strict();
export type MatchReleasePins = z.infer<typeof matchReleasePinsSchema>;

export const contentLifecycleStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'published',
  'paused',
  'retired',
]);
export type ContentLifecycleStatus = z.infer<typeof contentLifecycleStatusSchema>;

export const matchModeEligibilitySchema = z.enum([
  'quick_survival',
  'private',
  'training',
  'dev',
]);

/**
 * Published challenge definition (runtime + admin). Extends the playable
 * wait-for-signal shape with LH-006 governance metadata.
 */
export const challengeDefinitionSchema = z
  .object({
    definitionId: z.string().min(1).max(128),
    definitionVersion: z.number().int().positive(),
    engineId: z.string().min(1).max(128),
    durationMs: z.number().int().min(3000).max(8000),
    heartPenaltyOnFailure: z.union([z.literal(0), z.literal(1)]),
    energyRewardOnSuccess: z.number().int().min(0).max(3),
    promptKey: z.string().min(1).max(256),
    choiceKeys: z.array(z.string().min(1).max(128)).optional(),
    clientConfig: z.record(z.unknown()),
    serverConfig: z.record(z.unknown()),
    // Governance / catalog metadata
    internalTitle: z.string().min(1).max(120),
    familyId: z.string().min(1).max(64),
    categoryId: z.string().min(1).max(64),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    instructionAr: z.string().min(2).max(500),
    hintAr: z.string().max(500).optional(),
    outcomeReasonKeys: z.record(z.string().min(1).max(256)).optional(),
    introDurationMs: z.number().int().min(0).max(5000).optional(),
    resultHoldMs: z.number().int().min(0).max(10_000).optional(),
    eligibleModes: z.array(matchModeEligibilitySchema).min(1),
    roundMin: z.number().int().min(1).max(99).optional(),
    roundMax: z.number().int().min(1).max(99).optional(),
    selectionWeight: z.number().int().min(1).max(10_000).default(100),
    repetitionCooldownRounds: z.number().int().min(0).max(20).default(0),
    minAppVersion: z.string().min(1).max(32).default('0.0.0'),
    requiredCapabilities: z.array(z.string().min(1).max(64)).default([]),
    accessibilityFallbackKey: z.string().min(1).max(128),
    requiredAssetIds: z.array(z.string().min(1).max(128)).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.roundMin != null &&
      value.roundMax != null &&
      value.roundMin > value.roundMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roundMax'],
        message: 'roundMax must be >= roundMin',
      });
    }
  });
export type ChallengeDefinitionContract = z.infer<
  typeof challengeDefinitionSchema
>;

export const catalogReleaseEntrySchema = z
  .object({
    templateVersionId: releaseIdSchema,
    definitionId: z.string().min(1).max(128),
    weight: z.number().int().min(1).max(10_000),
    repetitionCooldownRounds: z.number().int().min(0).max(20),
    roundMin: z.number().int().min(1).max(99).optional(),
    roundMax: z.number().int().min(1).max(99).optional(),
    paused: z.boolean().default(false),
  })
  .strict();

export const challengeCatalogReleasePayloadSchema = z
  .object({
    releaseId: releaseIdSchema,
    versionLabel: z.string().min(1).max(64),
    entries: z.array(catalogReleaseEntrySchema).min(1),
    changelog: z.string().max(4000).optional(),
  })
  .strict();

export const gameModeRuleReleasePayloadSchema = z
  .object({
    releaseId: releaseIdSchema,
    versionLabel: z.string().min(1).max(64),
    rules: z
      .object({
        initialHearts: z.number().int().min(1).max(5).default(3),
        minLivePlayers: z.number().int().min(2).max(6).default(2),
        playerCapacity: z.number().int().min(1).max(6).default(6),
        quickLobbyFillWaitMs: z.number().int().min(5_000).max(300_000).default(60_000),
      })
      .strict(),
    changelog: z.string().max(4000).optional(),
  })
  .strict();

export const localizationReleasePayloadSchema = z
  .object({
    releaseId: releaseIdSchema,
    versionLabel: z.string().min(1).max(64),
    locales: z.array(z.enum(['ar', 'en'])).min(1),
    entries: z.record(z.record(z.string().min(1).max(2000))),
    changelog: z.string().max(4000).optional(),
  })
  .strict();

export const powerIdSchema = z.enum([
  'danger_pulse',
  'shield',
  'reflection',
]);
export type PowerId = z.infer<typeof powerIdSchema>;

export const powerDefinitionSchema = z
  .object({
    powerId: powerIdSchema,
    enabled: z.boolean().default(true),
    grantWeight: z.number().int().min(0).max(10_000).default(100),
    eligibleModes: z.array(matchModeEligibilitySchema).min(1),
    nameKey: z.string().min(1).max(256),
    explanationKey: z.string().min(1).max(256),
    assetIds: z.array(z.string().min(1).max(128)).default([]),
  })
  .strict();

export const powerConfigurationReleasePayloadSchema = z
  .object({
    releaseId: releaseIdSchema,
    versionLabel: z.string().min(1).max(64),
    /** Segments required to convert into one power grant. */
    energyThreshold: z.literal(4),
    inventoryMaxTotal: z.literal(3),
    inventoryMaxPerPower: z.literal(1),
    actionWindowMs: z.number().int().min(3_000).max(30_000).default(8_000),
    defenseWindowMs: z.number().int().min(2_000).max(15_000).default(5_000),
    powers: z.array(powerDefinitionSchema).min(1).max(3),
    changelog: z.string().max(4000).optional(),
  })
  .strict();
export type PowerConfigurationReleasePayload = z.infer<
  typeof powerConfigurationReleasePayloadSchema
>;