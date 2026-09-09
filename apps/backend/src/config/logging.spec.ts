import { nestLogLevelsFor, serializeBootstrapError } from './logging';

describe('logging', () => {
  it('maps LOG_LEVEL thresholds inclusively', () => {
    expect(nestLogLevelsFor('fatal')).toEqual(['fatal']);
    expect(nestLogLevelsFor('error')).toEqual(['error', 'fatal']);
    expect(nestLogLevelsFor('warn')).toEqual(['warn', 'error', 'fatal']);
    expect(nestLogLevelsFor('log')).toEqual(['log', 'warn', 'error', 'fatal']);
    expect(nestLogLevelsFor('debug')).toEqual([
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
    expect(nestLogLevelsFor('verbose')).toEqual([
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });

  it('serializes bootstrap errors with stable fatal fields and no secrets', () => {
    const error = new Error(
      'Invalid environment configuration: DATABASE_URL: DATABASE_URL must be a hierarchical postgres/postgresql URL with a hostname',
    );
    const payload = serializeBootstrapError(error);
    expect(payload.event).toBe('bootstrap_fatal');
    expect(payload.level).toBe('fatal');
    expect(payload.context).toBe('Bootstrap');
    expect(payload.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(payload.fields).toContain('DATABASE_URL');
    expect(JSON.stringify(payload)).not.toContain('password');
    expect(payload.message).toMatch(/^Invalid environment configuration:/);
    expect(payload).not.toHaveProperty('stack');
  });

  it('redacts non-env bootstrap failures to a generic message', () => {
    const error = new Error(
      'connect ECONNREFUSED postgres://user:super-secret@127.0.0.1/db',
    );
    const payload = serializeBootstrapError(error);
    expect(payload.message).toBe('Application failed to start');
    expect(JSON.stringify(payload)).not.toContain('super-secret');
    expect(JSON.stringify(payload)).not.toContain('postgres://');
  });
});
