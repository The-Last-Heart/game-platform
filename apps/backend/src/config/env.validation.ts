import { z } from 'zod';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (FALSE_VALUES.has(normalized)) {
      return false;
    }
    return value;
  }
  return value;
}, z.boolean());

const DATABASE_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);

/**
 * Hierarchical service URL with non-empty hostname.
 * Rejects leading/trailing whitespace (no silent trim).
 * Never throws — returns false for invalid values (Zod-safe).
 */
export function isHierarchicalServiceUrl(
  value: unknown,
  allowedProtocols: Set<string>,
): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }
  // Reject whitespace padding instead of trimming.
  if (value.trim() !== value) {
    return false;
  }
  if (!value.includes('://')) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!allowedProtocols.has(url.protocol)) {
    return false;
  }

  // WHATWG hostname is empty for opaque paths like postgres:foo and postgres:///db.
  if (!url.hostname || url.hostname.trim() === '') {
    return false;
  }

  if (url.port !== '') {
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return false;
    }
  }

  return true;
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce
      .number({ invalid_type_error: 'PORT must be an integer' })
      .int('PORT must be an integer')
      .min(1, 'PORT must be between 1 and 65535')
      .max(65535, 'PORT must be between 1 and 65535')
      .default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
      .default('log'),
    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL is required' })
      .min(1, 'DATABASE_URL is required')
      .refine((value) => isHierarchicalServiceUrl(value, DATABASE_PROTOCOLS), {
        message:
          'DATABASE_URL must be a hierarchical postgres/postgresql URL with a hostname',
      }),
    REDIS_URL: z
      .string({ required_error: 'REDIS_URL is required' })
      .min(1, 'REDIS_URL is required')
      .refine((value) => isHierarchicalServiceUrl(value, REDIS_PROTOCOLS), {
        message:
          'REDIS_URL must be a hierarchical redis/rediss URL with a hostname',
      }),
    HEALTH_CHECK_DEPENDENCIES: booleanFromEnv.default(true),
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === 'production' &&
      data.HEALTH_CHECK_DEPENDENCIES === false
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['HEALTH_CHECK_DEPENDENCIES'],
        message:
          'HEALTH_CHECK_DEPENDENCIES cannot be disabled when NODE_ENV is production',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const field = issue.path.join('.') || 'env';
        // Never echo submitted secret values — messages are field-scoped only.
        return `${field}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
