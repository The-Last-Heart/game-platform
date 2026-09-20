import { playerClaimPayloadSchema } from '@thelastheart/contracts';

/**
 * Mirrors LeaderboardController claim validation classification so we can
 * assert prohibited vs invalid without spinning Nest.
 */
function classifyClaimIssues(body: unknown): {
  code: string;
  key: string;
} {
  const parsed = playerClaimPayloadSchema.safeParse(body);
  if (parsed.success) {
    return { code: 'OK', key: 'ok' };
  }
  const messages = parsed.error.issues.map((issue) => issue.message);
  if (messages.some((m) => m.includes('prohibited content'))) {
    return {
      code: 'DISPLAY_NAME_PROHIBITED',
      key: 'errors.identity.name_prohibited',
    };
  }
  if (parsed.error.issues.some((issue) => issue.path.includes('displayName'))) {
    return {
      code: 'DISPLAY_NAME_INVALID',
      key: 'errors.identity.name_invalid',
    };
  }
  return {
    code: 'INVALID_PAYLOAD',
    key: 'errors.protocol.invalid_payload',
  };
}

describe('players/claim display-name validation mapping', () => {
  const base = {
    playerId: 'install-abcdef12',
    avatarColor: '#FF3045',
    countryCode: 'JO',
  };

  it('maps prohibited Arabic names to name_prohibited', () => {
    expect(
      classifyClaimIssues({ ...base, displayName: 'وجدي شرموط' }),
    ).toEqual({
      code: 'DISPLAY_NAME_PROHIBITED',
      key: 'errors.identity.name_prohibited',
    });
  });

  it('maps invalid format to name_invalid', () => {
    expect(classifyClaimIssues({ ...base, displayName: 'A1' })).toEqual({
      code: 'DISPLAY_NAME_INVALID',
      key: 'errors.identity.name_invalid',
    });
  });

  it('accepts a clean name', () => {
    expect(classifyClaimIssues({ ...base, displayName: 'وجدي' })).toEqual({
      code: 'OK',
      key: 'ok',
    });
  });
});
