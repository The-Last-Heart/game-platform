import { z } from 'zod';
import { serializeBootstrapError } from './logging';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3001',
    LOG_LEVEL: 'error',
    DATABASE_URL:
      'postgres://lh_local:lh_local_dev_only@127.0.0.1:5432/the_last_heart',
    REDIS_URL: 'redis://127.0.0.1:6379',
    HEALTH_CHECK_DEPENDENCIES: 'false',
  };

  it('accepts valid configuration', () => {
    const config = validateEnv(base);
    expect(config.PORT).toBe(3001);
    expect(config.HEALTH_CHECK_DEPENDENCIES).toBe(false);
  });

  it('accepts postgresql:// and rediss:// with credentials and query', () => {
    const config = validateEnv({
      ...base,
      DATABASE_URL:
        'postgresql://lh_local:lh_local_dev_only@127.0.0.1:5432/the_last_heart?sslmode=disable',
      REDIS_URL: 'rediss://:token@127.0.0.1:6379/0',
      HEALTH_CHECK_DEPENDENCIES: 'true',
    });
    expect(config.DATABASE_URL.startsWith('postgresql:')).toBe(true);
    expect(config.REDIS_URL.startsWith('rediss:')).toBe(true);
  });

  it('accepts IPv6 hosts', () => {
    const config = validateEnv({
      ...base,
      DATABASE_URL: 'postgres://lh_local:secret@[::1]:5432/the_last_heart',
      REDIS_URL: 'redis://[::1]:6379/0',
    });
    expect(config.DATABASE_URL).toContain('[::1]');
    expect(config.REDIS_URL).toContain('[::1]');
  });

  it('accepts hostname-based URLs', () => {
    const config = validateEnv({
      ...base,
      DATABASE_URL: 'postgres://user:pass@db.example.com:5432/app',
      REDIS_URL: 'redis://cache.example.com:6379',
    });
    expect(config.DATABASE_URL).toContain('db.example.com');
  });

  it('rejects port 0', () => {
    expect(() => validateEnv({ ...base, PORT: '0' })).toThrow(
      /Invalid environment configuration:.*PORT/,
    );
  });

  it('rejects port 70000', () => {
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(
      /Invalid environment configuration:.*PORT/,
    );
  });

  it('rejects non-integer port', () => {
    expect(() => validateEnv({ ...base, PORT: '3.5' })).toThrow(
      /Invalid environment configuration:.*PORT/,
    );
  });

  it('rejects opaque postgres:foo', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'postgres:foo' }),
    ).toThrow(/Invalid environment configuration:.*DATABASE_URL/);
  });

  it('rejects opaque postgresql:foo', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'postgresql:foo' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects postgres:///db without hostname', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'postgres:///db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects DATABASE_URL with leading/trailing whitespace', () => {
    expect(() =>
      validateEnv({
        ...base,
        DATABASE_URL: ' postgres://user:password@localhost/db ',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects opaque redis:foo', () => {
    expect(() => validateEnv({ ...base, REDIS_URL: 'redis:foo' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('rejects redis:///0 without hostname', () => {
    expect(() => validateEnv({ ...base, REDIS_URL: 'redis:///0' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('rejects malformed postgres-looking DATABASE_URL without echoing secrets', () => {
    const bad = 'postgres-not-a-url';
    expect(() => validateEnv({ ...base, DATABASE_URL: bad })).toThrow(
      /Invalid environment configuration:.*DATABASE_URL/,
    );
    try {
      validateEnv({ ...base, DATABASE_URL: bad });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).not.toContain(bad);
      expect(message).not.toContain('lh_local_dev_only');
    }
  });

  it('rejects wrong database protocol', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects malformed redis-looking REDIS_URL', () => {
    expect(() =>
      validateEnv({ ...base, REDIS_URL: 'redis-not-a-url' }),
    ).toThrow(/REDIS_URL/);
  });

  it('rejects wrong Redis protocol', () => {
    expect(() =>
      validateEnv({ ...base, REDIS_URL: 'http://127.0.0.1:6379' }),
    ).toThrow(/REDIS_URL/);
  });

  it('rejects invalid boolean through Zod validation', () => {
    expect(() =>
      validateEnv({ ...base, HEALTH_CHECK_DEPENDENCIES: 'maybe' }),
    ).toThrow(/Invalid environment configuration:.*HEALTH_CHECK_DEPENDENCIES/);
  });

  it('rejects production with dependency checks disabled', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        HEALTH_CHECK_DEPENDENCIES: 'false',
      }),
    ).toThrow(/HEALTH_CHECK_DEPENDENCIES/);
  });

  it('does not echo secret values from invalid DATABASE_URL in thrown messages', () => {
    const secretToken = 'lh001d-db-secret-TOKEN-9f3a';
    const secretUrl = `postgres://lh_local:${secretToken}@127.0.0.1:5432/the_last_heart`;
    // Invalid: whitespace padding — value contains the secret but must fail.
    const invalid = ` ${secretUrl} `;
    try {
      validateEnv({ ...base, DATABASE_URL: invalid });
      throw new Error('expected throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).toMatch(/^Invalid environment configuration:/);
      expect(message).not.toContain(secretToken);
      expect(message).not.toContain(secretUrl);
      expect(message).not.toContain(invalid);
      const fatal = serializeBootstrapError(error);
      const payload = JSON.stringify(fatal);
      expect(payload).not.toContain(secretToken);
      expect(payload).not.toContain(secretUrl);
      expect(payload).not.toContain(invalid.trim());
    }
  });

  it('does not echo secret values from invalid REDIS_URL in thrown messages', () => {
    const secretToken = 'lh001d-redis-secret-TOKEN-4c2b';
    const secretUrl = `redis://: ${secretToken}@127.0.0.1:6379`;
    // Invalid: space inside authority / not a usable hierarchical URL after trim rules.
    // Use whitespace-padded otherwise-looking URL that still embeds the token.
    const invalid = ` ${`redis://:${secretToken}@127.0.0.1:6379`} `;
    try {
      validateEnv({ ...base, REDIS_URL: invalid });
      throw new Error('expected throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).toMatch(/^Invalid environment configuration:/);
      expect(message).not.toContain(secretToken);
      expect(message).not.toContain(secretUrl);
      const fatal = serializeBootstrapError(error);
      expect(JSON.stringify(fatal)).not.toContain(secretToken);
    }
  });
});

// Keep zod import referenced for tooling that scans test files.
void z;
