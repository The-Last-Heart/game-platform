import { z } from 'zod';
import {
  catalogReleaseEntrySchema,
  challengeDefinitionSchema,
  contentLifecycleStatusSchema,
  dailyGoalsReleasePayloadSchema,
  gameModeRuleReleasePayloadSchema,
  localizationReleasePayloadSchema,
  matchModeEligibilitySchema,
  matchReleasePinsSchema,
  powerConfigurationReleasePayloadSchema,
  releaseIdSchema,
  releaseKindSchema,
} from '../../content/v1/releases';

export const adminContentTemplateSummarySchema = z
  .object({
    templateId: releaseIdSchema,
    slug: z.string().min(1).max(128),
    internalTitle: z.string().min(1).max(120),
    familyId: z.string().min(1).max(64),
    categoryId: z.string().min(1).max(64),
    status: contentLifecycleStatusSchema,
    latestVersion: z.number().int().positive().nullable(),
    publishedReleaseId: releaseIdSchema.nullable(),
    engineId: z.string().min(1).max(128).nullable().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
    updatedAt: z.string().datetime().optional(),
    /** Latest approved/published version id for catalog compose. */
    latestApprovedVersionId: releaseIdSchema.nullable().optional(),
  })
  .strict();
export type AdminContentTemplateSummary = z.infer<
  typeof adminContentTemplateSummarySchema
>;

export const adminContentTemplateVersionSchema = z
  .object({
    templateVersionId: releaseIdSchema,
    templateId: releaseIdSchema,
    version: z.number().int().positive(),
    status: contentLifecycleStatusSchema,
    definition: challengeDefinitionSchema,
    validationNotes: z.string().max(4000).nullable(),
    createdAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable(),
    approvedByAdminId: releaseIdSchema.nullable(),
  })
  .strict();

export const adminContentDraftUpsertRequestSchema = z
  .object({
    templateId: releaseIdSchema.optional(),
    slug: z.string().min(1).max(128).optional(),
    definition: challengeDefinitionSchema,
  })
  .strict();

export const adminContentSubmitRequestSchema = z
  .object({
    templateVersionId: releaseIdSchema,
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const adminContentApproveRequestSchema = z
  .object({
    templateVersionId: releaseIdSchema,
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const adminContentPublishCatalogRequestSchema = z
  .object({
    versionLabel: z.string().min(1).max(64),
    templateVersionIds: z.array(releaseIdSchema).min(1),
    changelog: z.string().max(4000).optional(),
    immediate: z.boolean().default(true),
  })
  .strict();

export const adminContentPauseRequestSchema = z
  .object({
    templateVersionId: releaseIdSchema.optional(),
    definitionId: z.string().min(1).max(128).optional(),
    paused: z.boolean(),
    reason: z.string().min(3).max(500),
  })
  .strict()
  .refine(
    (v) => v.templateVersionId != null || v.definitionId != null,
    { message: 'templateVersionId or definitionId required' },
  );

export const adminContentRollbackRequestSchema = z
  .object({
    fromCatalogReleaseId: releaseIdSchema,
    versionLabel: z.string().min(1).max(64),
    reason: z.string().min(3).max(500),
  })
  .strict();

export const adminContentReleaseSummarySchema = z
  .object({
    releaseId: releaseIdSchema,
    kind: releaseKindSchema,
    versionLabel: z.string(),
    isCurrent: z.boolean(),
    publishedAt: z.string().datetime(),
    changelog: z.string().nullable(),
  })
  .strict();
export type AdminContentReleaseSummary = z.infer<
  typeof adminContentReleaseSummarySchema
>;

export const adminMatchPinsResponseSchema = matchReleasePinsSchema.extend({
  matchId: releaseIdSchema,
  createdAt: z.string().datetime(),
});
export type AdminMatchPinsResponse = z.infer<typeof adminMatchPinsResponseSchema>;

export const adminContentValidationErrorSchema = z
  .object({
    path: z.string(),
    message: z.string(),
    code: z.string(),
  })
  .strict();

// ── Studio home summary ────────────────────────────────────────────────────

export const adminStudioHomeSummarySchema = z
  .object({
    counts: z.object({
      drafts: z.number().int().nonnegative(),
      submitted: z.number().int().nonnegative(),
      inReview: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      scheduled: z.number().int().nonnegative(),
      published: z.number().int().nonnegative(),
      paused: z.number().int().nonnegative(),
    }),
    recentPublishes: z.array(
      z.object({
        releaseId: releaseIdSchema,
        kind: releaseKindSchema,
        versionLabel: z.string(),
        publishedAt: z.string().datetime(),
      }),
    ),
  })
  .strict();
export type AdminStudioHomeSummary = z.infer<typeof adminStudioHomeSummarySchema>;

// ── Template list with pagination ──────────────────────────────────────────

export const adminContentTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: contentLifecycleStatusSchema.optional(),
  familyId: z.string().max(64).optional(),
  search: z.string().max(120).optional(),
});
export type AdminContentTemplateListQuery = z.infer<typeof adminContentTemplateListQuerySchema>;

export const adminContentTemplateListItemSchema = z
  .object({
    templateId: releaseIdSchema,
    slug: z.string(),
    internalTitle: z.string(),
    familyId: z.string(),
    categoryId: z.string(),
    status: contentLifecycleStatusSchema,
    latestVersion: z.number().int().positive().nullable(),
    publishedReleaseId: releaseIdSchema.nullable(),
    engineId: z.string().nullable(),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
    updatedAt: z.string().datetime(),
    latestApprovedVersionId: releaseIdSchema.nullable(),
  })
  .strict();

export const adminContentTemplateListResponseSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    items: z.array(adminContentTemplateListItemSchema),
  })
  .strict();
