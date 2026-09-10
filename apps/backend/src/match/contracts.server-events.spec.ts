import {
  MessageTypes,
  REALTIME_SCHEMA_VERSION,
  matchSnapshotPayloadSchema,
  safeParseServerEvent,
  serverEventSchema,
} from '@thelastheart/contracts';

describe('serverEventSchema contracts', () => {
  const base = {
    schemaVersion: REALTIME_SCHEMA_VERSION,
    messageId: 'msg-1',
    matchId: 'match-1',
    serverTimestampMs: 1_000,
  };

  const challenge = {
    challengeInstanceId: 'ch-1',
    definitionId: 'dev.fixture',
    definitionVersion: 1,
    engineId: 'dev.deterministic_choice',
    promptKey: 'dev.challenge.prompt',
    choiceKeys: ['dev.challenge.choice.a'],
    clientConfig: { fixtureMode: true },
    serverNowMs: 1_000,
    startsAtMs: 1_000,
    deadlineAtMs: 4_000,
    durationMs: 3000,
  };

  it('accepts every existing server event type', () => {
    const events = [
      {
        ...base,
        type: MessageTypes.SessionAccepted,
        payload: { matchId: 'match-1', playerId: 'p1', resumeToken: 'tok' },
      },
      {
        ...base,
        type: MessageTypes.MatchSnapshot,
        serverSequence: 0,
        payload: {
          matchId: 'match-1',
          status: 'waiting',
          revision: 1,
          sequence: 0,
          players: [],
          winnerId: null,
          currentChallenge: null,
        },
      },
      {
        ...base,
        type: MessageTypes.PlayerPresence,
        serverSequence: 1,
        payload: { playerId: 'p1', presence: 'connected', joined: true },
      },
      {
        ...base,
        type: MessageTypes.ChallengeStarted,
        serverSequence: 2,
        payload: challenge,
      },
      {
        ...base,
        type: MessageTypes.ChallengeSubmissionAck,
        payload: { accepted: true, duplicate: false },
      },
      {
        ...base,
        type: MessageTypes.ChallengeResolved,
        serverSequence: 3,
        payload: {
          challengeInstanceId: 'ch-1',
          resolutions: [
            {
              playerId: 'p1',
              outcome: 'success',
              heartsDelta: 0,
              energyDelta: 1,
              heartsAfter: 3,
              energyAfter: 1,
              statusAfter: 'active',
            },
          ],
        },
      },
      {
        ...base,
        type: MessageTypes.MatchStateChanged,
        serverSequence: 4,
        payload: {
          status: 'resolving',
          reasonKey: 'errors.match.unsafe_zero_survivors',
        },
      },
      {
        ...base,
        type: MessageTypes.MatchFinished,
        serverSequence: 5,
        payload: { winnerId: 'p1' },
      },
      {
        ...base,
        type: MessageTypes.ProtocolError,
        payload: {
          code: 'UNAUTHORIZED',
          messageKey: 'errors.protocol.unauthorized',
        },
      },
    ];

    for (const event of events) {
      expect(serverEventSchema.safeParse(event).success).toBe(true);
      expect(safeParseServerEvent(event).success).toBe(true);
    }
  });

  it('accepts snapshots with sequence and empty choiceKeys', () => {
    const snapshot = {
      matchId: 'match-1',
      status: 'challenge_active',
      revision: 2,
      sequence: 7,
      players: [],
      winnerId: null,
      currentChallenge: {
        ...challenge,
        choiceKeys: [],
      },
    };
    expect(matchSnapshotPayloadSchema.safeParse(snapshot).success).toBe(true);
  });

  it('rejects public payloads that leak expectedChoice in clientConfig', () => {
    const bad = {
      ...base,
      type: MessageTypes.ChallengeStarted,
      serverSequence: 2,
      payload: {
        ...challenge,
        clientConfig: { expectedChoice: 'a' },
      },
    };
    expect(serverEventSchema.safeParse(bad).success).toBe(false);
  });
});
