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

const optionalNonEmptyString = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return value;
}, z.string().min(1).optional());

/** True when value is exactly a WHATWG origin (no path/query/auth). */
export function isUrlOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    /** Backend HTTP/WebSocket port. Milestone default is 3000 (admin-web uses 3001). */
    PORT: z.coerce
      .number({ invalid_type_error: 'PORT must be an integer' })
      .int('PORT must be an integer')
      .min(1, 'PORT must be between 1 and 65535')
      .max(65535, 'PORT must be between 1 and 65535')
      .default(3000),
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
    ADMIN_SESSION_TTL_SECONDS: z.coerce
      .number({
        invalid_type_error: 'ADMIN_SESSION_TTL_SECONDS must be an integer',
      })
      .int('ADMIN_SESSION_TTL_SECONDS must be an integer')
      .min(60, 'ADMIN_SESSION_TTL_SECONDS must be at least 60')
      .max(604_800, 'ADMIN_SESSION_TTL_SECONDS must be at most 604800 (7d)')
      .default(43_200),
    ADMIN_LOGIN_MAX_FAILURES: z.coerce
      .number({
        invalid_type_error: 'ADMIN_LOGIN_MAX_FAILURES must be an integer',
      })
      .int('ADMIN_LOGIN_MAX_FAILURES must be an integer')
      .min(1)
      .max(50)
      .default(5),
    ADMIN_LOGIN_THROTTLE_TTL_SECONDS: z.coerce
      .number({
        invalid_type_error:
          'ADMIN_LOGIN_THROTTLE_TTL_SECONDS must be an integer',
      })
      .int('ADMIN_LOGIN_THROTTLE_TTL_SECONDS must be an integer')
      .min(30)
      .max(86_400)
      .default(900),
    ADMIN_CSRF_SECRET: z
      .string()
      .min(16, 'ADMIN_CSRF_SECRET must be at least 16 characters')
      .default('lh-dev-csrf-secret-change-me'),
    ADMIN_ALLOWED_ORIGIN: optionalNonEmptyString,
    COOKIE_SECURE: booleanFromEnv.default(false),
    ADMIN_BOOTSTRAP_EMAIL: optionalNonEmptyString,
    ADMIN_BOOTSTRAP_PASSWORD: optionalNonEmptyString,
    ADMIN_BOOTSTRAP_DISPLAY_NAME: optionalNonEmptyString,
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
    if (
      data.NODE_ENV === 'production' &&
      data.ADMIN_CSRF_SECRET === 'lh-dev-csrf-secret-change-me'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_CSRF_SECRET'],
        message:
          'ADMIN_CSRF_SECRET must be set to a non-default value in production',
      });
    }
    if (data.NODE_ENV === 'production' && data.COOKIE_SECURE !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true when NODE_ENV is production',
      });
    }
    if (data.NODE_ENV === 'production') {
      if (!data.ADMIN_ALLOWED_ORIGIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_ALLOWED_ORIGIN'],
          message:
            'ADMIN_ALLOWED_ORIGIN is required when NODE_ENV is production',
        });
      } else if (!isUrlOrigin(data.ADMIN_ALLOWED_ORIGIN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_ALLOWED_ORIGIN'],
          message:
            'ADMIN_ALLOWED_ORIGIN must be a URL origin (scheme + host[:port], no path)',
        });
      }
    } else if (
      data.ADMIN_ALLOWED_ORIGIN !== undefined &&
      !isUrlOrigin(data.ADMIN_ALLOWED_ORIGIN)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_ALLOWED_ORIGIN'],
        message:
          'ADMIN_ALLOWED_ORIGIN must be a URL origin (scheme + host[:port], no path)',
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
