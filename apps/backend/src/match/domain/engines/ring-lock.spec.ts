import {
  applyRingLockCommand,
  circularDistanceDeg,
  generateRingLockPuzzle,
  markRingLockTimeouts,
  maxWaitMsToTarget,
  normalizeAngleDeg,
  playerSeedForRingLock,
  resolveRingLockGenerationConfig,
  ringAngleAtElapsedMs,
  signedCircularDistanceDeg,
  validateRingLockSolvability,
  buildInitialRingLockPlayerState,
  type RingLockRoundState,
} from './ring-lock';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return resolveRingLockGenerationConfig(
    {
      startDelayMs: 500,
      minAngularVelocityDegPerSec: 70,
      maxAngularVelocityDegPerSec: 110,
      allowClockwise: true,
      allowCounterClockwise: true,
      targetAngleDeg: 0,
      alignmentToleranceDeg: 24,
      transitionDelayMs: 150,
      safetyMarginMs: 400,
      maxGenerationAttempts: 32,
      difficulty: 'medium',
      ...overrides,
    },
    15_000,
  );
}

describe('precision.ring_lock math', () => {
  it('normalizes angles into [0, 360)', () => {
    expect(normalizeAngleDeg(360)).toBe(0);
    expect(normalizeAngleDeg(-10)).toBe(350);
    expect(normalizeAngleDeg(718)).toBe(358);
  });

  it('uses shortest circular distance across 359/0', () => {
    expect(circularDistanceDeg(358, 0)).toBeCloseTo(2, 5);
    expect(circularDistanceDeg(1, 359)).toBeCloseTo(2, 5);
    expect(signedCircularDistanceDeg(358, 0)).toBeCloseTo(2, 5);
    expect(signedCircularDistanceDeg(2, 0)).toBeCloseTo(-2, 5);
  });

  it('computes clockwise and counterclockwise angles from elapsed time', () => {
    const cw = ringAngleAtElapsedMs(
      {
        initialAngleDeg: 0,
        direction: 1,
        angularVelocityDegPerSec: 90,
        locked: false,
        lockedAngleDeg: null,
      },
      1000,
      0,
    );
    expect(cw).toBeCloseTo(90, 5);
    const ccw = ringAngleAtElapsedMs(
      {
        initialAngleDeg: 0,
        direction: -1,
        angularVelocityDegPerSec: 90,
        locked: false,
        lockedAngleDeg: null,
      },
      1000,
      0,
    );
    expect(ccw).toBeCloseTo(270, 5);
  });

  it('keeps locked rings at the target angle', () => {
    expect(
      ringAngleAtElapsedMs(
        {
          initialAngleDeg: 40,
          direction: 1,
          angularVelocityDegPerSec: 90,
          locked: true,
          lockedAngleDeg: 0,
        },
        5000,
        0,
      ),
    ).toBe(0);
  });
});

