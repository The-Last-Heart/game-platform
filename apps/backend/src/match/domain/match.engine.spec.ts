import {
  createDevChallengeDefinition,
  DevDeterministicChoiceEvaluator,
  ChallengeEvaluatorRegistryImpl,
} from './dev-challenge.evaluator';
import {
  WaitForSignalEvaluator,
  WAIT_FOR_SIGNAL_ENGINE_ID,
} from './wait-for-signal.evaluator';
import { createLaunchEvaluators } from './engines/launch-evaluators';
import { MatchEngine, toPublicChallengeView } from './match.engine';
import {
  DomainError,
  FakeClock,
  INITIAL_ENERGY,
  INITIAL_HEARTS,
  MATCH_PLAYER_CAPACITY,
  SystemClock,
  type ChallengeDefinition,
} from './types';

function setup() {
  const clock = new FakeClock(1_000_000);
  const registry = new ChallengeEvaluatorRegistryImpl();
  registry.register(new DevDeterministicChoiceEvaluator());
  registry.register(new WaitForSignalEvaluator());
  for (const evaluator of createLaunchEvaluators()) {
    registry.register(evaluator);
  }  const engine = new MatchEngine(clock, registry);
  return { clock, engine, registry };
}

function fillSix(engine: MatchEngine) {
  let match = engine.createMatch('m1');
  for (let i = 0; i < MATCH_PLAYER_CAPACITY; i += 1) {
    const result = engine.joinPlayer(match, {
      playerId: `p${i}`,
      resumeTokenHash: `h${i}`,
    });
    match = result.match;
    match = engine.acceptJoin(match, `p${i}`).match;
  }
  return match;
}

function seatSignalToken(match: { currentChallenge: { seatVariants?: Map<string, { signalToken?: string | null }>; signalToken: string | null } | null }, playerId: string): string {
  const seat = match.currentChallenge?.seatVariants?.get(playerId);
  return seat?.signalToken ?? match.currentChallenge!.signalToken!;
}

function createWaitForSignalDefinition(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: overrides.definitionId ?? 'reaction.wait_for_signal.dev',
    definitionVersion: overrides.definitionVersion ?? 1,
    engineId: overrides.engineId ?? WAIT_FOR_SIGNAL_ENGINE_ID,
    durationMs: overrides.durationMs ?? 5000,
    heartPenaltyOnFailure: overrides.heartPenaltyOnFailure ?? 1,
    energyRewardOnSuccess: overrides.energyRewardOnSuccess ?? 1,
    promptKey: overrides.promptKey ?? 'challenge.wait_for_signal.intro',
    choiceKeys: overrides.choiceKeys ?? [],
    clientConfig: overrides.clientConfig ?? {
      categoryKey: 'challenge.category.reaction',
      waitingPromptKey: 'challenge.wait_for_signal.waiting',
      waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
      activePromptKey: 'challenge.wait_for_signal.active',
      actionKey: 'challenge.wait_for_signal.action',
    },
    serverConfig: overrides.serverConfig ?? {
      signalDelayMs: 1500,
      signalWindowMs: 1000,
      // Deterministic for engine specs; production catalog uses a real spread.
      signalDelayRangeMs: { min: 1500, max: 1500 },
    },
  };
}

