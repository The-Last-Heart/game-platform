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

  it('assigns distinct tilt targets/shapes per seat and evaluates against seat overlay', () => {
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
    expect(seatA.clientOverlay['targetX']).not.toBe(
      seatB.clientOverlay['targetX'],
    );
    const pubA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    const pubB = toPublicChallengeView(challenge, clock.nowMs(), idB);
    expect(pubA.clientConfig['targetX']).toBe(seatA.clientOverlay['targetX']);
    expect(pubB.clientConfig['targetShape']).toBe(
      seatB.clientOverlay['targetShape'],
    );
    expect(pubA.clientConfig['targetX']).not.toBe(pubB.clientConfig['targetX']);

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
        displayName: `Player${i}`,
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
      serverConfig: { syncWindowMs: 500 },
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
    expect(
      resolutions.find((r) => r.playerId === waiters[0]!),
    ).toMatchObject({
      outcome: 'skipped_spectator',
      energyDelta: 0,
      energyAfter: 2,
      heartsDelta: 0,
    });
    expect(
      resolutions.find((r) => r.playerId === waiters[1]!),
    ).toMatchObject({
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
        displayName: id,
      }).match;
      match = eng.acceptJoin(match, id).match;
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
      serverConfig: { syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;

    // Same press start (~mono 500): finish stamps differ, one used to win alone.
    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a',
      answer: { synced: true, heldMs: 4000, final: true },
      receivedMonoMs: clock.monoMs() + 4500,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b',
      answer: { synced: true, heldMs: 4400, final: true },
      receivedMonoMs: clock.monoMs() + 4900,
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

  it('pair_sync fails both when one seat held too briefly', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = eng.createMatch('m-pair-asym', {
      mode: 'quick_survival',
      playerCapacity: 2,
    });
    for (const id of ['p0', 'p1']) {
      match = eng.joinPlayer(match, {
        playerId: id,
        resumeTokenHash: `h-${id}`,
        displayName: id,
      }).match;
      match = eng.acceptJoin(match, id).match;
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
      serverConfig: { syncWindowMs: 500 },
    };
    match = eng.startChallenge(match, def).match;
    const challenge = match.currentChallenge!;
    const [a, b] = challenge.participatingPlayerIds;

    match = eng.submitAnswer(match, {
      playerId: a!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-a',
      answer: { synced: true, heldMs: 4000, final: true },
      receivedMonoMs: clock.monoMs() + 4500,
    }).match;
    match = eng.submitAnswer(match, {
      playerId: b!,
      challengeInstanceId: challenge.challengeInstanceId,
      commandId: 'cmd-b',
      answer: { synced: true, heldMs: 900, final: true },
      receivedMonoMs: clock.monoMs() + 4600,
    }).match;

    expect(match.players.get(a!)!.hearts).toBe(2);
    expect(match.players.get(b!)!.hearts).toBe(2);
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
    expect(viewA.clientConfig['glyphKeys']).toEqual(seatA.clientOverlay['glyphKeys']);

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
    const counts = seats.map(([, s]) => s.serverOverlay['pulseCount'] as number);
    expect(counts.every((c) => c >= 2 && c <= 5)).toBe(true);
    expect(new Set(counts).size).toBe(2);

    const [idA, seatA] = seats[0]!;
    const [idB, seatB] = seats[1]!;
    const viewA = toPublicChallengeView(challenge, clock.nowMs(), idA);
    expect(viewA.clientConfig['pulseCount']).toBe(seatA.clientOverlay['pulseCount']);

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
