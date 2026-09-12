import { z } from 'zod';
import {
  challengeDefinitionSchema,
  contentLifecycleStatusSchema,
  matchReleasePinsSchema,
  releaseIdSchema,
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
    kind: z.enum([
      'challenge_catalog',
      'game_mode_rules',
      'localization',
      'power_configuration',
    ]),
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
