import { z } from 'zod';

/**
 * Safe operational aggregates only — never resume tokens, answers, or serverConfig.
 *
 * Player metrics are separate fields (not mutually exclusive presence buckets):
 * connected/disconnected count by connection presence; spectators by player status.
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

export const adminOperationalAggregatesSchema = z
  .object({
    /** Matches whose phase is not completed or halted. */
    activeMatchCount: z.number().int().nonnegative(),
    matchesByPhase: adminMatchPhaseCountsSchema,
    connectedPlayers: z.number().int().nonnegative(),
    disconnectedPlayers: z.number().int().nonnegative(),
    spectators: z.number().int().nonnegative(),
    waitingLobbyCount: z.number().int().nonnegative(),
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
