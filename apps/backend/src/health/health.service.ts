import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Client } from 'pg';
import type { AppConfig } from '../config/env.validation';

export type DependencyCheck = {
  name: 'postgres' | 'redis';
  status: 'up' | 'down' | 'skipped';
  latencyMs?: number;
  error?: string;
};

export type LivenessResponse = {
  status: 'ok';
  service: 'backend';
  timestamp: string;
};

export type ReadinessResponse = {
  status: 'ok' | 'degraded';
  service: 'backend';
  timestamp: string;
  checks: DependencyCheck[];
};

const DEPENDENCY_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const checkDependencies = this.config.get('HEALTH_CHECK_DEPENDENCIES', {
      infer: true,
    });

    if (!checkDependencies) {
      return {
        status: 'ok',
        service: 'backend',
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'postgres', status: 'skipped' },
          { name: 'redis', status: 'skipped' },
        ],
      };
    }

    const checks = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    const failed = checks.some((check) => check.status === 'down');
    return {
      status: failed ? 'degraded' : 'ok',
      service: 'backend',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    const started = Date.now();
    const databaseUrl = this.config.get('DATABASE_URL', { infer: true });
    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: DEPENDENCY_TIMEOUT_MS,
      query_timeout: DEPENDENCY_TIMEOUT_MS,
      statement_timeout: DEPENDENCY_TIMEOUT_MS,
    });

    try {
      await this.withTimeout(client.connect(), DEPENDENCY_TIMEOUT_MS);
      await this.withTimeout(client.query('SELECT 1'), DEPENDENCY_TIMEOUT_MS);
      return {
        name: 'postgres',
        status: 'up',
        latencyMs: Date.now() - started,
      };
    } catch (error: unknown) {
      this.logger.warn('PostgreSQL readiness check failed');
      return {
        name: 'postgres',
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.name : 'UnknownError',
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const started = Date.now();
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: DEPENDENCY_TIMEOUT_MS,
      commandTimeout: DEPENDENCY_TIMEOUT_MS,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {
      // Swallow connection errors during readiness probes; status is returned below.
    });

    try {
      await this.withTimeout(redis.connect(), DEPENDENCY_TIMEOUT_MS);
      const pong = await this.withTimeout(redis.ping(), DEPENDENCY_TIMEOUT_MS);
      if (pong !== 'PONG') {
        throw new Error('UnexpectedRedisPing');
      }
      return {
        name: 'redis',
        status: 'up',
        latencyMs: Date.now() - started,
      };
    } catch (error: unknown) {
      this.logger.warn('Redis readiness check failed');
      return {
        name: 'redis',
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.name : 'UnknownError',
      };
    } finally {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('DependencyTimeout'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