describe('MatchEngine', () => {
  it('creates a six-player match with three hearts and zero energy', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    expect(match.players.size).toBe(6);
    for (const player of match.players.values()) {
      expect(player.hearts).toBe(INITIAL_HEARTS);
      expect(player.energy).toBe(INITIAL_ENERGY);
      expect(player.status).toBe('active');
    }
  });

  it('creates a match in lobby phase', () => {
    const { engine } = setup();
    const match = engine.createMatch('m-phase');
    expect(match.phase).toBe('lobby');
    expect(match.roundNumber).toBe(0);
    expect(match.lastRoundResult).toBeNull();
    expect(match.phaseDeadlineAtMs).toBeNull();
  });

  it('rejects challenge durations outside 3–15 seconds', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    expect(() =>
      engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 2999 }),
      ),
    ).toThrow(DomainError);
    expect(() =>
      engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 15_001 }),
      ),
    ).toThrow(DomainError);
  });

  it('adds only configured energy on success and applies 0/1 heart penalty on failure', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({
        durationMs: 3000,
        energyRewardOnSuccess: 2,
        heartPenaltyOnFailure: 1,
        serverConfig: { expectedChoice: 'a' },
      }),
    ).match;

    match = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'c-success',
      answer: { choice: 'a' },
    }).match;

    clock.advance(3001);
    const resolved = engine.resolveDueTimeouts(match);
    match = resolved.match;
    expect(match.players.get('p0')!.energy).toBe(2);
    expect(match.players.get('p1')!.hearts).toBe(2);
  });

  it('treats late responses as failures via server clock', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    clock.advance(3001);
    const late = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'late-1',
      answer: { choice: 'a' },
    });
    expect(late.ack.accepted).toBe(false);
    expect(late.ack.reason).toBe('late');
  });

  it('inclusive deadline boundary: accepts just before and at deadline; timeout only after', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({
        durationMs: 3000,
        energyRewardOnSuccess: 1,
        heartPenaltyOnFailure: 1,
        serverConfig: { expectedChoice: 'a' },
      }),
    ).match;
    const challengeId = match.currentChallenge!.challengeInstanceId;
    const deadline = match.currentChallenge!.deadlineMonoMs;

    // Just before deadline: submission accepted
    clock.advance(deadline - clock.monoMs() - 1);
    expect(clock.monoMs()).toBe(deadline - 1);
    const before = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challengeId,
      commandId: 'before-deadline',
      answer: { choice: 'a' },
    });
    expect(before.ack.accepted).toBe(true);
    match = before.match;

    // Exactly at deadline: submission accepted; resolveDueTimeouts does NOT resolve
    clock.advance(1);
    expect(clock.monoMs()).toBe(deadline);
    const atDeadline = engine.submitAnswer(match, {
      playerId: 'p1',
      challengeInstanceId: challengeId,
      commandId: 'at-deadline',
      answer: { choice: 'a' },
    });
    expect(atDeadline.ack.accepted).toBe(true);
    match = atDeadline.match;
    const notYet = engine.resolveDueTimeouts(match);
    expect(notYet.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      false,
    );
    expect(match.currentChallenge!.status).toBe('active');

    // Just after deadline: late submission rejected; resolveDueTimeouts resolves
    clock.advance(1);
    expect(clock.monoMs()).toBe(deadline + 1);
    const late = engine.submitAnswer(match, {
      playerId: 'p2',
      challengeInstanceId: challengeId,
      commandId: 'after-deadline-late',
      answer: { choice: 'a' },
    });
    expect(late.ack.accepted).toBe(false);
    expect(late.ack.reason).toBe('late');
    match = late.match;

    const resolved = engine.resolveDueTimeouts(match);
    expect(resolved.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      true,
    );
    match = resolved.match;
    expect(match.players.get('p0')!.energy).toBe(1);
    expect(match.players.get('p1')!.energy).toBe(1);
    expect(match.players.get('p2')!.hearts).toBe(INITIAL_HEARTS - 1);
  });

  it('inclusive deadline boundary: both queue orderings at equality apply hearts/energy once', () => {
    const runOrdering = (
      order: 'submit-then-timeout' | 'timeout-then-submit',
    ) => {
      const { clock, engine } = setup();
      let match = fillSix(engine);
      match = engine.startChallenge(
        match,
        createDevChallengeDefinition({
          durationMs: 3000,
          energyRewardOnSuccess: 2,
          heartPenaltyOnFailure: 1,
          serverConfig: { expectedChoice: 'a' },
        }),
      ).match;
      const challengeId = match.currentChallenge!.challengeInstanceId;
      const deadline = match.currentChallenge!.deadlineMonoMs;
      clock.advance(deadline - clock.monoMs());
      expect(clock.monoMs()).toBe(deadline);

      if (order === 'submit-then-timeout') {
        const submitted = engine.submitAnswer(match, {
          playerId: 'p0',
          challengeInstanceId: challengeId,
          commandId: `eq-${order}`,
          answer: { choice: 'a' },
        });
        expect(submitted.ack.accepted).toBe(true);
        match = submitted.match;
        const timed = engine.resolveDueTimeouts(match);
        expect(timed.events.some((e) => e.kind === 'challenge_resolved')).toBe(
          false,
        );
        match = timed.match;
      } else {
        const timed = engine.resolveDueTimeouts(match);
        expect(timed.events.some((e) => e.kind === 'challenge_resolved')).toBe(
          false,
        );
        match = timed.match;
        const submitted = engine.submitAnswer(match, {
          playerId: 'p0',
          challengeInstanceId: challengeId,
          commandId: `eq-${order}`,
          answer: { choice: 'a' },
        });
        expect(submitted.ack.accepted).toBe(true);
        match = submitted.match;
      }

      clock.advance(1);
      match = engine.resolveDueTimeouts(match).match;
      expect(match.players.get('p0')!.energy).toBe(2);
      expect(match.players.get('p0')!.hearts).toBe(INITIAL_HEARTS);
      // Other players timed out once
      expect(match.players.get('p1')!.hearts).toBe(INITIAL_HEARTS - 1);
      expect(match.players.get('p1')!.energy).toBe(0);
      return match;
    };

    runOrdering('submit-then-timeout');
    runOrdering('timeout-then-submit');
  });

  it('resolves missing responses at deadline', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    clock.advance(3000);
    clock.advance(1);
    const resolved = engine.resolveDueTimeouts(match);
    expect(resolved.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      true,
    );
  });

  it('never lets hearts go negative and converts zero hearts to spectator', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    for (let round = 0; round < 3; round += 1) {
      if (match.status === 'completed') {
        break;
      }
      match = engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 3000 }),
      ).match;
      match = engine.submitAnswer(match, {
        playerId: 'p0',
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: `ok-${round}`,
        answer: { choice: 'a' },
      }).match;
      clock.advance(3001);
      match = engine.resolveDueTimeouts(match).match;
    }
    for (const player of match.players.values()) {
      expect(player.hearts).toBeGreaterThanOrEqual(0);
      if (player.hearts === 0) {
        expect(player.status).toBe('spectator');
      }
    }
  });

  it('rejects spectator submissions', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    for (let round = 0; round < 3; round += 1) {
      match = engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 3000 }),
      ).match;
      for (const id of ['p0', 'p2', 'p3', 'p4', 'p5']) {
        match = engine.submitAnswer(match, {
          playerId: id,
          challengeInstanceId: match.currentChallenge!.challengeInstanceId,
          commandId: `${id}-${round}`,
          answer: { choice: 'a' },
        }).match;
      }
      clock.advance(3001);
      match = engine.resolveDueTimeouts(match).match;
    }
    expect(match.players.get('p1')!.status).toBe('spectator');
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    expect(() =>
      engine.submitAnswer(match, {
        playerId: 'p1',
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: 'spec-1',
        answer: { choice: 'a' },
      }),
    ).toThrow(DomainError);
  });

  it('is idempotent for duplicate commandIds', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 5000 }),
    ).match;
    const first = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'same',
      answer: { choice: 'a' },
    });
    const second = engine.submitAnswer(first.match, {
      playerId: 'p0',
      challengeInstanceId: first.match.currentChallenge!.challengeInstanceId,
      commandId: 'same',
      answer: { choice: 'a' },
    });
    expect(second.duplicate).toBe(true);
    expect(second.match.sequence).toBe(first.match.sequence);
  });

  it('cannot double-resolve via timeout after full submission', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    const challengeId = match.currentChallenge!.challengeInstanceId;
    for (let i = 0; i < 6; i += 1) {
      match = engine.submitAnswer(match, {
        playerId: `p${i}`,
        challengeInstanceId: challengeId,
        commandId: `cmd-${i}`,
        answer: { choice: i === 0 ? 'a' : 'b' },
      }).match;
    }
    expect(match.currentChallenge?.status).toBe('resolved');
    expect(match.status).toBe('waiting');
    const seq = match.sequence;
    clock.advance(5000);
    const again = engine.resolveDueTimeouts(match);
    expect(again.events).toEqual([]);
    expect(again.match.sequence).toBe(seq);
  });

  it('completes when exactly one survivor remains', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    for (let round = 0; round < 3; round += 1) {
      match = engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 3000 }),
      ).match;
      match = engine.submitAnswer(match, {
        playerId: 'p0',
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: `winner-${round}`,
        answer: { choice: 'a' },
      }).match;
      clock.advance(3001);
      match = engine.resolveDueTimeouts(match).match;
    }
    expect(match.status).toBe('completed');
    expect(match.phase).toBe('completed');
    expect(match.winnerId).toBe('p0');
  });

  it('does not invent a winner for zero survivors', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    for (let round = 0; round < 3; round += 1) {
      match = engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 3000 }),
      ).match;
      clock.advance(3001);
      match = engine.resolveDueTimeouts(match).match;
    }
    expect(match.winnerId).toBeNull();
    expect(match.phase).toBe('draw');
    expect(match.status).toBe('completed');
    expect(
      [...match.players.values()].every((p) => p.hearts === 0),
    ).toBe(true);
  });

  it('increments sequence strictly for real mutations', () => {
    const { engine } = setup();
    let match = engine.createMatch('m2');
    expect(match.sequence).toBe(0);
    match = engine.joinPlayer(match, {
      playerId: 'p0',
      resumeTokenHash: 'h',
    }).match;
    expect(match.sequence).toBe(1);
    match = engine.joinPlayer(match, {
      playerId: 'p1',
      resumeTokenHash: 'h2',
    }).match;
    expect(match.sequence).toBe(2);
  });

  it('allows non-choice definitions with empty choiceKeys', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    const started = engine.startChallenge(
      match,
      createDevChallengeDefinition({
        choiceKeys: [],
        clientConfig: { gesture: 'shake' },
      }),
    );
    expect(started.match.currentChallenge!.definition.choiceKeys).toEqual([]);
    const snap = engine.toPublicSnapshot(started.match);
    expect(snap.currentChallenge!.choiceKeys).toEqual([]);
    expect(snap.currentChallenge!.clientConfig).toEqual({
      fixtureMode: true,
      gesture: 'shake',
    });
  });

  it('pins definition id/version and never exposes serverConfig', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    const definition = createDevChallengeDefinition({
      definitionId: 'dev.fixture',
      definitionVersion: 3,
      serverConfig: { expectedChoice: 'a', secret: 'nope' },
      clientConfig: { displayHint: 'pick-one' },
    });
    const started = engine.startChallenge(match, definition);
    definition.definitionVersion = 99;
    definition.serverConfig['expectedChoice'] = 'b';
    definition.clientConfig['displayHint'] = 'changed';

    const round = started.match.currentChallenge!;
    expect(round.definitionId).toBe('dev.fixture');
    expect(round.definitionVersion).toBe(3);
    expect(round.definition.definitionVersion).toBe(3);
    expect(round.definition.serverConfig['expectedChoice']).toBe('a');

    const publicView = engine.toPublicSnapshot(started.match).currentChallenge!;
    expect(publicView.definitionId).toBe('dev.fixture');
    expect(publicView.definitionVersion).toBe(3);
    expect(publicView.clientConfig).toEqual({
      fixtureMode: true,
      displayHint: 'pick-one',
    });
    expect(JSON.stringify(publicView)).not.toContain('expectedChoice');
    expect(JSON.stringify(publicView)).not.toContain('serverConfig');
    expect(JSON.stringify(publicView)).not.toContain('secret');
  });

  it('uses monotonic time for deadlines despite wall-clock skew', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;

    clock.setWall(clock.nowMs() - 60_000);
    const stillOk = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'skew-ok',
      answer: { choice: 'a' },
    });
    expect(stillOk.ack.accepted).toBe(true);
    match = stillOk.match;

    clock.setWall(clock.nowMs() + 120_000);
    clock.advanceMono(3001);
    const late = engine.submitAnswer(match, {
      playerId: 'p1',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'skew-late',
      answer: { choice: 'a' },
    });
    expect(late.ack.accepted).toBe(false);
    expect(late.ack.reason).toBe('late');
  });

  it('SystemClock.monoMs uses performance.now, not Date.now', () => {
    const spyPerf = jest.spyOn(performance, 'now').mockReturnValue(42_000);
    const spyDate = jest.spyOn(Date, 'now').mockReturnValue(99_000);
    const clock = new SystemClock();
    expect(clock.monoMs()).toBe(42_000);
    expect(clock.nowMs()).toBe(99_000);
    spyPerf.mockRestore();
    spyDate.mockRestore();
  });

  it('snapshot includes phase fields', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    const snap = engine.toPublicSnapshot(match);
    expect(snap.phase).toBe('lobby');
    expect(snap.roundNumber).toBe(0);
    expect(snap.serverNowMs).toBeGreaterThan(0);
    expect(snap.lastRoundResult).toBeNull();
    expect(snap.nextPhaseAtMs).toBeNull();
    expect(snap.phaseDeadlineAtMs).toBeNull();
  });
});

