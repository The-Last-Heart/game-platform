/**
 * LH-007 automated evidence (no device): MatchEngine simulation matrix
 * for the six launch engines + finite playlist → draw.
 */
import { ChallengeEvaluatorRegistryImpl } from '../dev-challenge.evaluator';
import {
  WAIT_FOR_SIGNAL_ENGINE_ID,
  WaitForSignalEvaluator,
} from '../wait-for-signal.evaluator';
import { MatchEngine } from '../match.engine';
import {
  FakeClock,
  INITIAL_ENERGY,
  INITIAL_HEARTS,
  MATCH_PLAYER_CAPACITY,
  type ChallengeDefinition,
  type MatchState,
} from '../types';
import {
  GESTURE_REVERSE_SWIPE_ENGINE_ID,
  HOLD_MULTITOUCH_ENGINE_ID,
  MEMORY_SEQUENCE_ENGINE_ID,
  TAP_PRECISION_ENGINE_ID,
  TRAP_NO_TOUCH_ENGINE_ID,
  createLaunchEvaluators,
} from './launch-evaluators';

function setup() {
  const clock = new FakeClock(1_000_000);
  const registry = new ChallengeEvaluatorRegistryImpl();
  registry.register(new WaitForSignalEvaluator());
  for (const evaluator of createLaunchEvaluators()) {
    registry.register(evaluator);
  }
  const engine = new MatchEngine(clock, registry);
  return { clock, engine };
}

function fillSix(engine: MatchEngine, matchId = 'lh007-sim') {
  let match = engine.createMatch(matchId);
  for (let i = 0; i < MATCH_PLAYER_CAPACITY; i += 1) {
    match = engine.joinPlayer(match, {
      playerId: `p${i}`,
      resumeTokenHash: `h${i}`,
    }).match;
    match = engine.acceptJoin(match, `p${i}`).match;
  }
  return match;
}

function baseDef(
  engineId: string,
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: overrides.definitionId ?? `${engineId}.sim`,
    definitionVersion: overrides.definitionVersion ?? 1,
    engineId,
    durationMs: overrides.durationMs ?? 4000,
    heartPenaltyOnFailure: overrides.heartPenaltyOnFailure ?? 1,
    energyRewardOnSuccess: overrides.energyRewardOnSuccess ?? 1,
    promptKey: overrides.promptKey ?? 'challenge.sim.prompt',
    choiceKeys: overrides.choiceKeys ?? [],
    clientConfig: overrides.clientConfig ?? {},
    serverConfig: overrides.serverConfig ?? {},
  };
}

function waitForSignalDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return baseDef(WAIT_FOR_SIGNAL_ENGINE_ID, {
    durationMs: 5000,
    promptKey: 'challenge.wait_for_signal.intro',
    clientConfig: {
      categoryKey: 'challenge.category.reaction',
      waitingPromptKey: 'challenge.wait_for_signal.waiting',
      waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
      activePromptKey: 'challenge.wait_for_signal.active',
      actionKey: 'challenge.wait_for_signal.action',
    },
    serverConfig: { signalDelayMs: 1500, signalWindowMs: 1000 },
    ...overrides,
    engineId: WAIT_FOR_SIGNAL_ENGINE_ID,
  });
}

function noTouchDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return baseDef(TRAP_NO_TOUCH_ENGINE_ID, {
    durationMs: 4000,
    promptKey: 'challenge.no_touch.intro',
    clientConfig: {
      categoryKey: 'challenge.category.trap',
      promptKey: 'challenge.no_touch.prompt',
      zoneHintKey: 'challenge.no_touch.zone_hint',
      zone: { x: 0.25, y: 0.3, width: 0.5, height: 0.4 },
    },
    serverConfig: { allowSystemGestures: true },
    ...overrides,
    engineId: TRAP_NO_TOUCH_ENGINE_ID,
  });
}

function reverseSwipeDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return baseDef(GESTURE_REVERSE_SWIPE_ENGINE_ID, {
    durationMs: 5000,
    promptKey: 'challenge.reverse_swipe.intro',
    clientConfig: {
      categoryKey: 'challenge.category.gesture',
      promptKey: 'challenge.reverse_swipe.prompt',
      displayedDirection: 'right',
      minDistancePx: 80,
    },
    serverConfig: {
      requiredDirection: 'left',
      minDistancePx: 80,
      maxDurationMs: 1500,
    },
    ...overrides,
    engineId: GESTURE_REVERSE_SWIPE_ENGINE_ID,
  });
}

function precisionTapDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return baseDef(TAP_PRECISION_ENGINE_ID, {
    durationMs: 5000,
    promptKey: 'challenge.precision.intro',
    clientConfig: {
      categoryKey: 'challenge.category.tap',
      promptKey: 'challenge.precision.prompt',
      attemptCount: 2,
      targets: [
        { id: 't1', x: 0.3, y: 0.4 },
        { id: 't2', x: 0.7, y: 0.6 },
      ],
    },
    serverConfig: { targetIds: ['t1', 't2'], attemptCount: 2 },
    ...overrides,
    engineId: TAP_PRECISION_ENGINE_ID,
  });
}

function memorySequenceDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return baseDef(MEMORY_SEQUENCE_ENGINE_ID, {
    durationMs: 6000,
    promptKey: 'challenge.memory.intro',
    clientConfig: {
      categoryKey: 'challenge.category.memory',
      promptKey: 'challenge.memory.prompt',
      previewMs: 1500,
      optionKeys: [
        'memory.opt.a',
        'memory.opt.b',
        'memory.opt.c',
        'memory.opt.d',
      ],
    },
    serverConfig: {
      sequence: ['memory.opt.a', 'memory.opt.c', 'memory.opt.b'],
      previewMs: 1500,
      optionKeys: [
        'memory.opt.a',
        'memory.opt.b',
        'memory.opt.c',
        'memory.opt.d',
      ],
    },
    ...overrides,
    engineId: MEMORY_SEQUENCE_ENGINE_ID,
  });
}

function multitouchHoldDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return baseDef(HOLD_MULTITOUCH_ENGINE_ID, {
    durationMs: 5000,
    promptKey: 'challenge.hold.intro',
    clientConfig: {
      categoryKey: 'challenge.category.hold',
      promptKey: 'challenge.hold.prompt',
      requiredContacts: 2,
      holdMs: 1500,
    },
    serverConfig: { requiredContacts: 2, holdMs: 1500, resetOnLift: true },
    ...overrides,
    engineId: HOLD_MULTITOUCH_ENGINE_ID,
  });
}

function submitAll(
  engine: MatchEngine,
  match: MatchState,
  answerFor: (playerId: string, index: number) => Record<string, unknown>,
  commandPrefix: string,
): MatchState {
  const challengeId = match.currentChallenge!.challengeInstanceId;
  let next = match;
  for (let i = 0; i < MATCH_PLAYER_CAPACITY; i += 1) {
    const playerId = `p${i}`;
    next = engine.submitAnswer(next, {
      playerId,
      challengeInstanceId: challengeId,
      commandId: `${commandPrefix}-${playerId}`,
      answer: answerFor(playerId, i),
    }).match;
  }
  return next;
}

function expectAllHearts(
  match: MatchState,
  hearts: number,
  energy = INITIAL_ENERGY,
) {
  for (let i = 0; i < MATCH_PLAYER_CAPACITY; i += 1) {
    const player = match.players.get(`p${i}`)!;
    expect(player.hearts).toBe(hearts);
    expect(player.energy).toBe(energy);
  }
}

