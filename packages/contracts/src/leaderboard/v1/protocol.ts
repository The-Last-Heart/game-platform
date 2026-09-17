import { z } from 'zod';
import { PLAYER_COUNTRY_CODES } from '../../identity/v1/countries';
import {
  isProhibitedDisplayName,
  isValidDisplayNameFormat,
  normalizeDisplayNameFormat,
} from '../../identity/v1/display-name-moderation';

const avatarColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'avatarColor must be a hex color');

const displayNameSchema = z
  .string()
  .transform((value) => normalizeDisplayNameFormat(value))
  .refine((value) => isValidDisplayNameFormat(value), {
    message: 'display name must be one or two letter-only parts',
  })
  .refine((value) => !isProhibitedDisplayName(value), {
    message: 'display name contains prohibited content',
  });

export const leaderboardEntrySchema = z
  .object({
    rank: z.number().int().positive(),
    displayName: z.string().min(2).max(24),
    countryCode: z.enum(PLAYER_COUNTRY_CODES),
    avatarColor: avatarColorSchema,
    totalPoints: z.number().int().nonnegative(),
    challengesPlayed: z.number().int().nonnegative(),
    playlistsCompleted: z.number().int().nonnegative(),
  })
  .strict();

export const leaderboardResponseSchema = z
  .object({
    entries: z.array(leaderboardEntrySchema),
  })
  .strict();

/** Claim / register install profile for leaderboard uniqueness. */
export const playerClaimPayloadSchema = z
  .object({
    playerId: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/, 'playerId contains unsupported characters'),
    displayName: displayNameSchema,
    avatarColor: avatarColorSchema,
    countryCode: z.enum(PLAYER_COUNTRY_CODES),
  })
  .strict();

export const playerClaimResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
export type PlayerClaimPayload = z.infer<typeof playerClaimPayloadSchema>;
export type PlayerClaimResponse = z.infer<typeof playerClaimResponseSchema>;
