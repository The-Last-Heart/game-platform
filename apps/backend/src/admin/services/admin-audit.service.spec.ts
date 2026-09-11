import { AdminAuditService } from '../services/admin-audit.service';

describe('AdminAuditService redaction', () => {
  const audit = new AdminAuditService({} as never);

  it('redacts sensitive keys recursively', () => {
    const redacted = audit.redactMetadata({
      email: 'admin@example.com',
      password: 'super-secret',
      nested: {
        sessionToken: 'opaque-token',
        role: 'viewer',
      },
      resumeTokenHash: 'abc',
      databaseUrl: 'postgres://user:pass@localhost/db',
      serverConfig: { expected: 1 },
      answer: { choice: 'a' },
      signalToken: 'sig',
    });

    expect(redacted).toEqual({
      email: 'admin@example.com',
      password: '[REDACTED]',
      nested: {
        sessionToken: '[REDACTED]',
        role: 'viewer',
      },
      resumeTokenHash: '[REDACTED]',
      databaseUrl: '[REDACTED]',
      serverConfig: '[REDACTED]',
      answer: '[REDACTED]',
      signalToken: '[REDACTED]',
    });
  });
});
