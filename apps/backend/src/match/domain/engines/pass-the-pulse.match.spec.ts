import { ChallengeEvaluatorRegistryImpl } from '../dev-challenge.evaluator';
import { WaitForSignalEvaluator } from '../wait-for-signal.evaluator';
import { createLaunchEvaluators } from './launch-evaluators';
import { createAdvancedEvaluators } from './advanced-evaluators';
import { createPack31Evaluators } from './pack-31-evaluators';
import { MatchEngine, toPublicChallengeView } from '../match.engine';
import { FakeClock } from '../types';

describe('social.pass_the_pulse match behavior', () => {
  function engine(clock: FakeClock) {
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new WaitForSignalEvaluator());
    for (const e of createLaunchEvaluators()) registry.register(e);
    for (const e of createAdvancedEvaluators()) registry.register(e);
    for (const e of createPack31Evaluators()) registry.register(e);
    return new MatchEngine(clock, registry);
  }

  function fill(eng: MatchEngine, n: number) {
    let match = eng.createMatch('m-pulse', {
      mode: 'quick_survival',
      playerCapacity: 6,
    });
    for (let i = 0; i < n; i += 1) {
      match = eng.joinPlayer(match, {
        playerId: `p${i}`,
        resumeTokenHash: `h${i}`,
        displayName: i === 0 ? 'وجدي' : `Player ${i}`,
      }).match;
      match = eng.acceptJoin(match, `p${i}`).match;
    }
    return match;
  }

  const definition = {
    definitionId: 'social.pass_the_pulse.dev',
    definitionVersion: 1,
    engineId: 'social.pass_the_pulse',
    durationMs: 15000,
    heartPenaltyOnFailure: 1 as const,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.pass_the_pulse.intro',
    choiceKeys: [] as string[],
    clientConfig: {
      categoryKey: 'challenge.category.social',
      titleKey: 'challenge.pass_the_pulse.intro',
      promptKey: 'challenge.pass_the_pulse.prompt',
      actionKey: 'challenge.pass_the_pulse.action',
      youKey: 'challenge.pass_the_pulse.you',
      timeRemainingKey: 'challenge.pass_the_pulse.time_remaining',
    },
    serverConfig: {
      startDelayMs: 500,
      segmentDurationMs: 1500,
      hitWindowEarlyMs: 200,
      hitWindowLateMs: 200,
      resultTransitionMs: 400,
      seed: 7,
    },
  };

  it('freezes display names and excludes spectators from the route', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 3);
    match = eng.joinPlayer(match, {
      playerId: 'spec',
      resumeTokenHash: 'hs',
      displayName: 'Spectator',
    }).match;
    match = eng.acceptJoin(match, 'spec').match;
    match.players.get('spec')!.status = 'spectator';

    match = eng.startChallenge(match, definition).match;
    const state = match.currentChallenge!.passThePulseState!;
    expect(state.routePlayerIds).toHaveLength(3);
    expect(state.routePlayerIds).not.toContain('spec');
    expect(state.participants.every((p) => p.displayName.length > 0)).toBe(
      true,
    );
    expect(state.participants.find((p) => p.playerId === 'p0')?.displayName).toBe(
      'وجدي',
    );

    const view = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs(),
      'p0',
    );
    expect(view.clientConfig['participants']).toEqual(state.participants);
    // Studio active time stays authoritative (not rewritten from pulse math).
    expect(view.durationMs).toBe(15000);
    expect(match.currentChallenge!.definition.durationMs).toBe(15000);
    expect(
      match.currentChallenge!.deadlineAtMs - match.currentChallenge!.startsAtMs,
    ).toBe(15000);
  });

  it('accepts a hit, rejects non-target and duplicate command ids', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const state = match.currentChallenge!.passThePulseState!;
    const target = state.currentTargetPlayerId!;
    const legId = state.currentLegId!;
    const leg = state.legs.find((l) => l.legId === legId)!;

    clock.advance(leg.windowOpensMonoMs - clock.monoMs());
    const other = target === 'p0' ? 'p1' : 'p0';
    const rejected = eng.submitAnswer(match, {
      playerId: other,
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'cmd-other',
      answer: { legId },
    });
    expect(rejected.ack.accepted).toBe(false);
    expect(rejected.ack.reason).toBe('not_your_turn');

    const hit = eng.submitAnswer(rejected.match, {
      playerId: target,
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'cmd-hit',
      answer: { legId },
    });
    expect(hit.ack.accepted).toBe(true);
    expect(hit.liveUpdate).toBe(true);
    expect(hit.match.currentChallenge!.passThePulseState!.results[target]).toBe(
      'hit',
    );

    const dup = eng.submitAnswer(hit.match, {
      playerId: target,
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'cmd-hit',
      answer: { legId },
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.ack.accepted).toBe(true);
  });

  it('continues after a miss and resumes the same route', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 3);
    match = eng.startChallenge(match, definition).match;
    const before = match.currentChallenge!.passThePulseState!;
    const route = [...before.routePlayerIds];
    const first = before.legs[0]!;

    clock.advance(first.windowClosesMonoMs + 1 - clock.monoMs());
    const tick = eng.resolveDuePassThePulse(match);
    expect(tick.liveUpdate).toBe(true);
    // Window expiry does not fail the seat — pulse loops to the next waiting.
    expect(
      tick.match.currentChallenge!.passThePulseState!.results[first.playerId],
    ).toBe('waiting');
    expect(
      tick.match.currentChallenge!.passThePulseState!.routePlayerIds,
    ).toEqual(route);
    expect(
      tick.match.currentChallenge!.passThePulseState!.currentTargetPlayerId,
    ).not.toBe(first.playerId);

    // Simulate disconnect/resume: public view still exposes the same timeline.
    const view = toPublicChallengeView(
      tick.match.currentChallenge!,
      clock.nowMs(),
      first.playerId,
    );
    expect(view.clientConfig['routePlayerIds']).toEqual(route);
    expect(view.clientConfig['pulseStartAtMs']).toBe(before.pulseStartAtMs);
  });

  it('resolves per-player hit/miss outcomes at the end', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const state = match.currentChallenge!.passThePulseState!;
    const leg0 = state.legs[0]!;

    clock.advance(leg0.windowOpensMonoMs - clock.monoMs());
    match = eng.submitAnswer(match, {
      playerId: leg0.playerId,
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'cmd-0',
      answer: { legId: leg0.legId },
    }).match;

    const afterHit = match.currentChallenge!.passThePulseState!;
    const otherId = afterHit.routePlayerIds.find((id) => id !== leg0.playerId)!;
    // Other seat never presses — global deadline marks them missed only.
    clock.advance(match.currentChallenge!.deadlineMonoMs + 1 - clock.monoMs());
    const resolved = eng.resolveDueTimeouts(match);
    const resolvedEvent = resolved.events.find(
      (e) => e.kind === 'challenge_resolved',
    );
    expect(resolvedEvent).toBeTruthy();
    if (!resolvedEvent || resolvedEvent.kind !== 'challenge_resolved') return;
    const byId = Object.fromEntries(
      resolvedEvent.resolutions.map((r) => [r.playerId, r.outcome]),
    );
    expect(byId[leg0.playerId]).toBe('success');
    expect(byId[otherId]).toBe('failure');
  });

  it('early wrong-time press fails only that player', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const state = match.currentChallenge!.passThePulseState!;
    const leg0 = state.legs[0]!;

    // Tap before window opens → miss for target only.
    clock.advance(leg0.travelStartMonoMs + 50 - clock.monoMs());
    match = eng.submitAnswer(match, {
      playerId: leg0.playerId,
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'cmd-early',
      answer: { legId: leg0.legId },
    }).match;
    const mid = match.currentChallenge!.passThePulseState!;
    expect(mid.results[leg0.playerId]).toBe('missed');
    const otherId = mid.routePlayerIds.find((id) => id !== leg0.playerId)!;
    expect(mid.results[otherId]).toBe('waiting');
    expect(mid.currentTargetPlayerId).toBe(otherId);

    const otherLeg = mid.legs.find((l) => l.legId === mid.currentLegId)!;
    clock.advance(otherLeg.windowOpensMonoMs - clock.monoMs());
    match = eng.submitAnswer(match, {
      playerId: otherId,
      challengeInstanceId: match.currentChallenge!.challengeInstanceId,
      commandId: 'cmd-hit',
      answer: { legId: otherLeg.legId },
    }).match;
    clock.advance(
      match.currentChallenge!.passThePulseState!.completeResolveAtMonoMs! -
        clock.monoMs(),
    );
    const resolved = eng.resolveDuePassThePulse(match);
    const resolvedEvent = resolved.events.find(
      (e) => e.kind === 'challenge_resolved',
    );
    expect(resolvedEvent).toBeTruthy();
    if (!resolvedEvent || resolvedEvent.kind !== 'challenge_resolved') return;
    const byId = Object.fromEntries(
      resolvedEvent.resolutions.map((r) => [r.playerId, r.outcome]),
    );
    expect(byId[leg0.playerId]).toBe('failure');
    expect(byId[otherId]).toBe('success');
  });

  it('expires the challenge at the global deadline', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    clock.advance(match.currentChallenge!.deadlineMonoMs + 1 - clock.monoMs());
    const timed = eng.resolveDueTimeouts(match);
    expect(timed.events.some((e) => e.kind === 'challenge_resolved')).toBe(
      true,
    );
  });
});