describe('precision.ring_lock generation', () => {
  it('is deterministic for a fixed seed', () => {
    const config = baseConfig();
    const a = generateRingLockPuzzle({ seed: 42, config });
    const b = generateRingLockPuzzle({ seed: 42, config });
    expect(a.rings.map((r) => r.initialAngleDeg)).toEqual(
      b.rings.map((r) => r.initialAngleDeg),
    );
    expect(a.rings.map((r) => r.direction)).toEqual(
      b.rings.map((r) => r.direction),
    );
    expect(a.rings.map((r) => r.angularVelocityDegPerSec)).toEqual(
      b.rings.map((r) => r.angularVelocityDegPerSec),
    );
  });

  it('produces different seeds/angles per player', () => {
    const config = baseConfig();
    const s1 = playerSeedForRingLock('chal-1', 'p1', 99);
    const s2 = playerSeedForRingLock('chal-1', 'p2', 99);
    expect(s1).not.toBe(s2);
    const p1 = generateRingLockPuzzle({ seed: s1, config });
    const p2 = generateRingLockPuzzle({ seed: s2, config });
    const same =
      p1.rings[0]!.initialAngleDeg === p2.rings[0]!.initialAngleDeg &&
      p1.rings[0]!.direction === p2.rings[0]!.direction &&
      p1.rings[0]!.angularVelocityDegPerSec ===
        p2.rings[0]!.angularVelocityDegPerSec;
    expect(same).toBe(false);
  });

  it('validates solvability and never returns zero velocity', () => {
    const config = baseConfig();
    for (let n = 2; n <= 6; n += 1) {
      for (let i = 0; i < n; i += 1) {
        const seed = playerSeedForRingLock(`chal-${n}`, `p${i}`, 7);
        const puzzle = generateRingLockPuzzle({ seed, config });
        expect(puzzle.rings).toHaveLength(3);
        for (const ring of puzzle.rings) {
          expect(ring.angularVelocityDegPerSec).toBeGreaterThan(0);
        }
        expect(validateRingLockSolvability({ rings: puzzle.rings, config }).ok)
          .toBe(true);
      }
    }
  });

  it('rejects first-ring alignment at start', () => {
    const config = baseConfig();
    const bad = validateRingLockSolvability({
      rings: [
        {
          index: 0,
          initialAngleDeg: 0,
          direction: 1,
          angularVelocityDegPerSec: 90,
          locked: false,
          lockedAngleDeg: null,
        },
        {
          index: 1,
          initialAngleDeg: 90,
          direction: -1,
          angularVelocityDegPerSec: 80,
          locked: false,
          lockedAngleDeg: null,
        },
        {
          index: 2,
          initialAngleDeg: 180,
          direction: 1,
          angularVelocityDegPerSec: 100,
          locked: false,
          lockedAngleDeg: null,
        },
      ],
      config,
    });
    expect(bad.ok).toBe(false);
  });

  it('computes finite worst-case waits for generated rings', () => {
    const config = baseConfig();
    const puzzle = generateRingLockPuzzle({ seed: 1234, config });
    for (const ring of puzzle.rings) {
      const wait = maxWaitMsToTarget({
        initialAngleDeg: ring.initialAngleDeg,
        direction: ring.direction,
        angularVelocityDegPerSec: ring.angularVelocityDegPerSec,
        targetAngleDeg: config.targetAngleDeg,
        alignmentToleranceDeg: config.alignmentToleranceDeg,
        activeAtElapsedMs: config.startDelayMs,
      });
      expect(Number.isFinite(wait)).toBe(true);
      expect(wait).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('precision.ring_lock lock command', () => {
  function makeRound(): RingLockRoundState {
    const config = baseConfig({ startDelayMs: 0 });
    const generated = generateRingLockPuzzle({ seed: 1001, config });
    // Force the active ring onto the target for an exact hit fixture.
    generated.rings[0] = {
      ...generated.rings[0]!,
      initialAngleDeg: 0,
      angularVelocityDegPerSec: 60,
      direction: 1,
    };
    const player = buildInitialRingLockPlayerState({
      playerId: 'p1',
      challengeInstanceId: 'c1',
      seed: 1001,
      rings: generated.rings,
      puzzleStartsAtMs: 1_000_000,
      puzzleStartsMonoMs: 1_000_000,
      deadlineAtMs: 1_015_000,
      deadlineMonoMs: 1_015_000,
    });
    // Move first ring just outside tolerance for miss tests by regenerating.
    return {
      challengeInstanceId: 'c1',
      targetAngleDeg: 0,
      alignmentToleranceDeg: 24,
      startDelayMs: 0,
      transitionDelayMs: 150,
      difficulty: 'medium',
      players: {
        p1: player,
        p2: buildInitialRingLockPlayerState({
          playerId: 'p2',
          challengeInstanceId: 'c1',
          seed: 2002,
          rings: generateRingLockPuzzle({ seed: 2002, config }).rings,
          puzzleStartsAtMs: 1_000_000,
          puzzleStartsMonoMs: 1_000_000,
          deadlineAtMs: 1_015_000,
          deadlineMonoMs: 1_015_000,
        }),
      },
    };
  }

  it('accepts a correct lock inside tolerance and advances rings', () => {
    const state = makeRound();
    // At t=0, first ring is at 0° → hit.
    const hit = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'cmd-1',
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.hit).toBe(true);
    expect(hit.player.rings[0]!.locked).toBe(true);
    expect(hit.player.activeRingIndex).toBe(1);
    expect(hit.player.stateSequence).toBe(2);
  });

  it('accepts exact tolerance boundary', () => {
    const state = makeRound();
    state.players['p1']!.rings[0] = {
      index: 0,
      initialAngleDeg: 24,
      direction: 1,
      angularVelocityDegPerSec: 1,
      locked: false,
      lockedAngleDeg: null,
    };
    const hit = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'cmd-bound',
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(hit.ok && hit.hit).toBe(true);
  });

  it('rejects miss outside tolerance without stopping the ring', () => {
    const state = makeRound();
    state.players['p1']!.rings[0] = {
      index: 0,
      initialAngleDeg: 40,
      direction: 1,
      angularVelocityDegPerSec: 60,
      locked: false,
      lockedAngleDeg: null,
    };
    const miss = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'cmd-miss',
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    expect(miss.hit).toBe(false);
    expect(miss.player.rings[0]!.locked).toBe(false);
    expect(miss.player.activeRingIndex).toBe(0);
    expect(miss.player.lastLockOutcome).toBe('miss');
  });

  it('rejects wrong ring index', () => {
    const state = makeRound();
    const wrong = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 1,
      commandId: 'cmd-wrong',
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(wrong.ok).toBe(false);
    if (wrong.ok) return;
    expect(wrong.reason).toBe('wrong_ring');
  });

  it('handles duplicate command ids idempotently', () => {
    const state = makeRound();
    const first = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'dup',
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyRingLockCommand({
      state: first.state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'dup',
      nowMonoMs: 1_000_050,
      nowWallMs: 1_000_050,
    });
    expect(second.ok && second.duplicate).toBe(true);
  });

  it('rejects spam within cooldown window', () => {
    const state = makeRound();
    const first = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'cmd-a',
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const spam = applyRingLockCommand({
      state: first.state,
      playerId: 'p1',
      ringIndex: first.player.activeRingIndex,
      commandId: 'cmd-b',
      nowMonoMs: 1_000_100,
      nowWallMs: 1_000_100,
    });
    expect(spam.ok).toBe(false);
    if (spam.ok) return;
    expect(spam.reason).toBe('cooldown');

    const after = applyRingLockCommand({
      state: first.state,
      playerId: 'p1',
      ringIndex: first.player.activeRingIndex,
      commandId: 'cmd-c',
      nowMonoMs: 1_000_250,
      nowWallMs: 1_000_250,
    });
    expect(after.ok).toBe(true);
  });

  it('rejects stale sequence', () => {
    const state = makeRound();
    const stale = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'cmd-stale',
      expectedSequence: 99,
      nowMonoMs: 1_000_000,
      nowWallMs: 1_000_000,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.reason).toBe('stale_sequence');
  });

  it('rejects after deadline', () => {
    const state = makeRound();
    const late = applyRingLockCommand({
      state,
      playerId: 'p1',
      ringIndex: 0,
      commandId: 'cmd-late',
      nowMonoMs: 1_020_000,
      nowWallMs: 1_020_000,
    });
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.reason).toBe('deadline');
  });

  it('locks outer → middle → inner then completes', () => {
    let state = makeRound();
    // Force all rings onto target at their activation times by zero velocity
    // at target after each lock via initial angles at 0.
    for (const ring of state.players['p1']!.rings) {
      ring.initialAngleDeg = 0;
      ring.angularVelocityDegPerSec = 0.0001;
      ring.direction = 1;
    }
    // Bypass zero-velocity generator rule for this command fixture only.
    state.players['p1']!.rings.forEach((r) => {
      r.angularVelocityDegPerSec = 0.001;
    });

    for (let i = 0; i < 3; i += 1) {
      const applied = applyRingLockCommand({
        state,
        playerId: 'p1',
        ringIndex: i as 0 | 1 | 2,
        commandId: `cmd-${i}`,
        nowMonoMs: 1_000_000 + i * 300,
        nowWallMs: 1_000_000 + i * 300,
      });
      expect(applied.ok && applied.hit).toBe(true);
      if (!applied.ok) return;
      state = applied.state;
      if (i < 2) {
        expect(applied.completed).toBe(false);
        expect(applied.player.activeRingIndex).toBe((i + 1) as 0 | 1 | 2);
      } else {
        expect(applied.completed).toBe(true);
        expect(applied.player.result).toBe('success');
      }
    }
    // p2 still independent / active
    expect(state.players['p2']!.result).toBe('active');
    expect(state.players['p2']!.rings.every((r) => !r.locked)).toBe(true);
  });

  it('marks timeouts without regenerating puzzles', () => {
    const state = makeRound();
    const seed = state.players['p1']!.seed;
    const angles = state.players['p1']!.rings.map((r) => r.initialAngleDeg);
    const timed = markRingLockTimeouts(state);
    expect(timed.players['p1']!.result).toBe('timeout');
    expect(timed.players['p1']!.seed).toBe(seed);
    expect(timed.players['p1']!.rings.map((r) => r.initialAngleDeg)).toEqual(
      angles,
    );
  });
});

describe('precision.ring_lock difficulty tuning', () => {
  it('uses slower rings when Studio difficulty is easy but speeds are still canned medium', () => {
    const easy = resolveRingLockGenerationConfig(
      {
        minAngularVelocityDegPerSec: 45,
        maxAngularVelocityDegPerSec: 90,
        alignmentToleranceDeg: 24,
        difficulty: 'easy',
      },
      15_000,
    );
    const hard = resolveRingLockGenerationConfig(
      {
        minAngularVelocityDegPerSec: 45,
        maxAngularVelocityDegPerSec: 90,
        alignmentToleranceDeg: 24,
        difficulty: 'hard',
      },
      15_000,
    );
    expect(easy.minAngularVelocityDegPerSec).toBeLessThan(
      hard.minAngularVelocityDegPerSec,
    );
    expect(easy.alignmentToleranceDeg).toBeGreaterThan(
      hard.alignmentToleranceDeg,
    );
  });

  it('keeps custom speeds when they are not canned medium', () => {
    const custom = resolveRingLockGenerationConfig(
      {
        minAngularVelocityDegPerSec: 70,
        maxAngularVelocityDegPerSec: 110,
        alignmentToleranceDeg: 20,
        difficulty: 'hard',
      },
      15_000,
    );
    expect(custom.minAngularVelocityDegPerSec).toBe(70);
    expect(custom.maxAngularVelocityDegPerSec).toBe(110);
    expect(custom.alignmentToleranceDeg).toBe(20);
  });
});
