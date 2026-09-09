import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'HEALTH_CHECK_DEPENDENCIES') {
        return false;
      }
      if (key === 'DATABASE_URL') {
        return 'postgres://lh_local:lh_local_dev_only@127.0.0.1:5432/the_last_heart';
      }
      if (key === 'REDIS_URL') {
        return 'redis://127.0.0.1:6379';
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  it('reports liveness without touching dependencies', () => {
    const service = new HealthService(config as never);
    const result = service.getLiveness();
    expect(result).toMatchObject({
      status: 'ok',
      service: 'backend',
    });
  });

  it('skips dependency checks when configured', async () => {
    const service = new HealthService(config as never);
    const result = await service.getReadiness();
    expect(result.status).toBe('ok');
    expect(result.checks.every((check) => check.status === 'skipped')).toBe(
      true,
    );
  });
});