describe('WaitForSignal engine', () => {
  it('starts in waiting_signal phase and does not leak signal before activation', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    const def = createWaitForSignalDefinition();
    const started = engine.startChallenge(match, def);
    match = started.match;
    const round = match.currentChallenge!;

    expect(round.roundPhase).toBe('waiting_signal');
    expect(round.signalToken).toBeTruthy();
    expect(round.signaledAtMs).toBeNull();

    const pub = toPublicChallengeView(round, 1_000_000);
    expect(pub.roundPhase).toBe('waiting_signal');
    expect(pub.signalToken).toBeUndefined();
    expect(pub.signaledAtMs).toBeUndefined();
  });

  it('activates signal when mono time passes signalAtMonoMs', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;
    const seqBefore = match.sequence;

    // Not yet due
    clock.advance(1000);
    let result = engine.activateSignal(match);
    expect(result.events).toEqual([]);

    // Due now
    clock.advance(500);
    result = engine.activateSignal(match);
    expect(result.events.length).toBeGreaterThan(0);
    match = result.match;

    const signalEvent = result.events.find(
      (e) => e.kind === 'challenge_signal',
    );
    expect(signalEvent).toBeDefined();
    expect(match.currentChallenge!.roundPhase).toBe('signal_active');
    expect(match.currentChallenge!.signaledAtMs).toBeTruthy();
    // Seat-private activations must not advance sequence (clients never see it).
    expect(match.sequence).toBe(seqBefore);
    expect(result.events.every((e) => e.kind !== 'sequence')).toBe(true);

    // Public view after signal includes signalToken and window end
    const pub = toPublicChallengeView(match.currentChallenge!, clock.nowMs());
    expect(pub.roundPhase).toBe('signal_active');
    expect(pub.signalToken).toBeTruthy();
    expect(pub.signaledAtMs).toBeTruthy();
    expect(pub.signalEndsAtMs).toBe(clock.nowMs() + 1000);
  });

  it('expires blue window and late taps with token evaluate as failure', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;
    clock.advance(1500);
    match = engine.activateSignal(match).match;
    expect(match.currentChallenge!.roundPhase).toBe('signal_active');

    clock.advance(1001);
    const expired = engine.expireSignal(match);
    expect(expired.events.some((e) => e.kind === 'challenge_signal_ended')).toBe(
      true,
    );
    match = expired.match;
    expect(match.currentChallenge!.roundPhase).toBe('signal_expired');

    const pub = toPublicChallengeView(match.currentChallenge!, clock.nowMs());
    expect(pub.roundPhase).toBe('signal_expired');
    expect(pub.signalToken).toBeUndefined();
    expect(pub.signalEndsAtMs).toBeTruthy();

    for (let i = 0; i < 6; i++) {
      match = engine.submitAnswer(match, {
        playerId: `p${i}`,
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: `late-${i}`,
        answer: { signalToken: seatSignalToken(match, `p${i}`) },
      }).match;
    }

    expect(match.players.get('p0')!.hearts).toBe(2);
    expect(match.players.get('p0')!.energy).toBe(0);
  });

  it('rejects malformed signalWindowMs before challenge starts', () => {
    const { engine } = setup();
    const match = fillSix(engine);

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          serverConfig: { signalDelayMs: 1500, signalWindowMs: 0 },
        }),
      ),
    ).toThrow(DomainError);

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          durationMs: 5000,
          serverConfig: { signalDelayMs: 4000, signalWindowMs: 2000 },
        }),
      ),
    ).toThrow(DomainError);

    expect(match.currentChallenge).toBeNull();
  });

  it('early tap (before signal) is accepted but evaluates as failure', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;
    const round = match.currentChallenge!;
    expect(round.roundPhase).toBe('waiting_signal');

    const result = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: round.challengeInstanceId,
      commandId: 'early-tap',
      answer: { signalToken: 'anything' },
    });
    expect(result.ack.accepted).toBe(true);
  });

  it('valid token after signal evaluates as success', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    // Activate signal
    clock.advance(1500);
    match = engine.activateSignal(match).match;
    expect(match.currentChallenge!.roundPhase).toBe('signal_active');

    // Submit each seat's own token — all 6 players
    for (let i = 0; i < 6; i++) {
      match = engine.submitAnswer(match, {
        playerId: `p${i}`,
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: `submit-${i}`,
        answer: { signalToken: seatSignalToken(match, `p${i}`) },
      }).match;
    }

    // All submitted → auto-resolved (challenge retained until round_result).
    const resolved = match.currentChallenge;
    expect(resolved?.status).toBe('resolved');
    // Check p0 got energy
    expect(match.players.get('p0')!.energy).toBe(1);
  });

  it('wrong token after signal evaluates as failure', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    clock.advance(1500);
    match = engine.activateSignal(match).match;

    // Submit wrong token for all
    for (let i = 0; i < 6; i++) {
      match = engine.submitAnswer(match, {
        playerId: `p${i}`,
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: `wrong-${i}`,
        answer: { signalToken: 'wrong-token' },
      }).match;
    }

    // All failed — all lost a heart
    expect(match.players.get('p0')!.hearts).toBe(2);
  });

  it('timeout with no submission counts as failure', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    clock.advance(1500);
    match = engine.activateSignal(match).match;
    clock.advance(3501);
    match = engine.resolveDueTimeouts(match).match;

    expect(match.players.get('p0')!.hearts).toBe(2);
  });

  it('one attempt per player', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;
    const round = match.currentChallenge!;

    clock.advance(1500);
    match = engine.activateSignal(match).match;

    const first = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: round.challengeInstanceId,
      commandId: 'first-attempt',
      answer: { signalToken: seatSignalToken(match, 'p0') },
    });
    expect(first.ack.accepted).toBe(true);

    const second = engine.submitAnswer(first.match, {
      playerId: 'p0',
      challengeInstanceId: first.match.currentChallenge!.challengeInstanceId,
      commandId: 'second-attempt',
      answer: { signalToken: seatSignalToken(first.match, 'p0') },
    });
    expect(second.ack.reason).toBe('already_submitted');
  });

  it('hearts/energy correct after mixed success/failure round', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createWaitForSignalDefinition({
        heartPenaltyOnFailure: 1,
        energyRewardOnSuccess: 2,
      }),
    ).match;

    clock.advance(1500);
    match = engine.activateSignal(match).match;

    // p0 succeeds
    match = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'ok-0',
      answer: { signalToken: seatSignalToken(match, 'p0') },
    }).match;

    // p1 wrong token
    match = engine.submitAnswer(match, {
      playerId: 'p1',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'bad-1',
      answer: { signalToken: 'wrong' },
    }).match;

    // Rest timeout
    clock.advance(3501);
    match = engine.resolveDueTimeouts(match).match;

    expect(match.players.get('p0')!.energy).toBe(2);
    expect(match.players.get('p0')!.hearts).toBe(3);
    expect(match.players.get('p1')!.hearts).toBe(2);
    expect(match.players.get('p2')!.hearts).toBe(2);
  });

  it('prior energy is kept when others fail in a later round', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createWaitForSignalDefinition({
        heartPenaltyOnFailure: 1,
        energyRewardOnSuccess: 1,
      }),
    ).match;
    clock.advance(1500);
    match = engine.activateSignal(match).match;
    match = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'ok-round1',
      answer: { signalToken: seatSignalToken(match, 'p0') },
    }).match;
    clock.advance(3501);
    match = engine.resolveDueTimeouts(match).match;
    expect(match.players.get('p0')!.energy).toBe(1);

    match = engine.beginRoundResult(
      match,
      match.currentChallenge!.resolutions,
      match.currentChallenge!.challengeInstanceId,
      100,
    ).match;
    match = engine.startChallenge(
      match,
      createWaitForSignalDefinition({
        heartPenaltyOnFailure: 1,
        energyRewardOnSuccess: 1,
      }),
    ).match;
    clock.advance(1500);
    match = engine.activateSignal(match).match;
    // Only p0 succeeds again; everyone else fails/timeouts.
    match = engine.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'ok-round2',
      answer: { signalToken: seatSignalToken(match, 'p0') },
    }).match;
    clock.advance(3501);
    match = engine.resolveDueTimeouts(match).match;
    expect(match.players.get('p0')!.energy).toBe(2);
    expect(match.players.get('p1')!.energy).toBe(0);
  });

  it('rejects joins after the lobby seals into ready_countdown', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    for (const player of match.players.values()) {
      match = engine.acceptJoin(match, player.playerId).match;
    }
    match = engine.beginReadyCountdown(match, 3000).match;
    expect(() =>
      engine.joinPlayer(match, {
        playerId: 'late',
        resumeTokenHash: 'late-hash',
      }),
    ).toThrow(DomainError);
  });

  it('countdown does not consume challenge duration', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);

    // Begin ready countdown
    const countdownResult = engine.beginReadyCountdown(match, 3000);
    match = countdownResult.match;
    expect(match.phase).toBe('ready_countdown');
    clock.advance(3000);

    // Begin intro
    const def = createWaitForSignalDefinition({ durationMs: 5000 });
    const introResult = engine.beginChallengeIntro(match, 2000, def);
    match = introResult.match;
    expect(match.phase).toBe('challenge_intro');
    clock.advance(2000);

    // Start challenge from intro
    const startResult = engine.startChallenge(match);
    match = startResult.match;
    const round = match.currentChallenge!;

    // Verify deadline = startsAt + durationMs (not affected by countdown/intro time)
    expect(round.deadlineAtMs - round.startsAtMs).toBe(5000);
  });

  it('deferred intro bump keeps challenge.started consecutive', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    const beforeSeq = match.sequence;
    const def = createWaitForSignalDefinition({ durationMs: 5000 });
    const intro = engine.beginChallengeIntro(match, 0, def, {
      deferSequenceBump: true,
    });
    expect(intro.events).toHaveLength(0);
    expect(intro.match.sequence).toBe(beforeSeq);
    expect(intro.match.phase).toBe('challenge_intro');

    const started = engine.startChallenge(intro.match);
    expect(started.match.sequence).toBe(beforeSeq + 1);
    expect(started.match.phase).toBe('challenge_active');
    expect(
      started.events.some((e) => e.kind === 'challenge_started'),
    ).toBe(true);
    expect(started.events[0]!.sequence).toBe(beforeSeq + 1);
  });

  it('reconnect snapshot before signal omits signalToken', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    const snap = engine.toPublicSnapshot(match);
    expect(snap.currentChallenge).not.toBeNull();
    expect(snap.currentChallenge!.roundPhase).toBe('waiting_signal');
    expect(snap.currentChallenge!.signalToken).toBeUndefined();
    expect(snap.currentChallenge!.signaledAtMs).toBeUndefined();
  });

  it('reconnect snapshot after signal includes signalToken', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    clock.advance(1500);
    match = engine.activateSignal(match).match;

    const snap = engine.toPublicSnapshot(match);
    expect(snap.currentChallenge!.roundPhase).toBe('signal_active');
    expect(snap.currentChallenge!.signalToken).toBeTruthy();
    expect(snap.currentChallenge!.signaledAtMs).toBeTruthy();
  });

  it('beginRoundResult stores lastRoundResult and sets round_result phase', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    const cid = match.currentChallenge!.challengeInstanceId;

    for (let i = 0; i < 6; i++) {
      match = engine.submitAnswer(match, {
        playerId: `p${i}`,
        challengeInstanceId: cid,
        commandId: `cmd-${i}`,
        answer: { choice: i === 0 ? 'a' : 'b' },
      }).match;
    }

    // After auto-resolve, status is waiting with challenge retained for hold.
    expect(match.status).toBe('waiting');
    expect(match.phase).toBe('challenge_active');
    expect(match.currentChallenge?.status).toBe('resolved');

    // Public snapshot must not expose challenge_active + null challenge
    // (clients historically rendered that as the lobby roster).
    const pendingSnap = engine.toPublicSnapshot(match);
    expect(pendingSnap.phase).toBe('round_result');
    expect(pendingSnap.currentChallenge).toBeNull();
    expect(pendingSnap.lastRoundResult).not.toBeNull();
    expect(pendingSnap.lastRoundResult!.challengeInstanceId).toBe(cid);
    expect(pendingSnap.lastRoundResult!.resolutions.length).toBe(6);

    const resolutions = match.currentChallenge!.resolutions;
    const result = engine.beginRoundResult(match, resolutions, cid, 2500);
    match = result.match;
    expect(match.phase).toBe('round_result');
    expect(match.lastRoundResult).not.toBeNull();
    expect(match.lastRoundResult!.challengeInstanceId).toBe(cid);
    expect(match.nextPhaseAtMs).toBeTruthy();
  });

  it('completeByStandings crowns only a unique hearts leader', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    const cid = match.currentChallenge!.challengeInstanceId;

    for (let i = 0; i < 6; i++) {
      match = engine.submitAnswer(match, {
        playerId: `p${i}`,
        challengeInstanceId: cid,
        commandId: `cmd-${i}`,
        answer: { choice: i === 0 ? 'a' : 'b' },
      }).match;
    }

    const hold = engine.beginRoundResult(
      match,
      match.currentChallenge!.resolutions,
      cid,
      2500,
    );
    const finished = engine.completeByStandings(hold.match);
    expect(finished.match.phase).toBe('completed');
    expect(finished.match.winnerId).toBe('p0');
    expect(finished.events.some((e) => e.kind === 'match_finished')).toBe(true);
  });

  it('completeByStandings does not invent a winner on equal hearts — draw', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    for (const player of match.players.values()) {
      player.hearts = 2;
      player.energy = 0;
      player.status = 'active';
    }
    // Energy must not break a hearts tie.
    match.players.get('p0')!.energy = 9;
    match.players.get('p1')!.energy = 0;
    const finished = engine.completeByStandings(match);
    expect(finished.match.phase).toBe('draw');
    expect(finished.match.status).toBe('completed');
    expect(finished.match.winnerId).toBeNull();
    expect(finished.events.some((e) => e.kind === 'match_drawn')).toBe(true);
    expect(finished.events.some((e) => e.kind === 'match_finished')).toBe(
      false,
    );
  });
});

