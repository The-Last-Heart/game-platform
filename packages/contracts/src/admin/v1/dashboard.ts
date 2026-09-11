import { z } from 'zod';

/**
 * Safe operational aggregates only — never resume tokens, answers, or serverConfig.
 */
export const adminMatchPhaseCountsSchema = z
  .object({
    lobby: z.number().int().nonnegative(),
    ready_countdown: z.number().int().nonnegative(),
    challenge_intro: z.number().int().nonnegative(),
    challenge_active: z.number().int().nonnegative(),
    round_result: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    halted: z.number().int().nonnegative(),
  })
  .strict();

export const adminPresenceCountsSchema = z
  .object({
    connected: z.number().int().nonnegative(),
    disconnected: z.number().int().nonnegative(),
    spectator: z.number().int().nonnegative(),
  })
  .strict();

export const adminOperationalAggregatesSchema = z
  .object({
    matchCount: z.number().int().nonnegative(),
    matchesByPhase: adminMatchPhaseCountsSchema,
    playersByPresence: adminPresenceCountsSchema,
    lobbyWaitingPlayers: z.number().int().nonnegative(),
  })
  .strict();
export type AdminOperationalAggregates = z.infer<
  typeof adminOperationalAggregatesSchema
>;

export const adminDashboardOverviewSchema = z
  .object({
    generatedAt: z.string().datetime(),
    aggregates: adminOperationalAggregatesSchema,
    adminUsers: z
      .object({
        activeCount: z.number().int().nonnegative(),
        deactivatedCount: z.number().int().nonnegative(),
      })
      .strict(),
    sessions: z
      .object({
        activeCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type AdminDashboardOverview = z.infer<typeof adminDashboardOverviewSchema>;

export const adminDashboardOverviewResponseSchema = adminDashboardOverviewSchema;
