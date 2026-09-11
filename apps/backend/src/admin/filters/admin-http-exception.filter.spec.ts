import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AdminHttpExceptionFilter } from './admin-http-exception.filter';

function mockHost(path: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ path }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AdminHttpExceptionFilter', () => {
  const filter = new AdminHttpExceptionFilter();

  it('passes through existing admin error envelopes', () => {
    const { host, status, json } = mockHost('/api/admin/v1/administrators');
    filter.catch(
      new NotFoundException({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Administrator not found' },
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Administrator not found' },
    });
  });

  it('maps Nest UUID pipe failures to VALIDATION_ERROR envelope', () => {
    const { host, status, json } = mockHost(
      '/api/admin/v1/administrators/not-a-uuid',
    );
    filter.catch(
      new BadRequestException('Validation failed (uuid is expected)'),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        }),
      }),
    );
  });

  it('does not rewrite non-admin routes to admin envelopes', () => {
    const { host, status, json } = mockHost('/health/live');
    filter.catch(new BadRequestException('plain'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'plain',
      }),
    );
  });
});