describe('Challenge definition pinning and validation', () => {
  it('deep-copies nested clientConfig/serverConfig so catalog mutation cannot alter active round', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    const nestedClient = {
      categoryKey: 'challenge.category.reaction',
      waitingPromptKey: 'challenge.wait_for_signal.waiting',
      waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
      activePromptKey: 'challenge.wait_for_signal.active',
      actionKey: 'challenge.wait_for_signal.action',
      ui: { tone: 'warm' },
    };
    const nestedServer = {
      signalDelayMs: 1500,
      signalWindowMs: 1000,
      meta: { seed: 7 },
    };
    const def = createWaitForSignalDefinition({
      clientConfig: nestedClient,
      serverConfig: nestedServer,
    });

    match = engine.startChallenge(match, def).match;
    const pinnedClient = match.currentChallenge!.definition.clientConfig;
    const pinnedServer = match.currentChallenge!.definition.serverConfig;

    nestedClient.ui.tone = 'mutated';
    nestedServer.meta.seed = 99;
    (def.clientConfig as { ui: { tone: string } }).ui.tone = 'catalog-mutated';
    (def.serverConfig as { meta: { seed: number } }).meta.seed = 123;

    expect(pinnedClient).toEqual({
      categoryKey: 'challenge.category.reaction',
      waitingPromptKey: 'challenge.wait_for_signal.waiting',
      waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
      activePromptKey: 'challenge.wait_for_signal.active',
      actionKey: 'challenge.wait_for_signal.action',
      ui: { tone: 'warm' },
    });
    expect(pinnedServer).toEqual({
      signalDelayMs: 1500,
      signalWindowMs: 1000,
      meta: { seed: 7 },
    });
    expect(pinnedClient).not.toBe(def.clientConfig);
    expect(pinnedServer).not.toBe(def.serverConfig);

    const pub = toPublicChallengeView(match.currentChallenge!, 1_000_000);
    (pub.clientConfig as { ui: { tone: string } }).ui.tone = 'view-mutated';
    expect(match.currentChallenge!.definition.clientConfig).toEqual({
      categoryKey: 'challenge.category.reaction',
      waitingPromptKey: 'challenge.wait_for_signal.waiting',
      waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
      activePromptKey: 'challenge.wait_for_signal.active',
      actionKey: 'challenge.wait_for_signal.action',
      ui: { tone: 'warm' },
    });
  });

  it('rejects malformed wait_for_signal clientConfig before challenge starts', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    const requiredKeys = [
      'categoryKey',
      'waitingPromptKey',
      'waitingHintKey',
      'activePromptKey',
      'actionKey',
    ] as const;

    // Missing keys
    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          clientConfig: { categoryKey: 'challenge.category.reaction' },
        }),
      ),
    ).toThrow(DomainError);

    for (const key of requiredKeys) {
      // Blank string
      expect(() =>
        engine.startChallenge(
          match,
          createWaitForSignalDefinition({
            clientConfig: {
              categoryKey: 'challenge.category.reaction',
              waitingPromptKey: 'challenge.wait_for_signal.waiting',
              waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
              activePromptKey: 'challenge.wait_for_signal.active',
              actionKey: 'challenge.wait_for_signal.action',
              [key]: '   ',
            },
          }),
        ),
      ).toThrow(DomainError);

      // Numeric
      expect(() =>
        engine.startChallenge(
          match,
          createWaitForSignalDefinition({
            clientConfig: {
              categoryKey: 'challenge.category.reaction',
              waitingPromptKey: 'challenge.wait_for_signal.waiting',
              waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
              activePromptKey: 'challenge.wait_for_signal.active',
              actionKey: 'challenge.wait_for_signal.action',
              [key]: 42,
            },
          }),
        ),
      ).toThrow(DomainError);

      // List
      expect(() =>
        engine.startChallenge(
          match,
          createWaitForSignalDefinition({
            clientConfig: {
              categoryKey: 'challenge.category.reaction',
              waitingPromptKey: 'challenge.wait_for_signal.waiting',
              waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
              activePromptKey: 'challenge.wait_for_signal.active',
              actionKey: 'challenge.wait_for_signal.action',
              [key]: ['a'],
            },
          }),
        ),
      ).toThrow(DomainError);

      // Object
      expect(() =>
        engine.startChallenge(
          match,
          createWaitForSignalDefinition({
            clientConfig: {
              categoryKey: 'challenge.category.reaction',
              waitingPromptKey: 'challenge.wait_for_signal.waiting',
              waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
              activePromptKey: 'challenge.wait_for_signal.active',
              actionKey: 'challenge.wait_for_signal.action',
              [key]: { nested: true },
            },
          }),
        ),
      ).toThrow(DomainError);
    }

    expect(match.currentChallenge).toBeNull();
    expect(match.phase).toBe('lobby');
    for (const player of match.players.values()) {
      expect(player.hearts).toBe(INITIAL_HEARTS);
      expect(player.energy).toBe(INITIAL_ENERGY);
    }
  });

  it('rejects malformed signalDelayMs before challenge starts', () => {
    const { engine } = setup();
    const match = fillSix(engine);

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          serverConfig: { signalDelayMs: -1 },
        }),
      ),
    ).toThrow(DomainError);

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          durationMs: 5000,
          serverConfig: { signalDelayMs: 5000 },
        }),
      ),
    ).toThrow(DomainError);

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          serverConfig: { signalDelayMs: Number.POSITIVE_INFINITY },
        }),
      ),
    ).toThrow(DomainError);

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          serverConfig: { signalDelayMs: '1500' as unknown as number },
        }),
      ),
    ).toThrow(DomainError);

    expect(match.currentChallenge).toBeNull();
    expect(match.phase).toBe('lobby');
    for (const player of match.players.values()) {
      expect(player.hearts).toBe(INITIAL_HEARTS);
    }
  });

  it('rejects non-JSON-compatible configuration objects', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    const cyclic: Record<string, unknown> = {
      categoryKey: 'challenge.category.reaction',
      waitingPromptKey: 'challenge.wait_for_signal.waiting',
      waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
      activePromptKey: 'challenge.wait_for_signal.active',
      actionKey: 'challenge.wait_for_signal.action',
    };
    cyclic['self'] = cyclic;

    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({
          clientConfig: cyclic,
        }),
      ),
    ).toThrow(DomainError);
  });

  it('rejects unknown evaluator before challenge starts and without heart loss', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({ engineId: 'unknown.engine.v1' }),
      ),
    ).toThrow(DomainError);
    expect(match.currentChallenge).toBeNull();
    expect(match.phase).toBe('lobby');
    for (const player of match.players.values()) {
      expect(player.hearts).toBe(INITIAL_HEARTS);
      expect(player.energy).toBe(INITIAL_ENERGY);
    }
  });

  it('rejects empty translation keys and non-integer duration', () => {
    const { engine } = setup();
    const match = fillSix(engine);
    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({ promptKey: '   ' }),
      ),
    ).toThrow(DomainError);
    expect(() =>
      engine.startChallenge(
        match,
        createWaitForSignalDefinition({ durationMs: 4500.5 }),
      ),
    ).toThrow(DomainError);
  });

  it('training failure does not crown the sole survivor as winner', () => {
    const { clock, engine } = setup();
    let match = engine.createMatch('train-fail', {
      mode: 'training',
      playerCapacity: 1,
    });
    match = engine.joinPlayer(match, {
      playerId: 'trainee',
      resumeTokenHash: 'hash',
      displayName: 'وجدي',
      avatarColor: '#FF3045',
    }).match;
    match = engine.acceptJoin(match, 'trainee').match;
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    // Early wrong tap → failure, still 2 hearts, still sole survivor.
    match = engine.submitAnswer(match, {
      playerId: 'trainee',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'early',
      answer: {},
    }).match;

    expect(match.currentChallenge?.status).toBe('resolved');
    expect(match.players.get('trainee')!.hearts).toBe(2);
    expect(match.phase).not.toBe('completed');
    expect(match.winnerId).toBeNull();
    expect(match.status).toBe('waiting');
  });

  it('training last-heart failure does not halt; stays waiting for round feedback', () => {
    const { engine } = setup();
    let match = engine.createMatch('train-wipe', {
      mode: 'training',
      playerCapacity: 1,
    });
    match = engine.joinPlayer(match, {
      playerId: 'trainee',
      resumeTokenHash: 'hash',
      hearts: 1,
    }).match;
    match = engine.acceptJoin(match, 'trainee').match;
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    match = engine.submitAnswer(match, {
      playerId: 'trainee',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'last-fail',
      answer: {},
    }).match;

    expect(match.players.get('trainee')!.hearts).toBe(0);
    expect(match.players.get('trainee')!.status).toBe('spectator');
    expect(match.phase).not.toBe('halted');
    expect(match.phase).not.toBe('completed');
    expect(match.winnerId).toBeNull();
    expect(match.status).toBe('waiting');
  });

  it('training success does not crown mid-pack — stays waiting for next round', () => {
    const { clock, engine } = setup();
    let match = engine.createMatch('train-ok', {
      mode: 'training',
      playerCapacity: 1,
    });
    match = engine.joinPlayer(match, {
      playerId: 'trainee',
      resumeTokenHash: 'hash',
      displayName: 'وجدي',
      avatarColor: '#FF3045',
    }).match;
    match = engine.acceptJoin(match, 'trainee').match;
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;
    const token = match.currentChallenge!.signalToken!;

    clock.advance(1500);
    match = engine.activateSignal(match).match;
    match = engine.submitAnswer(match, {
      playerId: 'trainee',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'ok',
      answer: { signalToken: token },
    }).match;

    expect(match.phase).not.toBe('completed');
    expect(match.winnerId).toBeNull();
    expect(match.status).toBe('waiting');
    expect(match.players.get('trainee')!.hearts).toBe(3);
  });

  it('mid-match leave keeps the seat as left for results', () => {
    const { engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(match, createWaitForSignalDefinition()).match;

    const left = engine.leavePlayer(match, 'p1');
    expect(left.left).toBe(true);
    expect(left.removedFromLobby).toBe(false);
    expect(left.match.players.has('p1')).toBe(true);
    expect(left.match.players.get('p1')!.status).toBe('left');
    expect(left.match.players.get('p1')!.presence).toBe('disconnected');
    expect(left.match.players.get('p2')!.status).toBe('active');
  });
});
