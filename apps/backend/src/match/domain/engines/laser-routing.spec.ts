import {
  LASER_ROUTING_VARIANTS,
  fallbackBoardForVariant,
  generateLaserRoutingPuzzle,
  previewLaserRoutingPuzzle,
  reflectDirection,
  resolveLaserRoutingGenerationConfig,
  rotateComponent,
  solveLaserBoard,
  toggleGateAxis,
  toggleMirrorOrientation,
  traceLasers,
  type LaserBoard,
  type LaserDirection,
} from '@thelastheart/contracts';
import {
  applyLaserRoutingCommand,
  buildInitialLaserRoutingPlayerState,
  cloneLaserRoutingState,
  generateLaserRoutingForPlayer,
} from './laser-routing';

const DIRECTIONS: LaserDirection[] = ['north', 'east', 'south', 'west'];

function configFor(
  variant: (typeof LASER_ROUTING_VARIANTS)[number],
  extras: Record<string, unknown> = {},
) {
  return resolveLaserRoutingGenerationConfig(
    {
      variant,
      startDelayMs: 800,
      moveBudgetMs: 1800,
      safetyMarginMs: 2000,
      minRequiredMoves: 2,
      maxRequiredMoves: 6,
      requireUniqueSolution: true,
      avoidSingleMoveStart: true,
      difficulty: 'medium',
      ...extras,
    },
    15_000,
  );
}

describe('laser.routing optics', () => {
  it('maps slash mirrors from every incoming direction', () => {
    expect(reflectDirection('north', 'slash')).toBe('east');
    expect(reflectDirection('east', 'slash')).toBe('north');
    expect(reflectDirection('south', 'slash')).toBe('west');
    expect(reflectDirection('west', 'slash')).toBe('south');
  });

  it('maps backslash mirrors from every incoming direction', () => {
    expect(reflectDirection('north', 'backslash')).toBe('west');
    expect(reflectDirection('west', 'backslash')).toBe('north');
    expect(reflectDirection('south', 'backslash')).toBe('east');
    expect(reflectDirection('east', 'backslash')).toBe('south');
  });

  it('always turns a beam exactly 90 degrees', () => {
    for (const incoming of DIRECTIONS) {
      for (const orientation of ['slash', 'backslash'] as const) {
        const outgoing = reflectDirection(incoming, orientation);
        const turn =
          incoming === 'north' || incoming === 'south'
            ? outgoing === 'east' || outgoing === 'west'
            : outgoing === 'north' || outgoing === 'south';
        expect(turn).toBe(true);
        expect(outgoing).not.toBe(incoming);
      }
    }
  });

  it('does not bend in empty cells or pass straight through a mirror', () => {
    const board: LaserBoard = {
      width: 4,
      height: 3,
      variant: 'classic',
      components: [
        {
          id: 'source-cyan',
          kind: 'source',
          row: 1,
          col: 0,
          direction: 'east',
          color: 'cyan',
        },
        {
          id: 'mirror-1',
          kind: 'mirror',
          row: 1,
          col: 2,
          orientation: 'slash',
        },
        { id: 'heart', kind: 'heart', row: 0, col: 2 },
      ],
    };
    const result = traceLasers(board);
    const cyan = result.traces[0]!;
    expect(cyan.cells).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 0, col: 2 },
    ]);
    expect(cyan.termination).toBe('heart');
    const flipped = rotateComponent(board, 'mirror-1');
    const missed = traceLasers(flipped);
    expect(missed.success).toBe(false);
    expect(missed.traces[0]!.termination).toBe('boundary');
  });

  it('validates gates without changing direction and blocks mismatches', () => {
    const open: LaserBoard = {
      width: 4,
      height: 3,
      variant: 'pulse_gates',
      components: [
        {
          id: 'source-cyan',
          kind: 'source',
          row: 1,
          col: 0,
          direction: 'east',
          color: 'cyan',
        },
        { id: 'gate-1', kind: 'gate', row: 1, col: 1, axis: 'horizontal' },
        { id: 'heart', kind: 'heart', row: 1, col: 3 },
      ],
    };
    const passed = traceLasers(open);
    expect(passed.traces[0]!.termination).toBe('heart');
    expect(passed.traces[0]!.cells.map((c) => `${c.row},${c.col}`)).toEqual([
      '1,0',
      '1,1',
      '1,2',
      '1,3',
    ]);
    const closed = rotateComponent(open, 'gate-1');
    const blocked = traceLasers(closed);
    expect(blocked.traces[0]!.termination).toBe('closed_gate');
    expect(blocked.traces[0]!.blockedComponentId).toBe('gate-1');
    expect(toggleGateAxis('horizontal')).toBe('vertical');
  });

  it('detects loops, board boundaries, and heart termination', () => {
    const loopBoard: LaserBoard = {
      width: 3,
      height: 3,
      variant: 'classic',
      components: [
        {
          id: 'source-cyan',
          kind: 'source',
          row: 2,
          col: 0,
          direction: 'east',
          color: 'cyan',
        },
        { id: 'm1', kind: 'mirror', row: 2, col: 2, orientation: 'slash' },
        { id: 'm2', kind: 'mirror', row: 0, col: 2, orientation: 'backslash' },
        { id: 'm3', kind: 'mirror', row: 0, col: 0, orientation: 'slash' },
      ],
    };
    expect(traceLasers(loopBoard).traces[0]!.termination).toBe('loop');

    const edge: LaserBoard = {
      width: 3,
      height: 2,
      variant: 'classic',
      components: [
        {
          id: 'source-cyan',
          kind: 'source',
          row: 0,
          col: 0,
          direction: 'west',
          color: 'cyan',
        },
        { id: 'heart', kind: 'heart', row: 0, col: 2 },
      ],
    };
    expect(traceLasers(edge).traces[0]!.termination).toBe('boundary');
  });

  it('requires both dual-fusion inputs and never merges in empty cells', () => {
    const solved = fallbackBoardForVariant('dual_fusion');
    const full = traceLasers(solved);
    expect(full.combinerCharged).toBe(true);
    expect(full.success).toBe(true);
    expect(
      full.traces.some((t) => t.color === 'fused' && t.termination === 'heart'),
    ).toBe(true);

    const oneSided = rotateComponent(solved, 'mirror-cyan-1');
    const partial = traceLasers(oneSided);
    expect(partial.cyanPathConnected).toBe(false);
    expect(partial.amberPathConnected).toBe(true);
    expect(partial.combinerCharged).toBe(false);
    expect(partial.traces.some((t) => t.color === 'fused')).toBe(false);
    expect(partial.success).toBe(false);

    const crossing: LaserBoard = {
      width: 3,
      height: 3,
      variant: 'dual_fusion',
      components: [
        {
          id: 'source-cyan',
          kind: 'source',
          row: 1,
          col: 0,
          direction: 'east',
          color: 'cyan',
        },
        {
          id: 'source-amber',
          kind: 'source',
          row: 0,
          col: 1,
          direction: 'south',
          color: 'amber',
        },
        { id: 'heart', kind: 'heart', row: 1, col: 2 },
      ],
    };
    const crossed = traceLasers(crossing);
    expect(crossed.traces.some((t) => t.color === 'fused')).toBe(false);
    expect(crossed.success).toBe(false);
  });
});

