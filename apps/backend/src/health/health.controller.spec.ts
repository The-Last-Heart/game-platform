import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              PORT: 3001,
              LOG_LEVEL: 'error',
              DATABASE_URL:
                'postgres://lh_local:lh_local_dev_only@127.0.0.1:5432/the_last_heart',
              REDIS_URL: 'redis://127.0.0.1:6379',
              HEALTH_CHECK_DEPENDENCIES: false,
            }),
          ],
        }),
      ],
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get(HealthController);
    service = module.get(HealthService);
  });

  it('returns liveness ok', () => {
    const result = controller.live();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('backend');
    expect(result.timestamp).toBeTruthy();
  });

  it('returns readiness ok when dependency checks are skipped', async () => {
    const result = await controller.ready();
    expect(result.status).toBe('ok');
    expect(result.checks).toEqual([
      { name: 'postgres', status: 'skipped' },
      { name: 'redis', status: 'skipped' },
    ]);
  });

  it('throws ServiceUnavailableException when readiness is degraded', async () => {
    jest.spyOn(service, 'getReadiness').mockResolvedValue({
      status: 'degraded',
      service: 'backend',
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'postgres', status: 'down', error: 'Error' },
        { name: 'redis', status: 'up', latencyMs: 1 },
      ],
    });

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
