import { ChallengeEvaluatorRegistryImpl } from './dev-challenge.evaluator';
import { WaitForSignalEvaluator } from './wait-for-signal.evaluator';
import { createLaunchEvaluators } from './engines/launch-evaluators';
import { createAdvancedEvaluators } from './engines/advanced-evaluators';
import { createPack31Evaluators } from './engines/pack-31-evaluators';
import { MatchEngine, toPublicChallengeView } from './match.engine';
import { FakeClock, MATCH_PLAYER_CAPACITY } from './types';

describe('per-seat challenge variants', () => {
  function engine(clock: FakeClock) {
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new WaitForSignalEvaluator());
    for (const e of createLaunchEvaluators()) registry.register(e);
    for (const e of createAdvancedEvaluators()) registry.register(e);
    for (const e of createPack31Evaluators()) registry.register(e);
    return new MatchEngine(clock, registry);
  }

  function fillTwo(eng: MatchEngine) {
    let match = eng.createMatch('m-seat', {
      mode: 'quick_survival',
      playerCapacity: 6,
    });
    for (let i = 0; i < 2; i += 1) {
      match = eng.joinPlayer(match, {
        playerId: `p${i}`,
        resumeTokenHash: `h${i}`,
      }).match;
      match = eng.acceptJoin(match, `p${i}`).match;
    }
    expect(match.players.size).toBeLessThanOrEqual(MATCH_PLAYER_CAPACITY);
    return match;
  }

  it('assigns distinct wait_for_signal delays and tokens per seat', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const def = {
      definitionId: 'reaction.wait_for_signal.dev',
      definitionVersion: 1,
      engineId: 'reaction.wait_for_signal',
      durationMs: 5000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.wait_for_signal.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.reaction',
        waitingPromptKey: 'challenge.wait_for_signal.waiting',
        waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
        activePromptKey: 'challenge.wait_for_signal.active',
        actionKey: 'challenge.wait_for_signal.action',
      },
      serverConfig: {
        signalDelayMs: 1500,
        signalWindowMs: 750,
        signalDelayRangeMs: { min: 800, max: 2600 },
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    expect(challenge.seatVariants?.size).toBe(2);
    const seats = [...challenge.seatVariants!.entries()];
    expect(seats[0]![1].signalToken).not.toBe(seats[1]![1].signalToken);
    expect(seats[0]![1].signalAtMonoMs).not.toBe(seats[1]![1].signalAtMonoMs);

    const viewA = toPublicChallengeView(challenge, clock.nowMs(), seats[0]![0]);
    expect(viewA.roundPhase).toBe('waiting_signal');
    expect(viewA.signalToken).toBeUndefined();
  });

  it('assigns the same tilt target to every seat and evaluates against it', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const def = {
      definitionId: 'motion.tilt_balance.dev',
      definitionVersion: 1,
      engineId: 'motion.tilt_balance',
      durationMs: 6000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.tilt.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.motion',
        promptKey: 'challenge.tilt.prompt',
      },
      serverConfig: {
        targetX: 0.35,
        targetY: 0,
        holdMs: 500,
        varianceTolerance: 0.25,
        targetVariants: [
          { targetX: 0.5, targetY: 0, targetShape: 'circle' },
          { targetX: -0.5, targetY: 0, targetShape: 'square' },
        ],
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [idA, seatA] = [...challenge.seatVariants!.entries()][0]!;
    const [idB, seatB] = [...challenge.seatVariants!.entries()][1]!;
    expect(seatA.clientOverlay['targetX']).toBe(seatB.clientOverlay['targetX']);
    expect(seatA.clientOverlay['targetY']).toBe(seatB.clientOverlay['targetY']);
    const pubA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    const pubB = toPublicChallengeView(challenge, clock.nowMs(), idB);
    const pubRoom = toPublicChallengeView(challenge, clock.nowMs());
    expect(pubA.clientConfig['targetX']).toBe(seatA.clientOverlay['targetX']);
    expect(pubB.clientConfig['targetX']).toBe(pubA.clientConfig['targetX']);
    expect(pubRoom.clientConfig['targetX']).toBe(pubA.clientConfig['targetX']);

    match = eng.submitAnswer(match, {
      playerId: idA,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a',
      answer: {
        finalX: seatA.serverOverlay['targetX'],
        finalY: seatA.serverOverlay['targetY'],
        heldMs: 600,
      },
    }).match;
    match = eng.submitAnswer(match, {
      playerId: idB,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b',
      answer: {
        finalX: seatB.serverOverlay['targetX'],
        finalY: seatB.serverOverlay['targetY'],
        heldMs: 600,
      },
    }).match;
    const resolutions =
      match.currentChallenge?.resolutions ??
      match.lastRoundResult?.resolutions ??
      [];
    expect(resolutions).toHaveLength(2);
    expect(resolutions.every((r) => r.outcome === 'success')).toBe(true);
  });

  it('pair_sync selects exactly two participants and skips waiters on resolve', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair', {
      mode: 'quick_survival',
      playerCapacity: 6,
    });
    for (let i = 0; i < 4; i += 1) {
      match = eng.joinPlayer(match, {
        playerId: `p${i}`,
        resumeTokenHash: `h${i}`,
        displayName: ['Host', 'Guest', 'Nour', 'Lina'][i],
      }).match;
      match = eng.acceptJoin(match, `p${i}`).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 5000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    expect(challenge.participatingPlayerIds).toHaveLength(2);
    expect(challenge.pairAssignments?.size).toBe(2);
    expect(challenge.seatVariants?.size).toBe(4);

    const [a, b] = challenge.participatingPlayerIds;
    const waiters = [...match.players.keys()].filter(
      (id) => !challenge.participatingPlayerIds.includes(id),
    );
    expect(waiters).toHaveLength(2);

    // Prior meter progress on waiters must survive when the pair fails/timeouts.
    match.players.get(waiters[0]!)!.energy = 2;
    match.players.get(waiters[1]!)!.energy = 3;

    const viewA = toPublicChallengeView(challenge, clock.nowMs(), a!);
    expect(viewA.clientConfig['isParticipant']).toBe(true);
    expect(viewA.clientConfig['partnerPlayerId']).toBe(b);
    expect(viewA.clientConfig['togetherMs']).toBe(3000);
    expect(viewA.durationMs).toBe(5000);
    const viewW = toPublicChallengeView(challenge, clock.nowMs(), waiters[0]!);
    expect(viewW.clientConfig['isParticipant']).toBe(false);

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a',
      answer: { synced: true, heldMs: 4000, final: true },
    }).match;
    // Partner silent → submitter succeeds; partner timeouts; waiters untouched.
    clock.advance(6000);
    match = eng.resolveDueTimeouts(match).match;
    const byId = Object.fromEntries(
      [...match.players.values()].map((p) => [p.playerId, p.hearts]),
    );
    expect(byId[a!]).toBe(3); // submitter fair success
    expect(byId[b!]).toBe(2); // partner timeout
    expect(byId[waiters[0]!]).toBe(3);
    expect(byId[waiters[1]!]).toBe(3);
    expect(match.players.get(waiters[0]!)!.energy).toBe(2);
    expect(match.players.get(waiters[1]!)!.energy).toBe(3);

    const resolutions =
      match.lastRoundResult?.resolutions ??
      match.currentChallenge?.resolutions ??
      [];
    expect(resolutions).toHaveLength(4);
    expect(resolutions.find((r) => r.playerId === waiters[0]!)).toMatchObject({
      outcome: 'skipped_spectator',
      energyDelta: 0,
      energyAfter: 2,
      heartsDelta: 0,
    });
    expect(resolutions.find((r) => r.playerId === waiters[1]!)).toMatchObject({
      outcome: 'skipped_spectator',
      energyDelta: 0,
      energyAfter: 3,
      heartsDelta: 0,
    });
  });

  it('pair_sync gives both seats the same outcome when both submit', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-shared', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id === 'p0' ? 'Host' : 'Guest',
      }).match;
      match = eng.acceptJoin(match, id).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;
    const t0 = clock.monoMs();

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: t0 + 100,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: t0 + 100,
    }).match;
    clock.advance(3200);
    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-hold',
      answer: { synced: true, heldMs: 3200, holding: true, final: false },
      receivedMonoMs: clock.monoMs(),
    }).match;

    const resolutions =
      match.lastRoundResult?.resolutions ??
      match.currentChallenge?.resolutions ??
      [];
    expect(resolutions).toHaveLength(2);
    expect(resolutions.map((r) => r.outcome)).toEqual(['success', 'success']);
    expect(match.players.get(a!)!.hearts).toBe(3);
    expect(match.players.get(b!)!.hearts).toBe(3);
  });

  it('pair_sync ignores a legacy client auto-complete so overlap can finish', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-legacy-final', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id === 'p0' ? 'Host' : 'Guest',
      }).match;
      match = eng.acceptJoin(match, id).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;
    const t0 = clock.monoMs();

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: t0,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: t0,
    }).match;
    clock.advance(2800);
    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-legacy-final',
      answer: { synced: true, heldMs: 2800, holding: false, final: true },
      receivedMonoMs: clock.monoMs(),
    }).match;
    expect(match.currentChallenge?.status).toBe('active');
    clock.advance(400);
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b-hold',
      answer: { synced: true, heldMs: 3200, holding: true, final: false },
      receivedMonoMs: clock.monoMs(),
    }).match;

    const resolutions =
      match.lastRoundResult?.resolutions ??
      match.currentChallenge?.resolutions ??
      [];
    expect(resolutions.map((r) => r.outcome)).toEqual(['success', 'success']);
  });

  it('pair_sync does not resolve on a brief tap; overlap must reach togetherMs', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-tap', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id === 'p0' ? 'Host' : 'Guest',
      }).match;
      match = eng.acceptJoin(match, id).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a',
      answer: { synced: true, heldMs: 80, holding: false, final: true },
      receivedMonoMs: clock.monoMs() + 300,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b',
      answer: { synced: true, heldMs: 90, holding: false, final: true },
      receivedMonoMs: clock.monoMs() + 420,
    }).match;

    expect(match.currentChallenge?.status).toBe('active');
    expect(match.players.get(a!)!.hearts).toBe(3);
    expect(match.players.get(b!)!.hearts).toBe(3);
  });

  it('pair_sync still succeeds if one seat slips then taps again', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-slip', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id === 'p0' ? 'Host' : 'Guest',
      }).match;
      match = eng.acceptJoin(match, id).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;
    const t0 = clock.monoMs();

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: t0,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: t0,
    }).match;
    clock.advance(1000);
    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-up',
      answer: { synced: true, heldMs: 1000, holding: false, final: false },
      receivedMonoMs: clock.monoMs(),
    }).match;
    expect(match.currentChallenge?.status).toBe('active');
    clock.advance(200);
    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-down-2',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: clock.monoMs(),
    }).match;
    clock.advance(2000);
    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-hold',
      answer: { synced: true, heldMs: 2000, holding: true, final: false },
      receivedMonoMs: clock.monoMs(),
    }).match;

    expect(match.players.get(a!)!.hearts).toBe(3);
    expect(match.players.get(b!)!.hearts).toBe(3);
  });

  it('pair_sync fails both when overlapping taps never reach togetherMs', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-desync', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id === 'p0' ? 'Host' : 'Guest',
      }).match;
      match = eng.acceptJoin(match, id).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a',
      answer: { synced: true, heldMs: 80, holding: false, final: false },
      receivedMonoMs: clock.monoMs() + 200,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b',
      answer: { synced: true, heldMs: 80, holding: false, final: false },
      receivedMonoMs: clock.monoMs() + 900,
    }).match;
    clock.advance(9000);
    match = eng.resolveDueTimeouts(match).match;

    expect(match.players.get(a!)!.hearts).toBe(2);
    expect(match.players.get(b!)!.hearts).toBe(2);
  });

  it('pair_sync keeps the first press stamp across progress updates', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-stamp', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id === 'p0' ? 'Host' : 'Guest',
      }).match;
      match = eng.acceptJoin(match, id).match;
    }
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
      },
      serverConfig: { togetherMs: 3000, syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;
    const viewA = toPublicChallengeView(challenge, clock.nowMs(), b!);
    expect(viewA.clientConfig['partnerHolding']).toBe(false);

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-down',
      answer: { synced: true, heldMs: 0, holding: true, final: false },
      receivedMonoMs: clock.monoMs() + 200,
    }).match;
    const overlayForB = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs(),
      b!,
    );
    expect(overlayForB.clientConfig['partnerHolding']).toBe(true);

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-hold',
      answer: { synced: true, heldMs: 1800, holding: true, final: false },
      receivedMonoMs: clock.monoMs() + 2000,
    }).match;
    expect(match.currentChallenge!.submissions.get(a!)!.receivedMonoMs).toBe(
      clock.monoMs() + 200,
    );

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a-up',
      answer: { synced: true, heldMs: 1900, holding: false, final: false },
      receivedMonoMs: clock.monoMs() + 2100,
    }).match;
    expect(match.currentChallenge!.submissions.get(a!)!.receivedMonoMs).toBe(
      clock.monoMs() + 200,
    );
    expect(match.currentChallenge!.submissions.get(a!)!.final).toBe(false);
    expect(
      toPublicChallengeView(match.currentChallenge!, clock.nowMs(), b!)
        .clientConfig['partnerHolding'],
    ).toBe(false);
    expect(match.currentChallenge?.status).toBe('active');
  });

  it('assigns opposite horizontal reverse-swipe directions per seat', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const def = {
      definitionId: 'gesture.reverse_swipe.dev',
      definitionVersion: 1,
      engineId: 'gesture.reverse_swipe',
      durationMs: 5000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.reverse_swipe.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        promptKey: 'challenge.reverse_swipe.prompt',
        displayedDirection: 'right',
        minDistancePx: 80,
      },
      serverConfig: {
        requiredDirection: 'left',
        minDistancePx: 80,
        maxDurationMs: 5000,
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const seats = [...challenge.seatVariants!.entries()];
    expect(seats).toHaveLength(2);
    const dirs = seats.map(
      ([, s]) => s.clientOverlay['displayedDirection'] as string,
    );
    expect(new Set(dirs).size).toBe(2);
    for (const [, seat] of seats) {
      const displayed = seat.clientOverlay['displayedDirection'];
      const required = seat.serverOverlay['requiredDirection'];
      expect(
        (displayed === 'right' && required === 'left') ||
          (displayed === 'left' && required === 'right'),
      ).toBe(true);
    }
  });

  it('assigns per-seat odd-one-out layouts and evaluates against seat oddIndex', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const glyphKeys = Array.from({ length: 16 }, () => 'pulse.a');
    glyphKeys[9] = 'pulse.b';
    const def = {
      definitionId: 'focus.odd_one_out.dev',
      definitionVersion: 1,
      engineId: 'focus.odd_one_out',
      durationMs: 6000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.odd.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.focus',
        promptKey: 'challenge.odd.prompt',
        columns: 4,
        glyphKeys: [...glyphKeys],
      },
      serverConfig: {
        columns: 4,
        glyphKeys: [...glyphKeys],
        oddIndex: 9,
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    expect(challenge.seatVariants?.size).toBe(2);
    const [idA, seatA] = [...challenge.seatVariants!.entries()][0]!;
    const [idB, seatB] = [...challenge.seatVariants!.entries()][1]!;
    expect(seatA.serverOverlay['oddIndex']).toBeGreaterThanOrEqual(0);
    expect(seatB.serverOverlay['oddIndex']).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(seatA.clientOverlay['glyphKeys'])).toBe(true);

    const viewA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    expect(viewA.clientConfig['glyphKeys']).toEqual(
      seatA.clientOverlay['glyphKeys'],
    );

    const oddA = seatA.serverOverlay['oddIndex'] as number;
    match = eng.submitAnswer(match, {
      playerId: idA,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'odd-a',
      answer: { selectedIndex: oddA },
    }).match;
    match = eng.submitAnswer(match, {
      playerId: idB,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'odd-b',
      answer: { selectedIndex: seatB.serverOverlay['oddIndex'] },
    }).match;
    expect(match.players.get(idA)!.hearts).toBe(3);
    expect(match.players.get(idB)!.hearts).toBe(3);
  });

  it('assigns distinct audio.cue pulse counts per seat', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const def = {
      definitionId: 'audio.cue.dev',
      definitionVersion: 1,
      engineId: 'audio.cue',
      durationMs: 6000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.audio.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.audio',
        promptKey: 'challenge.audio.prompt',
        visualFallbackKey: 'challenge.audio.visual_fallback',
        hapticFallbackKey: 'challenge.audio.haptic_fallback',
      },
      serverConfig: {
        pulseCount: 3,
        pulseCountOptions: [2, 3, 4, 5],
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const seats = [...challenge.seatVariants!.entries()];
    expect(seats).toHaveLength(2);
    const counts = seats.map(
      ([, s]) => s.serverOverlay['pulseCount'] as number,
    );
    expect(counts.every((c) => c >= 2 && c <= 5)).toBe(true);
    expect(new Set(counts).size).toBe(2);

    const [idA, seatA] = seats[0]!;
    const [idB, seatB] = seats[1]!;
    const viewA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    expect(viewA.clientConfig['pulseCount']).toBe(
      seatA.clientOverlay['pulseCount'],
    );

    match = eng.submitAnswer(match, {
      playerId: idA,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'audio-a',
      answer: { reportedPulseCount: seatA.serverOverlay['pulseCount'] },
    }).match;
    match = eng.submitAnswer(match, {
      playerId: idB,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'audio-b',
      answer: { reportedPulseCount: seatB.serverOverlay['pulseCount'] },
    }).match;
    expect(match.players.get(idA)!.hearts).toBe(3);
    expect(match.players.get(idB)!.hearts).toBe(3);
  });

  it('assigns distinct Guess the Audio clips per seat and scores each independently', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const def = {
      definitionId: 'audio.multiple_choice.dev',
      definitionVersion: 1,
      engineId: 'audio.multiple_choice',
      durationMs: 8000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.audio_mc.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.audio',
        promptKey: 'challenge.audio_mc.prompt_artist',
        questionKey: 'audio_mc.q.artist_1',
        optionKeys: [
          'audio_mc.opt.artist_1_a',
          'audio_mc.opt.artist_1_b',
          'audio_mc.opt.artist_1_c',
          'audio_mc.opt.artist_1_d',
        ],
        answerTarget: 'artist',
        audioAssetId: 'ca_44384e12ad9a80f1',
      },
      serverConfig: {
        questions: [
          {
            questionKey: 'audio_mc.q.artist_1',
            optionKeys: [
              'audio_mc.opt.artist_1_a',
              'audio_mc.opt.artist_1_b',
              'audio_mc.opt.artist_1_c',
              'audio_mc.opt.artist_1_d',
            ],
            correctOptionKey: 'audio_mc.opt.artist_1_b',
            answerTarget: 'artist',
            audioAssetId: 'ca_44384e12ad9a80f1',
            visualizationAssetId: 'cv_44384e12ad9a80f1',
            audioDurationMs: 2000,
            questionCopy: {
              ar: 'من صاحب هذا الصوت؟',
              en: 'Who is the owner of this voice?',
            },
            optionCopy: {
              'audio_mc.opt.artist_1_a': { ar: 'رامي', en: 'Rami' },
              'audio_mc.opt.artist_1_b': { ar: 'نور', en: 'Nour' },
              'audio_mc.opt.artist_1_c': { ar: 'ليان', en: 'Lyan' },
              'audio_mc.opt.artist_1_d': { ar: 'سليم', en: 'Salim' },
            },
          },
          {
            questionKey: 'audio_mc.q.track_1',
            optionKeys: [
              'audio_mc.opt.track_1_a',
              'audio_mc.opt.track_1_b',
              'audio_mc.opt.track_1_c',
              'audio_mc.opt.track_1_d',
            ],
            correctOptionKey: 'audio_mc.opt.track_1_a',
            answerTarget: 'track',
            audioAssetId: 'ca_76fc12197f19bd1b',
            visualizationAssetId: 'cv_76fc12197f19bd1b',
            audioDurationMs: 2000,
            questionCopy: {
              ar: 'ما اسم الأغنية؟',
              en: 'What is the name of the song?',
            },
            optionCopy: {
              'audio_mc.opt.track_1_a': { ar: 'نبض أخير', en: 'Last Pulse' },
              'audio_mc.opt.track_1_b': { ar: 'ليل بعيد', en: 'Distant Night' },
              'audio_mc.opt.track_1_c': {
                ar: 'صوت القلب',
                en: 'Voice of the Heart',
              },
              'audio_mc.opt.track_1_d': {
                ar: 'بعد الغياب',
                en: 'After Absence',
              },
            },
          },
        ],
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    expect(challenge.seatVariants?.size).toBe(2);
    const [idA, seatA] = [...challenge.seatVariants!.entries()][0]!;
    const [idB, seatB] = [...challenge.seatVariants!.entries()][1]!;
    expect(seatA.clientOverlay['audioAssetId']).not.toBe(
      seatB.clientOverlay['audioAssetId'],
    );
    expect(JSON.stringify(seatA.clientOverlay)).not.toMatch(/correctOption/);

    const viewA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    const viewB = toPublicChallengeView(challenge, clock.nowMs(), idB);
    expect(viewA.clientConfig['audioAssetId']).toBe(
      seatA.clientOverlay['audioAssetId'],
    );
    expect(viewB.clientConfig['audioAssetId']).toBe(
      seatB.clientOverlay['audioAssetId'],
    );
    expect(viewA.clientConfig['audioAssetId']).not.toBe(
      viewB.clientConfig['audioAssetId'],
    );
    expect(JSON.stringify(viewA)).not.toMatch(/correctOption/);
    expect(JSON.stringify(viewA)).not.toContain(
      String(seatB.clientOverlay['audioAssetId']),
    );

    match = eng.submitAnswer(match, {
      playerId: idA,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'audio-mc-a',
      answer: { chosenOptionKey: seatA.serverOverlay['correctOptionKey'] },
    }).match;
    match = eng.submitAnswer(match, {
      playerId: idB,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'audio-mc-b',
      answer: { chosenOptionKey: seatA.serverOverlay['correctOptionKey'] },
    }).match;
    expect(match.players.get(idA)!.hearts).toBe(3);
    expect(match.players.get(idB)!.hearts).toBe(2);
  });

  it('assigns distinct fog wipe reveal images per seat', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fillTwo(eng);
    const sharedLayers = {
      fogDensity: 'fog_wipe.fog_density',
      dropletHeight: 'fog_wipe.droplets_height',
      frostedEdges: 'fog_wipe.frosted_edges',
      scratchMask: 'fog_wipe.scratch_mask',
      wetSmudgeMask: 'fog_wipe.wet_smudge_mask',
      glassReflections: 'fog_wipe.glass_reflections',
    };
    const def = {
      definitionId: 'gesture.fog_wipe.dev',
      definitionVersion: 2,
      engineId: 'gesture.fog_wipe',
      durationMs: 10000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.fog_wipe.intro',
      choiceKeys: [] as string[],
      clientConfig: {
        categoryKey: 'challenge.category.gesture',
        promptKey: 'challenge.fog_wipe.prompt',
        footerKey: 'challenge.fog_wipe.footer',
        assetIds: {
          revealContent: 'fog_wipe.reveal.petsev',
          ...sharedLayers,
        },
        brushDiameterNorm: 0.12,
        brushFeatherNorm: 0.28,
        clearanceRatioMin: 0.55,
      },
      serverConfig: {
        assetIds: {
          revealContent: 'fog_wipe.reveal.petsev',
          ...sharedLayers,
        },
        revealContentVariants: [
          'fog_wipe.reveal.petsev',
          'fog_wipe.reveal.gta_vi',
          'fog_wipe.reveal.snowman',
          'fog_wipe.reveal.cucumber',
        ],
        brushDiameterNorm: 0.12,
        brushFeatherNorm: 0.28,
        clearanceRatioMin: 0.55,
      },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const seats = [...challenge.seatVariants!.entries()];
    expect(seats).toHaveLength(2);
    const reveals = seats.map(([, s]) => {
      const ids = s.clientOverlay['assetIds'] as Record<string, string>;
      expect(ids['fogDensity']).toBe('fog_wipe.fog_density');
      return ids['revealContent'];
    });
    expect(reveals.every((id) => typeof id === 'string' && id.length > 0)).toBe(
      true,
    );
    expect(new Set(reveals).size).toBe(2);

    const [idA, seatA] = seats[0]!;
    const viewA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    const viewAssets = viewA.clientConfig['assetIds'] as Record<string, string>;
    expect(viewAssets['revealContent']).toBe(
      (seatA.clientOverlay['assetIds'] as Record<string, string>)[
        'revealContent'
      ],
    );
  });
});