describe('LH-007 pack simulation matrix', () => {
  describe('reaction.wait_for_signal', () => {
    it('success: correct token inside signal window', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'wfs-ok');
      match = engine.startChallenge(match, waitForSignalDef()).match;
      const token = match.currentChallenge!.signalToken!;
      clock.advance(1500);
      match = engine.activateSignal(match).match;
      match = submitAll(engine, match, () => ({ signalToken: token }), 'ok');
      expect(match.currentChallenge?.status).toBe('resolved');
      expectAllHearts(match, INITIAL_HEARTS, 1);
    });

    it('failure: early tap before signal', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'wfs-early');
      match = engine.startChallenge(match, waitForSignalDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ signalToken: 'premature' }),
        'early',
      );
      expect(match.currentChallenge?.status).toBe('resolved');
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });

    it('timeout: no submission past deadline', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'wfs-timeout');
      match = engine.startChallenge(match, waitForSignalDef()).match;
      clock.advance(1500);
      match = engine.activateSignal(match).match;
      clock.advance(3501);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });
  });

  describe('trap.no_touch', () => {
    it('absence success: deadline reached without touch', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'nt-absent');
      match = engine.startChallenge(match, noTouchDef()).match;
      clock.advance(4001);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS, 1);
    });

    it('failure: touch in prohibited zone', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'nt-touch');
      match = engine.startChallenge(match, noTouchDef()).match;
      match = submitAll(engine, match, () => ({ touched: true }), 'touch');
      expect(match.currentChallenge?.status).toBe('resolved');
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });
  });

  describe('gesture.reverse_swipe', () => {
    it('success: opposite direction with enough distance', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'swipe-ok');
      match = engine.startChallenge(match, reverseSwipeDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ dx: -100, dy: 0, durationMs: 200 }),
        'ok',
      );
      expectAllHearts(match, INITIAL_HEARTS, 1);
    });

    it('failure: displayed (wrong) direction', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'swipe-fail');
      match = engine.startChallenge(match, reverseSwipeDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ dx: 100, dy: 0, durationMs: 200 }),
        'bad',
      );
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });

    it('timeout: no submission', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'swipe-timeout');
      match = engine.startChallenge(match, reverseSwipeDef()).match;
      clock.advance(5001);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });
  });

  describe('tap.precision', () => {
    it('success: all required targets tapped', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'prec-ok');
      match = engine.startChallenge(match, precisionTapDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ tappedTargetIds: ['t2', 't1'] }),
        'ok',
      );
      expectAllHearts(match, INITIAL_HEARTS, 1);
    });

    it('failure: miss / wrong targets', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'prec-fail');
      match = engine.startChallenge(match, precisionTapDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ tappedTargetIds: ['t1', 'wrong'] }),
        'miss',
      );
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });

    it('timeout: no submission', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'prec-timeout');
      match = engine.startChallenge(match, precisionTapDef()).match;
      clock.advance(5001);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });
  });

  describe('memory.sequence', () => {
    it('success: ordered sequence matches', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'mem-ok');
      match = engine.startChallenge(match, memorySequenceDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({
          sequence: ['memory.opt.a', 'memory.opt.c', 'memory.opt.b'],
        }),
        'ok',
      );
      expectAllHearts(match, INITIAL_HEARTS, 1);
    });

    it('failure: wrong order', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'mem-fail');
      match = engine.startChallenge(match, memorySequenceDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({
          sequence: ['memory.opt.b', 'memory.opt.a', 'memory.opt.c'],
        }),
        'wrong',
      );
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });

    it('timeout: no submission', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'mem-timeout');
      match = engine.startChallenge(match, memorySequenceDef()).match;
      clock.advance(6001);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });
  });

  describe('hold.multitouch', () => {
    it('success: required contacts held for holdMs', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'hold-ok');
      match = engine.startChallenge(match, multitouchHoldDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ contacts: 2, heldMs: 1500, final: true }),
        'ok',
      );
      expectAllHearts(match, INITIAL_HEARTS, 1);
    });

    it('failure: incomplete hold', () => {
      const { engine } = setup();
      let match = fillSix(engine, 'hold-fail');
      match = engine.startChallenge(match, multitouchHoldDef()).match;
      match = submitAll(
        engine,
        match,
        () => ({ contacts: 1, heldMs: 1500, final: true }),
        'incomplete',
      );
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });

    it('timeout: no submission', () => {
      const { clock, engine } = setup();
      let match = fillSix(engine, 'hold-timeout');
      match = engine.startChallenge(match, multitouchHoldDef()).match;
      clock.advance(5001);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS - 1, 0);
    });
  });

  describe('finite playlist endgame', () => {
    it('playlist of 2 defs → after 2 equal-heart rounds → phase draw', () => {
      const { clock, engine } = setup();
      const playlist = [waitForSignalDef(), noTouchDef()];
      let match = fillSix(engine, 'playlist-draw');
      expect(match.roundNumber).toBe(0);

      // Round 1: everyone succeeds wait-for-signal
      match = engine.startChallenge(match, playlist[0]!).match;
      expect(match.roundNumber).toBe(1);
      const token = match.currentChallenge!.signalToken!;
      clock.advance(1500);
      match = engine.activateSignal(match).match;
      match = submitAll(engine, match, () => ({ signalToken: token }), 'r1');
      expectAllHearts(match, INITIAL_HEARTS, 1);

      // Round 2: everyone succeeds via no-touch absence
      match = engine.startChallenge(match, playlist[1]!).match;
      expect(match.roundNumber).toBe(2);
      clock.advance(4001);
      match = engine.resolveDueTimeouts(match).match;
      expectAllHearts(match, INITIAL_HEARTS, 2);

      // Playlist exhausted (roundNumber === length); equal hearts → draw
      expect(match.roundNumber).toBe(playlist.length);
      const hearts = [...match.players.values()].map((p) => p.hearts);
      expect(new Set(hearts).size).toBe(1);

      const finished = engine.completeByStandings(match);
      expect(finished.match.phase).toBe('draw');
      expect(finished.match.status).toBe('completed');
      expect(finished.match.winnerId).toBeNull();
      expect(finished.events.some((e) => e.kind === 'match_drawn')).toBe(true);
    });
  });
});