describe('laser.routing generation', () => {
  it.each(LASER_ROUTING_VARIANTS)(
    'produces a solvable unique unsolved %s puzzle',
    (variant) => {
      const generated = generateLaserRoutingPuzzle({
        seed: 4242,
        config: configFor(
          variant,
          variant === 'classic' ? { mirrorCount: 4 } : {},
        ),
      });
      const live = traceLasers(generated.board);
      const solved = traceLasers(generated.solvedBoard);
      expect(live.success).toBe(false);
      expect(solved.success).toBe(true);
      expect(generated.solution.solvable).toBe(true);
      expect(generated.solution.unique).toBe(true);
      expect(generated.solution.startSolved).toBe(false);
      expect(generated.solution.minimumMovesFromStart).toBeGreaterThanOrEqual(
        2,
      );
      const required = generated.board.components.filter(
        (c) =>
          c.kind === 'mirror' || c.kind === 'gate' || c.kind === 'combiner',
      );
      expect(solved.requiredHitCount).toBe(required.length);
      if (variant === 'zigzag' || variant === 'pulse_gates') {
        expect(
          generated.board.components.filter((c) => c.kind === 'mirror'),
        ).toHaveLength(4);
      }
      if (variant === 'pulse_gates') {
        expect(
          generated.board.components.filter((c) => c.kind === 'gate'),
        ).toHaveLength(3);
      }
    },
  );

  it('is deterministic for a seed and differs across players', () => {
    const a = generateLaserRoutingForPlayer({
      challengeInstanceId: 'c1',
      playerId: 'p0',
      baseSeed: 99,
      serverConfig: { variant: 'classic', startDelayMs: 800, seed: 99 },
      durationMs: 15_000,
    });
    const b = generateLaserRoutingForPlayer({
      challengeInstanceId: 'c1',
      playerId: 'p0',
      baseSeed: 99,
      serverConfig: { variant: 'classic', startDelayMs: 800, seed: 99 },
      durationMs: 15_000,
    });
    const c = generateLaserRoutingForPlayer({
      challengeInstanceId: 'c1',
      playerId: 'p1',
      baseSeed: 99,
      serverConfig: { variant: 'classic', startDelayMs: 800, seed: 99 },
      durationMs: 15_000,
    });
    expect(a.board).toEqual(b.board);
    expect(a.seed).not.toBe(c.seed);
  });

  it('keeps fallback layouts solvable', () => {
    for (const variant of LASER_ROUTING_VARIANTS) {
      const board = fallbackBoardForVariant(variant, 4);
      const report = solveLaserBoard(board);
      expect(report.solvable).toBe(true);
      expect(traceLasers(board).success).toBe(true);
    }
  });

  it('rejects an unfair duration', () => {
    expect(() =>
      resolveLaserRoutingGenerationConfig(
        {
          variant: 'classic',
          startDelayMs: 800,
          minRequiredMoves: 6,
          moveBudgetMs: 2000,
          safetyMarginMs: 2000,
        },
        5000,
      ),
    ).toThrow(/too short/);
  });
});