export type AdminContentTemplateListResponse = z.infer<typeof adminContentTemplateListResponseSchema>;

// ── Template detail (template + versions) ──────────────────────────────────

export const adminContentTemplateDetailSchema = z
  .object({
    templateId: releaseIdSchema,
    slug: z.string(),
    internalTitle: z.string(),
    familyId: z.string(),
    categoryId: z.string(),
    status: contentLifecycleStatusSchema,
    /** Live catalog pause override for the latest definition (survives refresh). */
    catalogPaused: z.boolean(),
    pauseReason: z.string().nullable(),
    /**
     * True when any version of this template is pinned in the current
     * challenge_catalog release (required for eligibleModes to affect live play).
     */
    inLiveCatalog: z.boolean(),
    /**
     * Effective modes used by the live resolver (override ?? pinned definition).
     */
    liveEligibleModes: z.array(matchModeEligibilitySchema).nullable(),
    /**
     * Explicit override array from content_catalog_entry_overrides.eligible_modes.
     * Null means the live resolver falls back to the pinned definition.
     */
    liveEligibleModesOverride: z.array(matchModeEligibilitySchema).nullable(),
    versions: z.array(adminContentTemplateVersionSchema),
  })
  .strict();
export type AdminContentTemplateDetail = z.infer<typeof adminContentTemplateDetailSchema>;

export const adminContentLiveEligibilityRequestSchema = z
  .object({
    definitionId: z.string().min(1).max(128),
    eligibleModes: z.array(matchModeEligibilitySchema).min(1),
    reason: z.string().min(3).max(500),
  })
  .strict();
export type AdminContentLiveEligibilityRequest = z.infer<
  typeof adminContentLiveEligibilityRequestSchema
>;

export const adminContentLiveEligibilityResponseSchema = z
  .object({
    definitionId: z.string().min(1).max(128),
    eligibleModes: z.array(matchModeEligibilitySchema).min(1),
  })
  .strict();
export type AdminContentLiveEligibilityResponse = z.infer<
  typeof adminContentLiveEligibilityResponseSchema
>;

// ── Reject ─────────────────────────────────────────────────────────────────

export const adminContentRejectRequestSchema = z
  .object({
    templateVersionId: releaseIdSchema,
    notes: z.string().max(2000).optional(),
  })
  .strict();

// ── Retire ─────────────────────────────────────────────────────────────────

export const adminContentRetireRequestSchema = z
  .object({
    templateId: releaseIdSchema.optional(),
    templateVersionId: releaseIdSchema.optional(),
  })
  .strict()
  .refine(
    (v) => v.templateId != null || v.templateVersionId != null,
    { message: 'templateId or templateVersionId required' },
  );

// ── Update draft (in-place edit for status=draft) ──────────────────────────

export const adminContentUpdateDraftRequestSchema = z
  .object({
    templateVersionId: releaseIdSchema,
    definition: challengeDefinitionSchema,
  })
  .strict();

// ── Localization upsert / publish ──────────────────────────────────────────

