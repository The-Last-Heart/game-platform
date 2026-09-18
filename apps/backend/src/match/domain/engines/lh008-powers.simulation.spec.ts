import { randomUUID } from 'node:crypto';
import {
  ChallengeEvaluatorRegistryImpl,
  createDevChallengeDefinition,
  DevDeterministicChoiceEvaluator,
} from '../dev-challenge.evaluator';
import { FakeClock } from '../types';
import { EMPTY_INVENTORY } from '../types';
import { MatchEngine } from '../match.engine';
import { defaultPowerConfig } from '../match.powers';

function fillTwo(engine: MatchEngine) {
  let match = engine.createMatch(undefined, {
    mode: 'dev',
    playerCapacity: 2,
    powerConfig: defaultPowerConfig(),
    pinnedPlaylist: [
      createDevChallengeDefinition({ durationMs: 3000, energyRewardOnSuccess: 1 }),
      createDevChallengeDefinition({
        definitionId: 'dev-2',
        durationMs: 3000,
        energyRewardOnSuccess: 1,
      }),
      createDevChallengeDefinition({
        definitionId: 'dev-3',
        durationMs: 3000,
        energyRewardOnSuccess: 1,
      }),
      createDevChallengeDefinition({
        definitionId: 'dev-4',
        durationMs: 3000,
        energyRewardOnSuccess: 1,
      }),
      createDevChallengeDefinition({
        definitionId: 'dev-5',
        durationMs: 3000,
        energyRewardOnSuccess: 1,
      }),
    ],
  });
  match = engine.joinPlayer(match, {
    playerId: 'p0',
    resumeTokenHash: 'h0',
    displayName: 'Host',
  }).match;
  match = engine.joinPlayer(match, {
    playerId: 'p1',
    resumeTokenHash: 'h1',
    displayName: 'Guest',
  }).match;
  match = engine.acceptJoin(match, 'p0').match;
  match = engine.acceptJoin(match, 'p1').match;
  return match;
}

function playSuccess(engine: MatchEngine, match: ReturnType<typeof fillTwo>, choice = 'a') {
  const started = engine.startChallenge(
    match,
    createDevChallengeDefinition({ durationMs: 3000, energyRewardOnSuccess: 1 }),
  ).match;
  const cid = started.currentChallenge!.challengeInstanceId;
  let next = started;
  for (const id of ['p0', 'p1']) {
    next = engine.submitAnswer(next, {
      playerId: id,
      challengeInstanceId: cid,
      commandId: randomUUID(),
      answer: { choice },
    }).match;
  }
  return next;
}

