import { ChallengeEvaluatorRegistryImpl } from '../dev-challenge.evaluator';
import { WaitForSignalEvaluator } from '../wait-for-signal.evaluator';
import { createLaunchEvaluators } from './launch-evaluators';
import { createAdvancedEvaluators } from './advanced-evaluators';
import { createPack31Evaluators } from './pack-31-evaluators';
import { MatchEngine, toPublicChallengeView } from '../match.engine';
import { FakeClock } from '../types';
import {
  LASER_ROUTING_SUCCESS_HOLD_MS,
  readInteractiveState,
  traceLasers,
} from '@thelastheart/contracts';
import type { MatchState } from '../types';

describe('laser.routing match behavior', () => {
  function engine(clock: FakeClock) {
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new WaitForSignalEvaluator());
    for (const e of createLaunchEvaluators()) registry.register(e);
    for (const e of createAdvancedEvaluators()) registry.register(e);
    for (const e of createPack31Evaluators()) registry.register(e);
    return new MatchEngine(clock, registry);
  }

  function fill(eng: MatchEngine, n: number) {
    let match = eng.createMatch('m-laser', {
      mode: 'quick_survival',
      playerCapacity: 6,
    });
    for (let i = 0; i < n; i += 1) {
      match = eng.joinPlayer(match, {
        playerId: `p${i}`,
        resumeTokenHash: `h${i}`,
      }).match;
      match = eng.acceptJoin(match, `p${i}`).match;
    }
    return match;
  }

  function solvePlayer(
    eng: MatchEngine,
    match: MatchState,
    playerId: string,
    clock: FakeClock,
  ): ReturnType<MatchEngine['submitAnswer']> {
    const player = match.currentChallenge!.laserRoutingState!.players[playerId]!;
    const solved = player.solvedState;
    const current = readInteractiveState(player.board);
    let last = {
      match,
      events: [] as ReturnType<MatchEngine['submitAnswer']>['events'],
      ack: { accepted: true },
      duplicate: false,
      liveUpdate: false,
    } as ReturnType<MatchEngine['submitAnswer']>;
    let cmd = 0;
    for (const [id, orientation] of Object.entries(solved.mirrors)) {
      if (current.mirrors[id] === orientation) continue;
      clock.advance(120);
      last = eng.submitAnswer(last.match, {
        playerId,
        challengeInstanceId: last.match.currentChallenge!.challengeInstanceId,
        commandId: `${playerId}-${cmd++}`,
        answer: { componentId: id, final: false },
      });
      expect(last.ack.accepted).toBe(true);
    }
    for (const [id, axis] of Object.entries(solved.gates)) {
      if (current.gates[id] === axis) continue;
      clock.advance(120);
      last = eng.submitAnswer(last.match, {
        playerId,
        challengeInstanceId: last.match.currentChallenge!.challengeInstanceId,
        commandId: `${playerId}-g-${cmd++}`,
        answer: { componentId: id, final: false },
      });
      expect(last.ack.accepted).toBe(true);
    }
    return last;
  }

  const definition = {
    definitionId: 'laser.routing.dev',
    definitionVersion: 1,
    engineId: 'laser.routing',
    durationMs: 15_000,
    heartPenaltyOnFailure: 1 as const,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.laser.classic.title',
    choiceKeys: [] as string[],
    clientConfig: {
      categoryKey: 'challenge.category.precision',
      titleKey: 'challenge.laser.classic.title',
      promptKey: 'challenge.laser.classic.prompt',
      assetIds: {
        laserLoopSfx: 'laser_routing.laser_loop',
        reflectionSfx: 'laser_routing.reflection',
        heartPowerOnSfx: 'laser_routing.heart_power_on',
      },
      variant: 'classic',
      startDelayMs: 0,
    },
    serverConfig: {
      variant: 'classic',
      startDelayMs: 0,
      seed: 4242,
      minRequiredMoves: 2,
      maxRequiredMoves: 5,
      requireUniqueSolution: true,
      difficulty: 'medium',
      assetIds: {
        laserLoopSfx: 'laser_routing.laser_loop',
        reflectionSfx: 'laser_routing.reflection',
        heartPowerOnSfx: 'laser_routing.heart_power_on',
      },
    },
    difficulty: 'medium' as const,
  };

  it('assigns independent puzzles for rooms of 2–6 without leaking boards', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const clock = new FakeClock(1_000_000);
      const eng = engine(clock);
      let match = fill(eng, n);
      match = eng.startChallenge(match, definition).match;
      const challenge = match.currentChallenge!;
      expect(challenge.laserRoutingState).toBeDefined();
      const seeds = new Set<number>();
      for (let i = 0; i < n; i += 1) {
        const view = toPublicChallengeView(challenge, clock.nowMs(), `p${i}`);
        expect(view.clientConfig['board']).toBeDefined();
        expect(view.clientConfig['seed']).toEqual(expect.any(Number));
        expect(view.clientConfig['solvedState']).toBeUndefined();
        seeds.add(view.clientConfig['seed'] as number);
      }
      expect(seeds.size).toBe(n);
      const shared = toPublicChallengeView(challenge, clock.nowMs());
      expect(shared.clientConfig['board']).toBeUndefined();
      expect(shared.clientConfig['seed']).toBeUndefined();
    }
  });

  it('completes one player while the other continues', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const player = match.currentChallenge!.laserRoutingState!.players['p0']!;
    const solved = player.solvedState;
    const current = readInteractiveState(player.board);
    let cmd = 0;
    for (const [id, orientation] of Object.entries(solved.mirrors)) {
      if (current.mirrors[id] === orientation) continue;
      clock.advance(120);
      const result = eng.submitAnswer(match, {
        playerId: 'p0',
        challengeInstanceId: match.currentChallenge!.challengeInstanceId,
        commandId: `p0-${cmd++}`,
        answer: { componentId: id, final: false },
      });
      expect(result.ack.accepted).toBe(true);
      match = result.match;
    }
    expect(
      match.currentChallenge?.laserRoutingState?.players['p0']?.result,
    ).toBe('success');
    expect(
      match.currentChallenge?.laserRoutingState?.players['p1']?.result,
    ).toBe('active');
    expect(
      traceLasers(
        match.currentChallenge!.laserRoutingState!.players['p1']!.board,
      ).success,
    ).toBe(false);
  });

  it('times out remaining players after the inclusive deadline', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    clock.advance(15_001);
    match = eng.resolveDueTimeouts(match).match;
    expect(
      match.currentChallenge?.laserRoutingState?.players['p0']?.result,
    ).toBe('timeout');
    const p0 = match.players.get('p0');
    expect(p0?.hearts).toBeLessThan(3);
  });

  it('accepts duplicate command ids idempotently and rejects invalid components', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const player = match.currentChallenge!.laserRoutingState!.players['p0']!;
    const mirror = player.board.components.find((c) => c.kind === 'mirror')!;
    const first = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'same-cmd',
      answer: { componentId: mirror.id, final: false },
    });
    expect(first.ack.accepted).toBe(true);
    match = first.match;
    const duplicate = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'same-cmd',
      answer: { componentId: mirror.id, final: false },
    });
    expect(duplicate.ack.accepted).toBe(true);
    expect(
      duplicate.match.currentChallenge!.laserRoutingState!.players['p0']!
        .stateSequence,
    ).toBe(
      match.currentChallenge!.laserRoutingState!.players['p0']!.stateSequence,
    );
    clock.advance(120);
    const invalid = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'bad-comp',
      answer: { componentId: 'nope', final: false },
    });
    expect(invalid.ack.accepted).toBe(false);
    expect(
      invalid.match.currentChallenge!.laserRoutingState!.players['p1']!.board,
    ).toEqual(match.currentChallenge!.laserRoutingState!.players['p1']!.board);
  });

  it('restores the same seed and orientations on a reconnect view', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const before = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs(),
      'p0',
    );
    const later = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs() + 2_000,
      'p0',
    );
    expect(later.clientConfig['seed']).toBe(before.clientConfig['seed']);
    expect(later.clientConfig['board']).toEqual(before.clientConfig['board']);
    expect(later.challengeInstanceId).toBe(before.challengeInstanceId);
  });

  it('holds the solved board for 1s after the last player succeeds', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;

    const first = solvePlayer(eng, match, 'p0', clock);
    match = first.match;
    expect(match.currentChallenge?.status).toBe('active');
    expect(
      match.currentChallenge?.laserRoutingState?.players['p0']?.result,
    ).toBe('success');

    const last = solvePlayer(eng, match, 'p1', clock);
    match = last.match;
    expect(last.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      false,
    );
    expect(last.liveUpdate).toBe(true);
    expect(match.currentChallenge?.status).toBe('active');
    expect(
      match.currentChallenge?.laserRoutingState?.players['p1']?.result,
    ).toBe('success');
    const holdAt =
      match.currentChallenge!.laserRoutingState!.successResolveAtMonoMs;
    expect(holdAt).toBe(clock.monoMs() + LASER_ROUTING_SUCCESS_HOLD_MS);
    const p1View = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs(),
      'p1',
    );
    expect(p1View.clientConfig['heartLit']).toBe(true);

    const early = eng.resolveDueLaserRoutingSuccess(match);
    expect(early.events).toHaveLength(0);

    clock.advance(LASER_ROUTING_SUCCESS_HOLD_MS - 1);
    expect(eng.resolveDueLaserRoutingSuccess(match).events).toHaveLength(0);

    clock.advance(1);
    const resolved = eng.resolveDueLaserRoutingSuccess(match);
    expect(resolved.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      true,
    );
    expect(resolved.match.currentChallenge?.status).toBe('resolved');
    const resolutions =
      resolved.match.lastRoundResult?.resolutions ??
      resolved.match.currentChallenge?.resolutions ??
      [];
    expect(resolutions.every((r) => r.outcome === 'success')).toBe(true);
  });
});
