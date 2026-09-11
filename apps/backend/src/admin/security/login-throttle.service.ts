import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../../config/env.validation';

@Injectable()
export class AdminLoginThrottleService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly maxFailures: number;
  private readonly ttlSeconds: number;

  constructor(config: ConfigService<AppConfig, true>) {
    const redisUrl = config.get('REDIS_URL', { infer: true });
    this.maxFailures = config.get('ADMIN_LOGIN_MAX_FAILURES', { infer: true });
    this.ttlSeconds = config.get('ADMIN_LOGIN_THROTTLE_TTL_SECONDS', {
      infer: true,
    });
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    this.redis.on('error', () => {
      // Errors surface via command failures; avoid unhandled event noise.
    });
  }

  private key(emailNormalized: string): string {
    return `admin:login:fail:${emailNormalized}`;
  }

  async isBlocked(emailNormalized: string): Promise<boolean> {
    await this.ensureConnected();
    const raw = await this.redis.get(this.key(emailNormalized));
    const count = raw ? Number(raw) : 0;
    return Number.isFinite(count) && count >= this.maxFailures;
  }

  async recordFailure(emailNormalized: string): Promise<void> {
    await this.ensureConnected();
    const key = this.key(emailNormalized);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.ttlSeconds);
    }
  }

  async clearFailures(emailNormalized: string): Promise<void> {
    await this.ensureConnected();
    await this.redis.del(this.key(emailNormalized));
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
      if (this.redis.status === 'connecting') {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const cleanup = () => {
            this.redis.off('ready', onReady);
            this.redis.off('error', onError);
          };
          this.redis.once('ready', onReady);
          this.redis.once('error', onError);
        });
      }
      return;
    }
    await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.redis.removeAllListeners('error');
      const status = this.redis.status;
      if (status === 'ready') {
        await this.redis.quit();
      } else if (status !== 'end' && status !== 'close') {
        this.redis.disconnect(false);
      }
    } catch {
      try {
        this.redis.disconnect(false);
      } catch {
        // Best-effort close for test teardown / process exit.
      }
    }
  }
}
