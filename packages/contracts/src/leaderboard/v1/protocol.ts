import { z } from 'zod';
import { PLAYER_COUNTRY_CODES } from '../../identity/v1/countries';

const avatarColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'avatarColor must be a hex color');

export const leaderboardEntrySchema = z
  .object({
    rank: z.number().int().positive(),
    displayName: z.string().min(2).max(24),
    countryCode: z.enum(PLAYER_COUNTRY_CODES),
    avatarColor: avatarColorSchema,
    totalPoints: z.number().int().nonnegative(),
  })
  .strict();

export const leaderboardResponseSchema = z
  .object({
    entries: z.array(leaderboardEntrySchema),
  })
  .strict();

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
