import {
  MessageTypes,
  REALTIME_SCHEMA_VERSION,
  matchSnapshotPayloadSchema,
  safeParseServerEvent,
  serverEventSchema,
  sessionAcceptedPayloadSchema,
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
    roundPhase: 'signal_active',
  };

  it('accepts every existing server event type', () => {
    const events = [
      {
        ...base,
        type: MessageTypes.SessionAccepted,
        commandId: 'cmd-session-1',
        payload: { matchId: 'match-1', playerId: 'p1', resumeToken: 'tok' },
      },
      {
        ...base,
        type: MessageTypes.SessionAccepted,
        commandId: 'cmd-session-creator',
        payload: { matchId: 'match-1', role: 'creator' },
      },
      {
        ...base,
        type: MessageTypes.MatchSnapshot,
        serverSequence: 0,
        payload: {
          matchId: 'match-1',
          status: 'waiting',
          phase: 'lobby',
          phaseDeadlineAtMs: null,
          roundNumber: 0,
          serverNowMs: 1_000,
          lastRoundResult: null,
          nextPhaseAtMs: null,
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
        type: MessageTypes.ChallengeSignal,
        serverSequence: 2,
        payload: {
          challengeInstanceId: 'ch-1',
          signalToken: 'tok-abc',
          signaledAtMs: 2_500,
          signalEndsAtMs: 3_500,
          serverNowMs: 2_500,
        },
      },
      {
        ...base,
        type: MessageTypes.ChallengeSignalEnded,
        serverSequence: 3,
        payload: {
          challengeInstanceId: 'ch-1',
          signalEndsAtMs: 3_500,
          serverNowMs: 3_500,
        },
      },
      {
        ...base,
        type: MessageTypes.ChallengeSubmissionAck,
        commandId: 'cmd-submit-1',
        payload: { accepted: true, duplicate: false },
      },
      {
        ...base,
        type: MessageTypes.ChallengeResolved,
        serverSequence: 4,
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
        serverSequence: 5,
        payload: {
          status: 'resolving',
          reasonKey: 'errors.match.unsafe_zero_survivors',
        },
      },
      {
        ...base,
        type: MessageTypes.MatchFinished,
        serverSequence: 6,
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
      const result = serverEventSchema.safeParse(event);
      if (!result.success) {
        throw new Error(
          `Failed to parse event type ${(event as { type: string }).type}: ${JSON.stringify(result.error.issues)}`,
        );
      }
      expect(safeParseServerEvent(event).success).toBe(true);
    }
  });

  it('accepts exact mutually exclusive session.accepted payload variants', () => {
    expect(
      sessionAcceptedPayloadSchema.safeParse({
        matchId: 'match-1',
        role: 'creator',
      }).success,
    ).toBe(true);
    expect(
      sessionAcceptedPayloadSchema.safeParse({
        matchId: 'match-1',
        playerId: 'p1',
        resumeToken: 'tok',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid session.accepted payload mixtures and extras', () => {
    const reject = (payload: unknown) => {
      expect(sessionAcceptedPayloadSchema.safeParse(payload).success).toBe(
        false,
      );
      expect(
        serverEventSchema.safeParse({
          ...base,
          type: MessageTypes.SessionAccepted,
          commandId: 'cmd-1',
          payload,
        }).success,
      ).toBe(false);
    };

    // Creator with player credentials
    reject({
      matchId: 'match-1',
      role: 'creator',
      playerId: 'p1',
      resumeToken: 'tok',
    });
    reject({ matchId: 'match-1', role: 'creator', playerId: 'p1' });
    reject({ matchId: 'match-1', role: 'creator', resumeToken: 'tok' });
    // Player with role creator
    reject({
      matchId: 'match-1',
      playerId: 'p1',
      resumeToken: 'tok',
      role: 'creator',
    });
    // Partial credentials
    reject({ matchId: 'match-1', playerId: 'p1' });
    reject({ matchId: 'match-1', resumeToken: 'tok' });
    // Neither shape
    reject({ matchId: 'match-1' });
    reject({});
    // Unknown extra fields
    reject({ matchId: 'match-1', role: 'creator', extra: true });
    reject({
      matchId: 'match-1',
      playerId: 'p1',
      resumeToken: 'tok',
      extra: true,
    });
  });

  it('rejects session.accepted and challenge.submission_ack without commandId', () => {
    const sessionAccepted = {
      ...base,
      type: MessageTypes.SessionAccepted,
      payload: { matchId: 'match-1', playerId: 'p1', resumeToken: 'tok' },
    };
    expect(serverEventSchema.safeParse(sessionAccepted).success).toBe(false);
    expect(safeParseServerEvent(sessionAccepted).success).toBe(false);

    const submissionAck = {
      ...base,
      type: MessageTypes.ChallengeSubmissionAck,
      payload: { accepted: true, duplicate: false },
    };
    expect(serverEventSchema.safeParse(submissionAck).success).toBe(false);
    expect(safeParseServerEvent(submissionAck).success).toBe(false);
  });
  it('serverEventSchema includes challenge.signal', () => {
    const signalEvent = {
      ...base,
      type: MessageTypes.ChallengeSignal,
      serverSequence: 10,
      payload: {
        challengeInstanceId: 'ch-sig',
        signalToken: 'tok-signal',
        signaledAtMs: 3_000,
        signalEndsAtMs: 4_000,
        serverNowMs: 3_000,
      },
    };
    expect(serverEventSchema.safeParse(signalEvent).success).toBe(true);
    expect(safeParseServerEvent(signalEvent).success).toBe(true);
  });

  it('serverEventSchema includes challenge.signal_ended', () => {
    const endedEvent = {
      ...base,
      type: MessageTypes.ChallengeSignalEnded,
      serverSequence: 11,
      payload: {
        challengeInstanceId: 'ch-sig',
        signalEndsAtMs: 4_000,
        serverNowMs: 4_000,
      },
    };
    expect(serverEventSchema.safeParse(endedEvent).success).toBe(true);
    expect(safeParseServerEvent(endedEvent).success).toBe(true);
  });

  it('accepts snapshots with phase fields and roundPhase in challenge', () => {
    const snapshot = {
      matchId: 'match-1',
      status: 'challenge_active',
      phase: 'challenge_active',
      phaseDeadlineAtMs: 5_000,
      roundNumber: 1,
      serverNowMs: 2_000,
      lastRoundResult: null,
      nextPhaseAtMs: null,
      revision: 2,
      sequence: 7,
      players: [],
      winnerId: null,
      currentChallenge: {
        ...challenge,
        choiceKeys: [],
        roundPhase: 'waiting_signal',
      },
    };
    expect(matchSnapshotPayloadSchema.safeParse(snapshot).success).toBe(true);
  });

  it('accepts snapshots with lastRoundResult', () => {
    const snapshot = {
      matchId: 'match-1',
      status: 'waiting',
      phase: 'round_result',
      phaseDeadlineAtMs: 6_000,
      roundNumber: 2,
      serverNowMs: 3_000,
      lastRoundResult: {
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
      nextPhaseAtMs: 6_000,
      revision: 5,
      sequence: 10,
      players: [],
      winnerId: null,
      currentChallenge: null,
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