export const adminLocalizationUpsertRequestSchema = z
  .object({
    versionLabel: z.string().min(1).max(64),
    locales: z.array(z.enum(['ar', 'en'])).min(1),
    entries: z.record(z.record(z.string().min(1).max(2000))),
    changelog: z.string().max(4000).optional(),
    immediate: z.boolean().default(true),
  })
  .strict();

// ── Power config upsert / publish ──────────────────────────────────────────

export const adminPowerConfigUpsertRequestSchema = powerConfigurationReleasePayloadSchema
  .omit({ releaseId: true })
  .extend({ immediate: z.boolean().default(true) });

// ── Game mode rules upsert / publish ───────────────────────────────────────

export const adminGameModeRulesUpsertRequestSchema = gameModeRuleReleasePayloadSchema
  .omit({ releaseId: true })
  .extend({ immediate: z.boolean().default(true) });

// ── Daily goals upsert / publish ───────────────────────────────────────────

export const adminDailyGoalsUpsertRequestSchema = dailyGoalsReleasePayloadSchema
  .omit({ releaseId: true })
  .extend({ immediate: z.boolean().default(true) });

// ── Catalog compose ────────────────────────────────────────────────────────

export const adminCatalogComposeRequestSchema = z
  .object({
    versionLabel: z.string().min(1).max(64),
    changelog: z.string().max(4000).optional(),
    immediate: z.boolean().default(true),
    scheduleAt: z.string().datetime().optional(),
    entries: z.array(catalogReleaseEntrySchema).min(1),
  })
  .strict();

// ── Catalog proof ──────────────────────────────────────────────────────────

export const adminCatalogProofReportSchema = z
  .object({
    missingArKeys: z.array(z.string()),
    schemaOnlyEngines: z.array(z.string()),
    emptyPlaylist: z.boolean(),
    valid: z.boolean(),
  })
  .strict();
export type AdminCatalogProofReport = z.infer<typeof adminCatalogProofReportSchema>;

// ── Analytics ──────────────────────────────────────────────────────────────

export const adminChallengeAnalyticsQuerySchema = z.object({
  engineId: z.string().max(128).optional(),
  definitionId: z.string().max(128).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminChallengeAnalyticsQuery = z.infer<typeof adminChallengeAnalyticsQuerySchema>;

export const adminChallengeAnalyticsResponseSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        definitionId: z.string(),
        engineId: z.string(),
        totalAttempts: z.number().int().nonnegative(),
        successCount: z.number().int().nonnegative(),
        failureCount: z.number().int().nonnegative(),
        timeoutCount: z.number().int().nonnegative(),
        avgMeasureMs: z.number().nonnegative().nullable(),
      }),
    ),
  })
  .strict();
export type AdminChallengeAnalyticsResponse = z.infer<typeof adminChallengeAnalyticsResponseSchema>;

// ── Content diff ───────────────────────────────────────────────────────────

export const adminContentDiffResponseSchema = z
  .object({
    versionA: z.number().int().positive(),
    versionB: z.number().int().positive(),
    changes: z.array(
      z.object({
        path: z.string(),
        before: z.unknown().optional(),
        after: z.unknown().optional(),
      }),
    ),
  })
  .strict();
export type AdminContentDiffResponse = z.infer<typeof adminContentDiffResponseSchema>;

// ── Content pack assets (admin) ────────────────────────────────────────────

export const contentPackAssetMetaSchema = z
  .object({
    assetId: z.string().min(1).max(128),
    relativePath: z.string().min(1).max(512),
    contentType: z.string().min(1).max(128),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().min(1).max(128),
  })
  .strict();
export type ContentPackAssetMetaDto = z.infer<typeof contentPackAssetMetaSchema>;

export const adminContentPackAssetListResponseSchema = z
  .object({
    packId: z.string().min(1),
    packVersion: z.number().int().nonnegative(),
    assets: z.array(contentPackAssetMetaSchema),
  })
  .strict();
export type AdminContentPackAssetListResponse = z.infer<
  typeof adminContentPackAssetListResponseSchema
>;

export const adminContentPackRegisterAssetResponseSchema = z
  .object({
    packVersion: z.number().int().positive(),
    asset: contentPackAssetMetaSchema,
  })
  .strict();
export type AdminContentPackRegisterAssetResponse = z.infer<
  typeof adminContentPackRegisterAssetResponseSchema
>;
