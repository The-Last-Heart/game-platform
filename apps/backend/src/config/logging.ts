import {
  ConsoleLogger,
  type LogLevel,
  type LoggerService,
} from '@nestjs/common';
import type { AppConfig } from './env.validation';

export type NestLogLevelName = AppConfig['LOG_LEVEL'];

/**
 * Maps application LOG_LEVEL to Nest enabled levels (inclusive threshold).
 */
export function nestLogLevelsFor(level: NestLogLevelName): LogLevel[] {
  const order: LogLevel[] = [
    'verbose',
    'debug',
    'log',
    'warn',
    'error',
    'fatal',
  ];
  const index = order.indexOf(level);
  if (index < 0) {
    return ['fatal', 'error', 'warn', 'log'];
  }
  // Nest enables listed levels; include this level and more severe ones.
  return order.slice(index);
}

export function createStructuredLogger(
  level: NestLogLevelName,
  context?: string,
): ConsoleLogger {
  const logger = new ConsoleLogger(context ?? 'Application', {
    json: true,
    logLevels: nestLogLevelsFor(level),
  });
  return logger;
}

export type SafeBootstrapError = {
  timestamp: string;
  level: 'fatal';
  context: 'Bootstrap';
  event: 'bootstrap_fatal';
  category: string;
  message: string;
  fields?: string[];
};

/**
 * Serializes startup failures without echoing secret values, stacks,
 * environment objects, or connection URLs.
 */
export function serializeBootstrapError(error: unknown): SafeBootstrapError {
  const timestamp = new Date().toISOString();
  if (error instanceof Error) {
    const rawMessage = error.message;
    const fieldMatches = [...rawMessage.matchAll(/\b([A-Z][A-Z0-9_]+):/g)].map(
      (match) => match[1]!,
    );
    const uniqueFields = [...new Set(fieldMatches)];

    const isEnvFailure = rawMessage.startsWith(
      'Invalid environment configuration:',
    );
    // Env failures are field-scoped by validateEnv and safe to retain.
    // All other failures collapse to a generic message (no stacks/URLs).
    const message = isEnvFailure ? rawMessage : 'Application failed to start';

    return {
      timestamp,
      level: 'fatal',
      context: 'Bootstrap',
      event: 'bootstrap_fatal',
      category: error.name || 'Error',
      message,
      ...(uniqueFields.length > 0 ? { fields: uniqueFields } : {}),
    };
  }
  return {
    timestamp,
    level: 'fatal',
    context: 'Bootstrap',
    event: 'bootstrap_fatal',
    category: 'UnknownError',
    message: 'Application failed to start',
  };
}

export function writeStructuredFatal(error: unknown): void {
  const payload = serializeBootstrapError(error);
  console.error(JSON.stringify(payload));
}

export type StructuredLogger = LoggerService;
