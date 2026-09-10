import {
  MessageTypes,
  ProtocolValidationError,
  REALTIME_SCHEMA_VERSION,
  challengeDurationMsSchema,
  parseClientCommand,
  submitAnswerPayloadSchema,
} from '@thelastheart/contracts';

describe('realtime contracts v1', () => {
  const base = {
    schemaVersion: REALTIME_SCHEMA_VERSION,
    messageId: 'msg-1',
    commandId: 'cmd-1',
  };

  it('accepts a valid join command', () => {
    const command = parseClientCommand({
      ...base,
      type: MessageTypes.MatchJoin,
      payload: { matchId: 'match-1' },
    });
    expect(command.type).toBe(MessageTypes.MatchJoin);
  });

  it('rejects missing envelope fields', () => {
    expect(() => parseClientCommand({ type: MessageTypes.MatchJoin })).toThrow(
      ProtocolValidationError,
    );
  });

  it('rejects unknown schema versions', () => {
    expect(() =>
      parseClientCommand({
        ...base,
        schemaVersion: '999',
        type: MessageTypes.MatchJoin,
        payload: { matchId: 'm' },
      }),
    ).toThrow(ProtocolValidationError);
  });

  it('rejects unknown message types', () => {
    expect(() =>
      parseClientCommand({
        ...base,
        type: 'match.teleport',
        payload: {},
      }),
    ).toThrow(ProtocolValidationError);
  });

  it('rejects invalid challenge durations', () => {
    expect(challengeDurationMsSchema.safeParse(2999).success).toBe(false);
    expect(challengeDurationMsSchema.safeParse(8001).success).toBe(false);
    expect(challengeDurationMsSchema.safeParse(5000).success).toBe(true);
  });

  it('rejects client attempts to provide authoritative result fields', () => {
    expect(
      submitAnswerPayloadSchema.safeParse({
        challengeInstanceId: 'c1',
        answer: { choice: 'a', success: true },
      }).success,
    ).toBe(false);
    expect(
      submitAnswerPayloadSchema.safeParse({
        challengeInstanceId: 'c1',
        answer: { choice: 'a', hearts: 3 },
      }).success,
    ).toBe(false);
  });

  it('rejects malformed payloads without echoing secrets', () => {
    try {
      parseClientCommand({
        ...base,
        type: MessageTypes.MatchResume,
        payload: { matchId: 'm', resumeToken: '' },
      });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolValidationError);
      expect((error as Error).message).not.toContain('resumeToken');
    }
  });

  it('uses translation keys rather than product copy in error objects', () => {
    try {
      parseClientCommand({ schemaVersion: 'nope', type: 'x', messageId: '1' });
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolValidationError);
      const err = error as ProtocolValidationError;
      expect(err.messageKey.startsWith('errors.')).toBe(true);
      expect(err.messageKey.includes(' ')).toBe(false);
    }
  });
});