describe('laser.routing commands', () => {
  function round() {
    const generated = generateLaserRoutingPuzzle({
      seed: 7,
      config: configFor('classic'),
    });
    const player = buildInitialLaserRoutingPlayerState({
      playerId: 'p0',
      challengeInstanceId: 'c1',
      generated,
      puzzleStartsAtMs: 1_000,
      puzzleStartsMonoMs: 1_000,
      deadlineAtMs: 16_000,
      deadlineMonoMs: 16_000,
    });
    return {
      challengeInstanceId: 'c1',
      startDelayMs: 800,
      difficulty: 'medium' as const,
      players: { p0: player, p1: { ...player, playerId: 'p1' } },
    };
  }

  it('rotates a mirror, is idempotent, and isolates players', () => {
    const state = round();
    const first = applyLaserRoutingCommand({
      state,
      playerId: 'p0',
      componentId: 'mirror-1',
      commandId: 'cmd-1',
      nowMonoMs: 2_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const p0Before = first.state.players.p1!.board.components.find(
      (c) => c.id === 'mirror-1',
    );
    const p0After = first.state.players.p0!.board.components.find(
      (c) => c.id === 'mirror-1',
    );
    expect(p0After).not.toEqual(p0Before);

    const dup = applyLaserRoutingCommand({
      state: first.state,
      playerId: 'p0',
      componentId: 'mirror-1',
      commandId: 'cmd-1',
      nowMonoMs: 2_100,
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.duplicate).toBe(true);

    const stale = applyLaserRoutingCommand({
      state: first.state,
      playerId: 'p0',
      componentId: 'mirror-1',
      commandId: 'cmd-2',
      expectedSequence: 0,
      nowMonoMs: 2_200,
    });
    expect(stale.ok).toBe(false);

    const unknown = applyLaserRoutingCommand({
      state: first.state,
      playerId: 'p0',
      componentId: 'nope',
      commandId: 'cmd-3',
      nowMonoMs: 2_300,
    });
    expect(unknown.ok).toBe(false);

    const late = applyLaserRoutingCommand({
      state: first.state,
      playerId: 'p0',
      componentId: 'mirror-1',
      commandId: 'cmd-4',
      nowMonoMs: 20_000,
    });
    expect(late.ok).toBe(false);
  });

  it('succeeds when the authoritative trace reaches the heart', () => {
    const generated = generateLaserRoutingPuzzle({
      seed: 11,
      config: configFor('classic'),
    });
    const player = buildInitialLaserRoutingPlayerState({
      playerId: 'p0',
      challengeInstanceId: 'c1',
      generated,
      puzzleStartsAtMs: 1_000,
      puzzleStartsMonoMs: 1_000,
      deadlineAtMs: 16_000,
      deadlineMonoMs: 16_000,
    });
    let state = {
      challengeInstanceId: 'c1',
      startDelayMs: 800,
      difficulty: 'medium' as const,
      players: { p0: player },
    };
    const mirrors = generated.board.components.filter(
      (c) => c.kind === 'mirror',
    );
    let cmd = 0;
    for (const mirror of mirrors) {
      const solved = generated.solutionState.mirrors[mirror.id];
      if (mirror.kind === 'mirror' && mirror.orientation !== solved) {
        const applied = applyLaserRoutingCommand({
          state,
          playerId: 'p0',
          componentId: mirror.id,
          commandId: `solve-${cmd++}`,
          nowMonoMs: 2_000 + cmd * 100,
        });
        expect(applied.ok).toBe(true);
        if (applied.ok) state = applied.state;
      }
    }
    expect(state.players.p0.result).toBe('success');
    expect(cloneLaserRoutingState(state).players.p0!.board).toEqual(
      state.players.p0.board,
    );
  });
});

describe('laser.routing studio preview', () => {
  it('returns admin-only solved path metadata', () => {
    const preview = previewLaserRoutingPuzzle({
      seed: 5,
      serverConfig: { variant: 'zigzag', startDelayMs: 800 },
      challengeDurationMs: 15_000,
    });
    expect(preview.solvable).toBe(true);
    expect(preview.startSolved).toBe(false);
    expect(preview.solvedTraces.length).toBeGreaterThan(0);
    expect(toggleMirrorOrientation('slash')).toBe('backslash');
  });
});
