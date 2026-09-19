import { z } from 'zod';
import {
  buildNumberSchema,
  clientPlatformSchema,
  stableSemVerSchema,
} from '../../content/v1/semver';

/**
 * Client-reported installed application metadata.
 * Player identity is never accepted here — derive it from the authenticated session.
 */
export const clientRuntimeMetadataSchema = z
  .object({
    appVersion: stableSemVerSchema,
    buildNumber: buildNumberSchema,
    platform: clientPlatformSchema,
  })
  .strict();
export type ClientRuntimeMetadata = z.infer<typeof clientRuntimeMetadataSchema>;

export const optionalAppVersionField = stableSemVerSchema.optional();
export const optionalBuildNumberField = buildNumberSchema.optional();
export const optionalPlatformField = clientPlatformSchema.optional();

/**
 * Additive optional runtime metadata on identity-bearing commands during Stage 1.
 * When APP_VERSION_STRICT_ENFORCEMENT is enabled, missing metadata is rejected.
 */
export const optionalClientRuntimeMetadataSchema = z
  .object({
    appVersion: optionalAppVersionField,
    buildNumber: optionalBuildNumberField,
    platform: optionalPlatformField,
  })
  .strict()
  .superRefine((value, ctx) => {
    const present =
      value.appVersion != null ||
      value.buildNumber != null ||
      value.platform != null;
    if (!present) {
      return;
    }
    if (
      value.appVersion == null ||
      value.buildNumber == null ||
      value.platform == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'appVersion, buildNumber, and platform must be provided together',
      });
    }
  });

export const mobileVersionPolicyQuerySchema = z
  .object({
    platform: clientPlatformSchema,
    appVersion: stableSemVerSchema,
  })
  .strict();
export type MobileVersionPolicyQuery = z.infer<
  typeof mobileVersionPolicyQuerySchema
>;

export const mobileVersionPolicyResponseSchema = z
  .object({
    minimumSupportedVersion: stableSemVerSchema,
    updateRequired: z.boolean(),
    storeUrl: z.string().url().max(2048),
    policyRevision: z.number().int().nonnegative(),
  })
  .strict();
export type MobileVersionPolicyResponse = z.infer<
  typeof mobileVersionPolicyResponseSchema
>;