describe('LH-008 energy and powers', () => {
  const setup = () => {
    const clock = new FakeClock();
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new DevDeterministicChoiceEvaluator());
    const engine = new MatchEngine(clock, registry);
    return { clock, engine };
  };

  it('four successes grant one power and keep the meter full', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    for (let i = 0; i < 4; i++) {
      match = playSuccess(engine, match);
      // enter round_result then clear for next startChallengeDirect path
      match = engine.beginRoundResult(
        match,
        match.currentChallenge!.resolutions,
        match.currentChallenge!.challengeInstanceId,
        100,
      ).match;
    }
    const p0 = match.players.get('p0')!;
    expect(p0.energy).toBe(4);
    expect(
      p0.inventory.danger_pulse +
        p0.inventory.shield +
        p0.inventory.reflection,
    ).toBe(1);
  });

  it('using danger pulse resets the meter to zero', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    match = engine.beginPowerAction(match).match;
    match = engine.useDangerPulse(match, {
      attackerId: 'p0',
      targetPlayerId: 'p1',
    }).match;
    expect(match.players.get('p0')!.energy).toBe(0);
    expect(match.players.get('p0')!.inventory.danger_pulse).toBe(0);
  });

  it('power.granted events use sequences after challenge.resolved', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 3;
    match.players.get('p1')!.energy = 3;
    const started = engine.startChallenge(
      match,
      createDevChallengeDefinition({
        durationMs: 3000,
        energyRewardOnSuccess: 1,
      }),
    );
    match = started.match;
    const cid = match.currentChallenge!.challengeInstanceId;
    let lastEvents = started.events;
    for (const id of ['p0', 'p1']) {
      const result = engine.submitAnswer(match, {
        playerId: id,
        challengeInstanceId: cid,
        commandId: randomUUID(),
        answer: { choice: 'a' },
      });
      match = result.match;
      lastEvents = result.events;
    }
    const resolved = lastEvents.find((e) => e.kind === 'challenge_resolved');
    const grantEvents = lastEvents.filter(
      (e) => e.kind === 'power_granted' || e.kind === 'power_inventory_full',
    );
    expect(resolved).toBeDefined();
    expect(grantEvents.length).toBe(2);
    const resolveSeq = resolved!.sequence;
    for (const grant of grantEvents) {
      expect(grant.sequence).toBeGreaterThan(resolveSeq);
    }
    expect(new Set(grantEvents.map((e) => e.sequence)).size).toBe(2);
  });

  it('inventory full yields explicit outcome without silent drop', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    const p0 = match.players.get('p0')!;
    p0.inventory = { danger_pulse: 1, shield: 1, reflection: 1 };
    p0.energy = 3;
    match = playSuccess(engine, match);
    const after = match.players.get('p0')!;
    expect(after.energy).toBe(4);
    expect(match.lastPowerGrant?.outcome).toBe('inventory_full');
  });

  it('danger pulse hit removes a heart and grants protection', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    match = engine.beginPowerAction(match).match;
    expect(match.phase).toBe('power_action');
    match = engine.useDangerPulse(match, {
      attackerId: 'p0',
      targetPlayerId: 'p1',
    }).match;
    expect(match.phase).toBe('power_defense');
    const resolved = engine.defendPowerAttack(match, {
      defenderId: 'p1',
      attackId: match.pendingAttack!.attackId,
      choice: 'none',
    });
    match = resolved.match;
    expect(match.players.get('p1')!.hearts).toBe(2);
    expect(match.players.get('p1')!.protectedThroughRound).toBe(
      match.roundNumber + 1,
    );
  });

  it('power.used and power.defense_required use consecutive sequences', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    match = engine.beginPowerAction(match).match;
    const used = engine.useDangerPulse(match, {
      attackerId: 'p0',
      targetPlayerId: 'p1',
    });
    const powerUsed = used.events.find((e) => e.kind === 'power_used');
    const defenseRequired = used.events.find(
      (e) => e.kind === 'power_defense_required',
    );
    expect(powerUsed).toBeDefined();
    expect(defenseRequired).toBeDefined();
    expect(defenseRequired!.sequence).toBe(powerUsed!.sequence + 1);
  });

  it('action window defaults to 5 seconds', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    const offered = engine.beginPowerAction(match);
    expect(offered.match.powerConfig?.actionWindowMs ?? 5000).toBe(5000);
    expect(
      (offered.match.phaseDeadlineAtMs ?? 0) -
        (offered.events.find((e) => e.kind === 'power_offered')
          ?.serverTimestampMs ?? 0),
    ).toBeLessThanOrEqual(5000);
    const offeredEvent = offered.events.find((e) => e.kind === 'power_offered');
    expect(offeredEvent).toBeDefined();
    if (offeredEvent && offeredEvent.kind === 'power_offered') {
      expect(
        offeredEvent.actionDeadlineAtMs - offeredEvent.serverTimestampMs,
      ).toBe(5000);
    }
  });

  it('reflection cannot loop; reflected sender may shield', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match.players.get('p1')!.inventory.reflection = 1;
    match.players.get('p0')!.inventory.shield = 1;
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    match = engine.beginPowerAction(match).match;
    match = engine.useDangerPulse(match, {
      attackerId: 'p0',
      targetPlayerId: 'p1',
    }).match;
    const reflected = engine.defendPowerAttack(match, {
      defenderId: 'p1',
      attackId: match.pendingAttack!.attackId,
      choice: 'reflect',
    });
    match = reflected.match;
    expect(match.pendingAttack?.reflected).toBe(true);
    expect(match.pendingAttack?.targetId).toBe('p0');
    const shielded = engine.defendPowerAttack(match, {
      defenderId: 'p0',
      attackId: match.pendingAttack!.attackId,
      choice: 'shield',
    });
    expect(shielded.match.players.get('p0')!.hearts).toBe(3);
    expect(
      shielded.events.some(
        (e) => e.kind === 'power_resolved' && e.outcome === 'reflected_shielded',
      ),
    ).toBe(true);
  });

  it('rejects illegal targets (self / consecutive)', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match.players.get('p0')!.lastDangerPulseTargetId = 'p1';
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    const offered = engine.beginPowerAction(match);
    // No eligible targets → no power_action window
    expect(offered.events.length).toBe(0);
  });

  it('allowOffer false skips the strike window even with a charge', () => {
    const { engine } = setup();
    let match = fillTwo(engine);
    match.players.get('p0')!.energy = 4;
    match.players.get('p0')!.inventory.danger_pulse = 1;
    match = engine.beginRoundResult(match, [], 'x', 100).match;
    const skipped = engine.beginPowerAction(match, undefined, {
      allowOffer: false,
    });
    expect(skipped.events).toHaveLength(0);
    expect(skipped.match.phase).toBe('round_result');
  });

  it('empty inventory helper starts empty', () => {
    expect(EMPTY_INVENTORY.danger_pulse).toBe(0);
  });
});
