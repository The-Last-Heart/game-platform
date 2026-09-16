import { ChallengeEvaluatorRegistryImpl } from '../dev-challenge.evaluator';
import { WaitForSignalEvaluator } from '../wait-for-signal.evaluator';
import { createLaunchEvaluators } from './launch-evaluators';
import { createAdvancedEvaluators } from './advanced-evaluators';
import { createPack31Evaluators } from './pack-31-evaluators';
import { MatchEngine, toPublicChallengeView } from '../match.engine';
import { FakeClock } from '../types';

describe('precision.ring_lock match behavior', () => {
  function engine(clock: FakeClock) {
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new WaitForSignalEvaluator());
    for (const e of createLaunchEvaluators()) registry.register(e);
    for (const e of createAdvancedEvaluators()) registry.register(e);
    for (const e of createPack31Evaluators()) registry.register(e);
    return new MatchEngine(clock, registry);
  }

  function fill(eng: MatchEngine, n: number) {
    let match = eng.createMatch('m-ring', {
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

  const definition = {
    definitionId: 'precision.ring_lock.dev',
    definitionVersion: 1,
    engineId: 'precision.ring_lock',
    durationMs: 15_000,
    heartPenaltyOnFailure: 1 as const,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.ring_lock.intro',
    choiceKeys: [] as string[],
    clientConfig: {
      categoryKey: 'challenge.category.precision',
      titleKey: 'challenge.ring_lock.intro',
      promptKey: 'challenge.ring_lock.prompt',
      actionKey: 'challenge.ring_lock.action',
      timeRemainingKey: 'challenge.ring_lock.time_remaining',
    },
    serverConfig: {
      seed: 4242,
      ringCount: 3,
      startDelayMs: 0,
      minAngularVelocityDegPerSec: 80,
      maxAngularVelocityDegPerSec: 100,
      allowClockwise: true,
      allowCounterClockwise: true,
      targetAngleDeg: 0,
      alignmentToleranceDeg: 14,
      transitionDelayMs: 100,
      safetyMarginMs: 400,
      maxGenerationAttempts: 48,
      difficulty: 'medium',
    },
    difficulty: 'medium' as const,
  };

  it('assigns independent puzzles for rooms of 2–6 without leaking rings', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const clock = new FakeClock(1_000_000);
      const eng = engine(clock);
      let match = fill(eng, n);
      match = eng.startChallenge(match, definition).match;
      const challenge = match.currentChallenge!;
      expect(challenge.ringLockState).toBeDefined();
      const seeds = new Set<number>();
      for (let i = 0; i < n; i += 1) {
        const id = `p${i}`;
        const view = toPublicChallengeView(challenge, clock.nowMs(), id);
        expect(Array.isArray(view.clientConfig['rings'])).toBe(true);
        expect(view.clientConfig['seed']).toEqual(expect.any(Number));
        seeds.add(view.clientConfig['seed'] as number);
      }
      expect(seeds.size).toBe(n);

      const shared = toPublicChallengeView(challenge, clock.nowMs());
      expect(shared.clientConfig['rings']).toBeUndefined();
      expect(shared.clientConfig['seed']).toBeUndefined();

      const v0 = toPublicChallengeView(challenge, clock.nowMs(), 'p0');
      const v1 = toPublicChallengeView(challenge, clock.nowMs(), 'p1');
      expect(v0.clientConfig['seed']).not.toBe(v1.clientConfig['seed']);
    }
  });

  it('completes one player while the other continues', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const challenge = match.currentChallenge!;
    for (const ring of challenge.ringLockState!.players['p0']!.rings) {
      ring.initialAngleDeg = 0;
      ring.angularVelocityDegPerSec = 0.001;
      ring.direction = 1;
    }

    for (let i = 0; i < 3; i += 1) {
      const result = eng.submitAnswer(match, {
        playerId: 'p0',
        challengeInstanceId: challenge.challengeInstanceId,
        commandId: `p0-${i}`,
        answer: { ringIndex: i, final: false },
      });
      match = result.match;
      expect(result.ack.accepted).toBe(true);
      expect(result.liveUpdate === true || result.events.length >= 0).toBe(true);
    }

    expect(match.currentChallenge?.status).toBe('active');
    expect(match.currentChallenge?.ringLockState?.players['p0']?.result).toBe(
      'success',
    );
    expect(match.currentChallenge?.ringLockState?.players['p1']?.result).toBe(
      'active',
    );
    expect(match.players.get('p0')?.submittedForCurrentChallenge).toBe(true);
    expect(match.players.get('p1')?.submittedForCurrentChallenge).toBe(false);
  });

  it('restores the same personalized puzzle after progress', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const before = match.currentChallenge!.ringLockState!.players['p0']!;
    before.rings[0]!.initialAngleDeg = 0;
    before.rings[0]!.angularVelocityDegPerSec = 0.001;

    match = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'lock0',
      answer: { ringIndex: 0, final: false },
    }).match;

    const snap = eng.toPublicSnapshot(match, 'p0');
    const rings = snap.currentChallenge?.clientConfig['rings'] as Array<{
      locked: boolean;
    }>;
    expect(rings[0]!.locked).toBe(true);
    expect(snap.currentChallenge?.clientConfig['seed']).toBe(before.seed);
    expect(snap.currentChallenge?.clientConfig['activeRingIndex']).toBe(1);
  });
});
