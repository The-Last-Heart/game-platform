import { z } from 'zod';
import { adminOperationalAggregatesSchema } from './dashboard';

export const adminDependencyCheckSchema = z
  .object({
    name: z.enum(['postgres', 'redis']),
    status: z.enum(['up', 'down', 'skipped']),
    latencyMs: z.number().nonnegative().optional(),
  })
  .strict();

export const adminSystemStatusSchema = z
  .object({
    generatedAt: z.string().datetime(),
    service: z.literal('backend'),
    health: z
      .object({
        live: z.literal('ok'),
        ready: z.enum(['ok', 'degraded']),
        checks: z.array(adminDependencyCheckSchema),
      })
      .strict(),
    sessions: z
      .object({
        activeCount: z.number().int().nonnegative(),
      })
      .strict(),
    aggregates: adminOperationalAggregatesSchema,
  })
  .strict();
export type AdminSystemStatus = z.infer<typeof adminSystemStatusSchema>;

export const adminSystemStatusResponseSchema = adminSystemStatusSchema;
