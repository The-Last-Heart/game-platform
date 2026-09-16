import { COMPLETE_SUM_DEFAULT_GENERATION_RULES } from '@thelastheart/contracts';
import { ChallengeEvaluatorRegistryImpl } from '../dev-challenge.evaluator';
import { WaitForSignalEvaluator } from '../wait-for-signal.evaluator';
import { createLaunchEvaluators } from './launch-evaluators';
import { createAdvancedEvaluators } from './advanced-evaluators';
import { createPack31Evaluators } from './pack-31-evaluators';
import { MatchEngine, toPublicChallengeView } from '../match.engine';
import { FakeClock } from '../types';

describe('logic.complete_sum match behavior', () => {
  function engine(clock: FakeClock) {
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new WaitForSignalEvaluator());
    for (const e of createLaunchEvaluators()) registry.register(e);
    for (const e of createAdvancedEvaluators()) registry.register(e);
    for (const e of createPack31Evaluators()) registry.register(e);
    return new MatchEngine(clock, registry);
  }

  function fill(eng: MatchEngine, n: number) {
    let match = eng.createMatch('m-sum', {
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
    definitionId: 'logic.complete_sum.dev',
    definitionVersion: 1,
    engineId: 'logic.complete_sum',
    durationMs: 15000,
    heartPenaltyOnFailure: 1 as const,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.complete_sum.intro',
    choiceKeys: [] as string[],
    clientConfig: {
      categoryKey: 'challenge.category.logic',
      titleKey: 'challenge.complete_sum.intro',
      promptKey: 'challenge.complete_sum.prompt',
      currentTotalKey: 'challenge.complete_sum.current_total',
      chooseNumberKey: 'challenge.complete_sum.choose',
      readyKey: 'challenge.complete_sum.ready',
      thinkingKey: 'challenge.complete_sum.thinking',
      youKey: 'challenge.complete_sum.you',
    },
    serverConfig: {
      seed: 1001,
      maxGenerationAttempts: 48,
      generationRules: COMPLETE_SUM_DEFAULT_GENERATION_RULES,
    },
    difficulty: 'hard' as const,
  };

  it('initializes null selections and private choices; hides solution', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 3);
    match = eng.startChallenge(match, definition).match;
    const challenge = match.currentChallenge!;
    expect(challenge.completeSumState).toBeDefined();
    const state = challenge.completeSumState!;
    expect(state.participantIds).toHaveLength(3);
    expect(state.currentTotal).toBe(0);
    expect(state.allSelected).toBe(false);
    for (const id of state.participantIds) {
      expect(state.selections[id]).toBeNull();
    }

    const view = toPublicChallengeView(challenge, clock.nowMs(), 'p0');
    expect(view.clientConfig['myChoices']).toEqual(
      state.optionsByPlayerId['p0'],
    );
    expect(view.clientConfig['selections']).toEqual(state.selections);
    expect(JSON.stringify(view)).not.toContain('solutionByPlayerId');
    expect(view.clientConfig['hidden']).toBeUndefined();
    expect(view.clientConfig['optionsByPlayerId']).toBeUndefined();

    const other = toPublicChallengeView(challenge, clock.nowMs(), 'p1');
    expect(other.clientConfig['myChoices']).toEqual(
      state.optionsByPlayerId['p1'],
    );
    expect(other.clientConfig['myChoices']).not.toEqual(
      view.clientConfig['myChoices'],
    );
  });

  it('accepts valid selection including zero, replaces, and recalculates', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, {
      ...definition,
      serverConfig: { ...definition.serverConfig, seed: 55 },
    }).match;
    const challenge = match.currentChallenge!;
    const state = challenge.completeSumState!;
    const choices0 = state.optionsByPlayerId['p0']!;
    const first = choices0[0]!;
    const second = choices0[1]!;

    let result = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'c1',
      answer: { selectedValue: first, final: false },
    });
    expect(result.ack.accepted).toBe(true);
    expect(result.liveUpdate).toBe(true);
    expect(result.match.currentChallenge!.completeSumState!.currentTotal).toBe(
      first,
    );

    result = eng.submitAnswer(result.match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'c2',
      answer: { selectedValue: second, final: false },
    });
    expect(result.ack.accepted).toBe(true);
    expect(result.match.currentChallenge!.completeSumState!.currentTotal).toBe(
      second,
    );

    if (choices0.includes(0)) {
      result = eng.submitAnswer(result.match, {
        playerId: 'p0',
        challengeInstanceId: challenge.challengeInstanceId,
        commandId: 'c0',
        answer: { selectedValue: 0, final: false },
      });
      expect(result.ack.accepted).toBe(true);
      expect(
        result.match.currentChallenge!.completeSumState!.selections['p0'],
      ).toBe(0);
    }
  });

  it('rejects invalid value, spectator, and malformed answers', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.joinPlayer(match, {
      playerId: 'spec',
      resumeTokenHash: 'hs',
    }).match;
    match = eng.acceptJoin(match, 'spec').match;
    // Force spectator
    match.players.get('spec')!.status = 'spectator';
    match.players.get('spec')!.hearts = 0;

    match = eng.startChallenge(match, definition).match;
    const challenge = match.currentChallenge!;

    const bad = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'bad',
      answer: { selectedValue: 999, final: false },
    });
    expect(bad.ack.accepted).toBe(false);
    expect(bad.ack.reason).toBe('invalid_value');

    const malformed = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'mal',
      answer: { nope: true },
    });
    expect(malformed.ack.accepted).toBe(false);

    expect(() =>
      eng.submitAnswer(match, {
        playerId: 'spec',
        challengeInstanceId: challenge.challengeInstanceId,
        commandId: 'sp',
        answer: { selectedValue: 1, final: false },
      }),
    ).toThrow();
  });

  it('duplicate commandId is idempotent', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const challenge = match.currentChallenge!;
    const value = challenge.completeSumState!.optionsByPlayerId['p0']![0]!;

    const first = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'same',
      answer: { selectedValue: value, final: false },
    });
    const second = eng.submitAnswer(first.match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'same',
      answer: { selectedValue: value, final: false },
    });
    expect(second.duplicate).toBe(true);
    expect(second.ack).toEqual(first.ack);
  });

  it('does not succeed on partial total match', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 3);
    match = eng.startChallenge(match, {
      ...definition,
      serverConfig: { ...definition.serverConfig, seed: 9 },
    }).match;
    const challenge = match.currentChallenge!;
    const state = challenge.completeSumState!;
    // Pick values that could theoretically equal target alone if mis-checked.
    const v0 = state.optionsByPlayerId['p0']![0]!;
    const result = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'partial',
      answer: { selectedValue: v0, final: false },
    });
    expect(result.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      false,
    );
    expect(result.match.currentChallenge!.status).toBe('active');
  });

  it('defers resolve after target hit so success motion can play', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, {
      ...definition,
      serverConfig: { ...definition.serverConfig, seed: 77 },
    }).match;
    const challenge = match.currentChallenge!;
    const state = challenge.completeSumState!;
    const solution = state.hidden.solutionByPlayerId;

    let result = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 's0',
      answer: { selectedValue: solution['p0'], final: false },
    });
    expect(result.match.currentChallenge!.status).toBe('active');

    result = eng.submitAnswer(result.match, {
      playerId: 'p1',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 's1',
      answer: { selectedValue: solution['p1'], final: false },
    });
    expect(result.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      false,
    );
    expect(result.liveUpdate).toBe(true);
    expect(result.match.currentChallenge!.status).toBe('active');
    expect(
      result.match.currentChallenge!.completeSumState!.successResolveAtMonoMs,
    ).toBeGreaterThan(clock.monoMs());

    const early = eng.resolveDueCompleteSumSuccess(result.match);
    expect(early.events).toHaveLength(0);

    clock.advance(1500);
    const resolved = eng.resolveDueCompleteSumSuccess(result.match);
    expect(resolved.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      true,
    );
    const resolutions =
      resolved.match.lastRoundResult?.resolutions ??
      resolved.match.currentChallenge?.resolutions ??
      [];
    expect(resolutions.every((r) => r.outcome === 'success')).toBe(true);
  });

  it('all selected with wrong total stays active until deadline', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, {
      ...definition,
      serverConfig: { ...definition.serverConfig, seed: 12 },
    }).match;
    const challenge = match.currentChallenge!;
    const state = challenge.completeSumState!;
    const opts0 = state.optionsByPlayerId['p0']!;
    const opts1 = state.optionsByPlayerId['p1']!;
    // Force wrong sum: pick max from each if that exceeds / differs from target.
    let v0 = opts0[opts0.length - 1]!;
    let v1 = opts1[opts1.length - 1]!;
    if (v0 + v1 === state.target) {
      v0 = opts0[0]!;
      v1 = opts1[0]!;
      if (v0 + v1 === state.target && opts0.length > 1) {
        v0 = opts0[1]!;
      }
    }
    if (v0 + v1 === state.target) {
      // Rare: skip assertion of wrong path if all pairs match (shouldn't).
      return;
    }

    let result = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'w0',
      answer: { selectedValue: v0, final: false },
    });
    result = eng.submitAnswer(result.match, {
      playerId: 'p1',
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'w1',
      answer: { selectedValue: v1, final: false },
    });
    expect(result.match.currentChallenge!.status).toBe('active');
    expect(
      result.match.currentChallenge!.completeSumState!.incorrectTotal,
    ).toBe(true);
    expect(result.liveUpdate).toBe(true);
  });

  it('deadline failure resolves participants', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    clock.advance(15001);
    const timed = eng.resolveDueTimeouts(match);
    expect(timed.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      true,
    );
  });

  it('freezes participants and preserves selection across clone/resume view', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 4);
    match = eng.startChallenge(match, {
      ...definition,
      serverConfig: { ...definition.serverConfig, seed: 3 },
    }).match;
    const frozen = [
      ...match.currentChallenge!.completeSumState!.participantIds,
    ];
    const value =
      match.currentChallenge!.completeSumState!.optionsByPlayerId['p0']![0]!;
    match = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'keep',
      answer: { selectedValue: value, final: false },
    }).match;

    // Disconnect presence should not regenerate the round.
    match.players.get('p1')!.presence = 'disconnected';
    expect(match.currentChallenge!.completeSumState!.participantIds).toEqual(
      frozen,
    );
    expect(match.currentChallenge!.completeSumState!.selections['p0']).toBe(
      value,
    );

    const resumeView = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs(),
      'p0',
    );
    expect(resumeView.clientConfig['target']).toBe(
      match.currentChallenge!.completeSumState!.target,
    );
    expect(resumeView.clientConfig['selections']).toEqual(
      match.currentChallenge!.completeSumState!.selections,
    );
    expect(resumeView.clientConfig['myChoices']).toEqual(
      match.currentChallenge!.completeSumState!.optionsByPlayerId['p0'],
    );
  });

  it.each([2, 3, 4, 5, 6])('supports %i active players', (n) => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, n);
    match = eng.startChallenge(match, {
      ...definition,
      serverConfig: { ...definition.serverConfig, seed: n * 17 },
    }).match;
    expect(
      match.currentChallenge!.completeSumState!.participantIds,
    ).toHaveLength(n);
    expect(
      Object.keys(match.currentChallenge!.completeSumState!.optionsByPlayerId),
    ).toHaveLength(n);
  });
});
