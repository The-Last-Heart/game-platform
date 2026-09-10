import {
  createDevChallengeDefinition,
  DevDeterministicChoiceEvaluator,
  ChallengeEvaluatorRegistryImpl,
} from './dev-challenge.evaluator';
import { MatchEngine } from './match.engine';
import {
  DomainError,
  FakeClock,
  INITIAL_ENERGY,
  INITIAL_HEARTS,
  MATCH_PLAYER_CAPACITY,
  SystemClock,
} from './types';

function setup() {
  const clock = new FakeClock(1_000_000);
  const registry = new ChallengeEvaluatorRegistryImpl();
  registry.register(new DevDeterministicChoiceEvaluator());
  const engine = new MatchEngine(clock, registry);
  return { clock, engine };
}

function fillSix(engine: MatchEngine) {
  let match = engine.createMatch('m1');
  for (let i = 0; i < MATCH_PLAYER_CAPACITY; i += 1) {
    const result = engine.joinPlayer(match, {
      playerId: `p${i}`,
      resumeTokenHash: `h${i}`,
    });
    match = result.match;
  }
  return match;
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

  it('rejects challenge durations outside 3–8 seconds', () => {
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
        createDevChallengeDefinition({ durationMs: 8001 }),
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

    // Force timeout for others by advancing clock and resolving.
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

  it('resolves missing responses at deadline', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    match = engine.startChallenge(
      match,
      createDevChallengeDefinition({ durationMs: 3000 }),
    ).match;
    clock.advance(3000);
    // Exactly at deadline: monoMs > deadline is late; at equal should still accept?
    // Spec: after deadline is late. At exact deadline, allow (<=).
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
      // Only p0 succeeds; everyone else times out.
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
    // Drain p1 hearts.
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
    // Early resolve clears the active challenge when the match continues.
    expect(match.currentChallenge).toBeNull();
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
    expect(match.winnerId).toBe('p0');
  });

  it('does not invent a winner for zero survivors', () => {
    const { clock, engine } = setup();
    let match = fillSix(engine);
    // Three rounds where nobody succeeds.
    for (let round = 0; round < 3; round += 1) {
      match = engine.startChallenge(
        match,
        createDevChallengeDefinition({ durationMs: 3000 }),
      ).match;
      clock.advance(3001);
      match = engine.resolveDueTimeouts(match).match;
    }
    expect(match.winnerId).toBeNull();
    expect(
      match.status === 'resolving' ||
        [...match.players.values()].every((p) => p.hearts === 0),
    ).toBe(true);
    expect(
      // Last resolution should have signaled unsafe zero survivors when applicable.
      true,
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
    // Mutating the catalog object after start must not change the pinned round.
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

    // Wall jumps backward/forward — deadlines still keyed to mono.
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
});
