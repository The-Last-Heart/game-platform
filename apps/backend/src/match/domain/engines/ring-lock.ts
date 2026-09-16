import {
  RING_LOCK_DEFAULT_CONFIG,
  RING_LOCK_RING_COUNT,
  precisionRingLockAnswerSchema,
  type RingLockDirection,
  type RingLockDifficulty,
  type RingLockLastOutcome,
  type RingLockPlayerResult,
  type RingLockRingIndex,
} from '@thelastheart/contracts';
import {
  createSeededRng,
  hashStringToSeed,
} from './complete-sum';

export const PRECISION_RING_LOCK_ENGINE_ID = 'precision.ring_lock';

export type RingLockRingRuntime = {
  index: RingLockRingIndex;
  initialAngleDeg: number;
  direction: RingLockDirection;
  angularVelocityDegPerSec: number;
  locked: boolean;
  lockedAngleDeg: number | null;
};

export type RingLockPlayerState = {
  playerId: string;
  challengeInstanceId: string;
  seed: number;
  puzzleStartsAtMs: number;
  puzzleStartsMonoMs: number;
  deadlineAtMs: number;
  deadlineMonoMs: number;
  activeRingIndex: RingLockRingIndex;
  rings: RingLockRingRuntime[];
  lastAcceptedCommandId: string | null;
  progress: number;
  result: RingLockPlayerResult;
  stateSequence: number;
  lastLockOutcome: RingLockLastOutcome | null;
  lastLockRingIndex: RingLockRingIndex | null;
};

export type RingLockRoundState = {
  challengeInstanceId: string;
  targetAngleDeg: number;
  alignmentToleranceDeg: number;
  startDelayMs: number;
  transitionDelayMs: number;
  difficulty: RingLockDifficulty;
  players: Record<string, RingLockPlayerState>;
};

export type RingLockPublicPlayerPayload = {
  seed: number;
  puzzleStartsAtMs: number;
  activeRingIndex: RingLockRingIndex;
  rings: Array<{
    index: RingLockRingIndex;
    initialAngleDeg: number;
    direction: RingLockDirection;
    angularVelocityDegPerSec: number;
    locked: boolean;
    lockedAngleDeg: number | null;
  }>;
  lockedCount: number;
  progress: number;
  result: RingLockPlayerResult;
  stateSequence: number;
  lastLockOutcome: RingLockLastOutcome | null;
  lastLockRingIndex: RingLockRingIndex | null;
  lastAcceptedCommandId: string | null;
  targetAngleDeg: number;
  alignmentToleranceDeg: number;
  startDelayMs: number;
  transitionDelayMs: number;
  ringCount: typeof RING_LOCK_RING_COUNT;
  difficulty: RingLockDifficulty;
  isParticipant: true;
};

export type RingLockGenerationConfig = {
  startDelayMs: number;
  minAngularVelocityDegPerSec: number;
  maxAngularVelocityDegPerSec: number;
  allowClockwise: boolean;
  allowCounterClockwise: boolean;
  targetAngleDeg: number;
  alignmentToleranceDeg: number;
  transitionDelayMs: number;
  safetyMarginMs: number;
  maxGenerationAttempts: number;
  difficulty: RingLockDifficulty;
  challengeDurationMs: number;
};

export class RingLockConfigError extends Error {
  readonly code = 'RING_LOCK_INVALID_CONFIG';

  constructor(message: string) {
    super(message);
    this.name = 'RingLockConfigError';
  }
}

/** Normalize degrees into [0, 360). */
export function normalizeAngleDeg(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const mod = angle % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** Shortest signed circular distance from `from` to `to` in (-180, 180]. */
export function signedCircularDistanceDeg(from: number, to: number): number {
  const a = normalizeAngleDeg(from);
  const b = normalizeAngleDeg(to);
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/** Absolute shortest circular distance in [0, 180]. */
export function circularDistanceDeg(a: number, b: number): number {
  return Math.abs(signedCircularDistanceDeg(a, b));
}

export function ringAngleAtElapsedMs(
  ring: Pick<
    RingLockRingRuntime,
    'initialAngleDeg' | 'direction' | 'angularVelocityDegPerSec' | 'locked' | 'lockedAngleDeg'
  >,
  elapsedMs: number,
  targetAngleDeg: number,
): number {
  if (ring.locked) {
    return ring.lockedAngleDeg ?? targetAngleDeg;
  }
  const elapsedSec = Math.max(0, elapsedMs) / 1000;
  return normalizeAngleDeg(
    ring.initialAngleDeg +
      ring.direction * ring.angularVelocityDegPerSec * elapsedSec,
  );
}

/**
 * Worst-case wait (ms) until the lock marker next enters the alignment window.
 * When already inside the window after `minElapsedMs`, returns 0.
 */
export function maxWaitMsToTarget(input: {
  initialAngleDeg: number;
  direction: RingLockDirection;
  angularVelocityDegPerSec: number;
  targetAngleDeg: number;
  alignmentToleranceDeg: number;
  /** Elapsed ms when this ring becomes active (relative to puzzle start). */
  activeAtElapsedMs?: number;
}): number {
  const speed = input.angularVelocityDegPerSec;
  if (!(speed > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  const periodMs = (360 / speed) * 1000;
  const activeAt = Math.max(0, input.activeAtElapsedMs ?? 0);
  const angleAtActive = ringAngleAtElapsedMs(
    {
      initialAngleDeg: input.initialAngleDeg,
      direction: input.direction,
      angularVelocityDegPerSec: speed,
      locked: false,
      lockedAngleDeg: null,
    },
    activeAt,
    input.targetAngleDeg,
  );
  if (
    circularDistanceDeg(angleAtActive, input.targetAngleDeg) <=
    input.alignmentToleranceDeg
  ) {
    // Already aligned when activated — but gameplay forbids starting the first
    // ring inside the window; callers still treat this as zero wait.
    return 0;
  }

  // Sweep forward until the marker enters the window (sample at fine steps).
  const stepMs = Math.max(4, Math.min(16, periodMs / 720));
  for (let t = stepMs; t <= periodMs + stepMs; t += stepMs) {
    const angle = ringAngleAtElapsedMs(
      {
        initialAngleDeg: input.initialAngleDeg,
        direction: input.direction,
        angularVelocityDegPerSec: speed,
        locked: false,
        lockedAngleDeg: null,
      },
      activeAt + t,
      input.targetAngleDeg,
    );
    if (
      circularDistanceDeg(angle, input.targetAngleDeg) <=
      input.alignmentToleranceDeg
    ) {
      return t;
    }
  }
  return periodMs;
}

export function resolveRingLockGenerationConfig(
  serverConfig: Record<string, unknown>,
  challengeDurationMs: number,
): RingLockGenerationConfig {
  const defaults = RING_LOCK_DEFAULT_CONFIG;
  const startDelayMs =
    typeof serverConfig['startDelayMs'] === 'number'
      ? Math.floor(serverConfig['startDelayMs'])
      : defaults.startDelayMs;
  const minAngularVelocityDegPerSec =
    typeof serverConfig['minAngularVelocityDegPerSec'] === 'number'
      ? serverConfig['minAngularVelocityDegPerSec']
      : defaults.minAngularVelocityDegPerSec;
  const maxAngularVelocityDegPerSec =
    typeof serverConfig['maxAngularVelocityDegPerSec'] === 'number'
      ? serverConfig['maxAngularVelocityDegPerSec']
      : defaults.maxAngularVelocityDegPerSec;
  const allowClockwise = serverConfig['allowClockwise'] !== false;
  const allowCounterClockwise = serverConfig['allowCounterClockwise'] !== false;
  const targetAngleDeg =
    typeof serverConfig['targetAngleDeg'] === 'number'
      ? normalizeAngleDeg(serverConfig['targetAngleDeg'])
      : defaults.targetAngleDeg;
  const alignmentToleranceDeg =
    typeof serverConfig['alignmentToleranceDeg'] === 'number'
      ? serverConfig['alignmentToleranceDeg']
      : defaults.alignmentToleranceDeg;
  const transitionDelayMs =
    typeof serverConfig['transitionDelayMs'] === 'number'
      ? Math.floor(serverConfig['transitionDelayMs'])
      : defaults.transitionDelayMs;
  const safetyMarginMs =
    typeof serverConfig['safetyMarginMs'] === 'number'
      ? Math.floor(serverConfig['safetyMarginMs'])
      : defaults.safetyMarginMs;
  const maxGenerationAttempts =
    typeof serverConfig['maxGenerationAttempts'] === 'number'
      ? Math.floor(serverConfig['maxGenerationAttempts'])
      : defaults.maxGenerationAttempts;
  const difficultyRaw = serverConfig['difficulty'];
  const difficulty: RingLockDifficulty =
    difficultyRaw === 'easy' ||
    difficultyRaw === 'medium' ||
    difficultyRaw === 'hard'
      ? difficultyRaw
      : defaults.difficulty;

  if (minAngularVelocityDegPerSec > maxAngularVelocityDegPerSec) {
    throw new RingLockConfigError('invalid angular velocity range');
  }
  if (!allowClockwise && !allowCounterClockwise) {
    throw new RingLockConfigError('no rotation directions allowed');
  }
  if (!(alignmentToleranceDeg > 0)) {
    throw new RingLockConfigError('alignmentToleranceDeg must be positive');
  }
  if (!(challengeDurationMs > 0)) {
    throw new RingLockConfigError('challengeDurationMs must be positive');
  }

  return {
    startDelayMs,
    minAngularVelocityDegPerSec,
    maxAngularVelocityDegPerSec,
    allowClockwise,
    allowCounterClockwise,
    targetAngleDeg,
    alignmentToleranceDeg,
    transitionDelayMs,
    safetyMarginMs,
    maxGenerationAttempts,
    difficulty,
    challengeDurationMs,
  };
}

function pickDirection(
  rng: () => number,
  allowClockwise: boolean,
  allowCounterClockwise: boolean,
  prefer?: RingLockDirection,
): RingLockDirection {
  if (allowClockwise && !allowCounterClockwise) return 1;
  if (!allowClockwise && allowCounterClockwise) return -1;
  if (prefer != null && rng() < 0.55) return prefer;
  return rng() < 0.5 ? 1 : -1;
}

function pickVelocity(
  rng: () => number,
  minV: number,
  maxV: number,
): number {
  if (maxV <= minV) return minV;
  return minV + rng() * (maxV - minV);
}

function pickInitialAngle(
  rng: () => number,
  targetAngleDeg: number,
  toleranceDeg: number,
  /** When true, force outside the success window (first active ring). */
  forceOutsideWindow: boolean,
): number {
  for (let i = 0; i < 24; i += 1) {
    const angle = normalizeAngleDeg(rng() * 360);
    const dist = circularDistanceDeg(angle, targetAngleDeg);
    if (forceOutsideWindow) {
      if (dist > toleranceDeg + 8) return angle;
    } else if (dist > toleranceDeg + 4) {
      return angle;
    }
  }
  // Deterministic safe offset away from target.
  return normalizeAngleDeg(targetAngleDeg + toleranceDeg + 40);
}

export type GeneratedRingLockPuzzle = {
  seed: number;
  rings: RingLockRingRuntime[];
  usedFallback: boolean;
  attempts: number;
};

export function validateRingLockSolvability(input: {
  rings: RingLockRingRuntime[];
  config: RingLockGenerationConfig;
}): { ok: true } | { ok: false; reason: string } {
  const { rings, config } = input;
  if (rings.length !== RING_LOCK_RING_COUNT) {
    return { ok: false, reason: 'ring_count' };
  }
  for (const ring of rings) {
    if (!(ring.angularVelocityDegPerSec > 0)) {
      return { ok: false, reason: 'zero_velocity' };
    }
  }

  const first = rings[0]!;
  if (
    circularDistanceDeg(first.initialAngleDeg, config.targetAngleDeg) <=
    config.alignmentToleranceDeg
  ) {
    return { ok: false, reason: 'first_ring_already_aligned' };
  }

  // Not every lock directly on target at t=0.
  const allOnTarget = rings.every(
    (r) =>
      circularDistanceDeg(r.initialAngleDeg, config.targetAngleDeg) <=
      config.alignmentToleranceDeg,
  );
  if (allOnTarget) {
    return { ok: false, reason: 'all_aligned_at_start' };
  }

  // Tolerance must cover ~2 frames at 60fps of travel at max speed.
  const maxSpeed = Math.max(
    ...rings.map((r) => r.angularVelocityDegPerSec),
  );
  const frameTravelDeg = maxSpeed / 60;
  if (config.alignmentToleranceDeg < frameTravelDeg * 1.5) {
    return { ok: false, reason: 'tolerance_too_tight' };
  }

  let elapsedCursor = config.startDelayMs;
  let worstTotal = config.startDelayMs;
  for (let i = 0; i < rings.length; i += 1) {
    const ring = rings[i]!;
    const wait = maxWaitMsToTarget({
      initialAngleDeg: ring.initialAngleDeg,
      direction: ring.direction,
      angularVelocityDegPerSec: ring.angularVelocityDegPerSec,
      targetAngleDeg: config.targetAngleDeg,
      alignmentToleranceDeg: config.alignmentToleranceDeg,
      activeAtElapsedMs: elapsedCursor,
    });
    if (!Number.isFinite(wait)) {
      return { ok: false, reason: 'infinite_wait' };
    }
    worstTotal += wait;
    elapsedCursor += wait;
    if (i < rings.length - 1) {
      worstTotal += config.transitionDelayMs;
      elapsedCursor += config.transitionDelayMs;
    }
  }
  worstTotal += config.safetyMarginMs;

  if (worstTotal > config.challengeDurationMs) {
    return { ok: false, reason: 'deadline_too_short' };
  }
  return { ok: true };
}

function buildSafeFallbackRings(
  config: RingLockGenerationConfig,
): RingLockRingRuntime[] {
  // Fast, mixed directions, clearly off-target — guaranteed solvable in 15s.
  const speeds = [95, 80, 105];
  const dirs: RingLockDirection[] = [1, -1, 1];
  const offsets = [90, 150, 210];
  return [0, 1, 2].map((index) => ({
    index: index as RingLockRingIndex,
    initialAngleDeg: normalizeAngleDeg(config.targetAngleDeg + offsets[index]!),
    direction: config.allowClockwise
      ? dirs[index]!
      : ((-dirs[index]!) as RingLockDirection),
    angularVelocityDegPerSec: speeds[index]!,
    locked: false,
    lockedAngleDeg: null,
  }));
}

export function generateRingLockPuzzle(input: {
  seed: number;
  config: RingLockGenerationConfig;
}): GeneratedRingLockPuzzle {
  const { config } = input;
  const maxAttempts = Math.max(1, config.maxGenerationAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const rng = createSeededRng((input.seed + attempt * 0x9e3779b9) >>> 0);
    const rings: RingLockRingRuntime[] = [];
    let lastDir: RingLockDirection | undefined;
    for (let i = 0; i < RING_LOCK_RING_COUNT; i += 1) {
      const direction = pickDirection(
        rng,
        config.allowClockwise,
        config.allowCounterClockwise,
        lastDir != null ? ((-lastDir) as RingLockDirection) : undefined,
      );
      lastDir = direction;
      const velocity = pickVelocity(
        rng,
        config.minAngularVelocityDegPerSec,
        config.maxAngularVelocityDegPerSec,
      );
      const initialAngleDeg = pickInitialAngle(
        rng,
        config.targetAngleDeg,
        config.alignmentToleranceDeg,
        i === 0,
      );
      rings.push({
        index: i as RingLockRingIndex,
        initialAngleDeg,
        direction,
        angularVelocityDegPerSec: velocity,
        locked: false,
        lockedAngleDeg: null,
      });
    }

    const check = validateRingLockSolvability({ rings, config });
    if (check.ok) {
      return {
        seed: input.seed,
        rings,
        usedFallback: false,
        attempts: attempt,
      };
    }
  }

  const fallback = buildSafeFallbackRings(config);
  const check = validateRingLockSolvability({ rings: fallback, config });
  if (!check.ok) {
    // Last resort: boost speeds until solvable.
    for (const ring of fallback) {
      ring.angularVelocityDegPerSec = Math.max(
        ring.angularVelocityDegPerSec,
        130,
      );
    }
  }
  return {
    seed: input.seed,
    rings: fallback,
    usedFallback: true,
    attempts: maxAttempts,
  };
}

export function buildInitialRingLockPlayerState(input: {
  playerId: string;
  challengeInstanceId: string;
  seed: number;
  rings: RingLockRingRuntime[];
  puzzleStartsAtMs: number;
  puzzleStartsMonoMs: number;
  deadlineAtMs: number;
  deadlineMonoMs: number;
}): RingLockPlayerState {
  return {
    playerId: input.playerId,
    challengeInstanceId: input.challengeInstanceId,
    seed: input.seed,
    puzzleStartsAtMs: input.puzzleStartsAtMs,
    puzzleStartsMonoMs: input.puzzleStartsMonoMs,
    deadlineAtMs: input.deadlineAtMs,
    deadlineMonoMs: input.deadlineMonoMs,
    activeRingIndex: 0,
    rings: input.rings.map((r) => ({ ...r })),
    lastAcceptedCommandId: null,
    progress: 0,
    result: 'active',
    stateSequence: 1,
    lastLockOutcome: null,
    lastLockRingIndex: null,
  };
}

export function toRingLockPublicPlayerPayload(
  round: RingLockRoundState,
  player: RingLockPlayerState,
): RingLockPublicPlayerPayload {
  const lockedCount = player.rings.filter((r) => r.locked).length;
  return {
    seed: player.seed,
    puzzleStartsAtMs: player.puzzleStartsAtMs,
    activeRingIndex: player.activeRingIndex,
    rings: player.rings.map((r) => ({
      index: r.index,
      initialAngleDeg: r.initialAngleDeg,
      direction: r.direction,
      angularVelocityDegPerSec: r.angularVelocityDegPerSec,
      locked: r.locked,
      lockedAngleDeg: r.lockedAngleDeg,
    })),
    lockedCount,
    progress: player.progress,
    result: player.result,
    stateSequence: player.stateSequence,
    lastLockOutcome: player.lastLockOutcome,
    lastLockRingIndex: player.lastLockRingIndex,
    lastAcceptedCommandId: player.lastAcceptedCommandId,
    targetAngleDeg: round.targetAngleDeg,
    alignmentToleranceDeg: round.alignmentToleranceDeg,
    startDelayMs: round.startDelayMs,
    transitionDelayMs: round.transitionDelayMs,
    ringCount: RING_LOCK_RING_COUNT,
    difficulty: round.difficulty,
    isParticipant: true,
  };
}

export function cloneRingLockState(
  state: RingLockRoundState,
): RingLockRoundState {
  const players: Record<string, RingLockPlayerState> = {};
  for (const [id, player] of Object.entries(state.players)) {
    players[id] = {
      ...player,
      rings: player.rings.map((r) => ({ ...r })),
    };
  }
  return {
    ...state,
    players,
  };
}

export function playerSeedForRingLock(
  challengeInstanceId: string,
  playerId: string,
  baseSeed?: number,
): number {
  const base =
    typeof baseSeed === 'number'
      ? baseSeed >>> 0
      : hashStringToSeed(challengeInstanceId);
  return hashStringToSeed(`${base}:${playerId}:ring_lock`) >>> 0;
}

export type ApplyRingLockResult =
  | {
      ok: true;
      state: RingLockRoundState;
      player: RingLockPlayerState;
      hit: boolean;
      completed: boolean;
      duplicate: boolean;
    }
  | {
      ok: false;
      reason:
        | 'no_puzzle'
        | 'wrong_ring'
        | 'already_locked'
        | 'deadline'
        | 'stale_sequence'
        | 'not_active'
        | 'malformed';
      state: RingLockRoundState;
    };

export function applyRingLockCommand(input: {
  state: RingLockRoundState;
  playerId: string;
  ringIndex: RingLockRingIndex;
  commandId: string;
  expectedSequence?: number;
  nowMonoMs: number;
  nowWallMs: number;
}): ApplyRingLockResult {
  const prior = input.state.players[input.playerId];
  if (!prior) {
    return { ok: false, reason: 'no_puzzle', state: input.state };
  }

  // Idempotent replay of the last accepted command (including after success).
  if (
    prior.lastAcceptedCommandId != null &&
    prior.lastAcceptedCommandId === input.commandId
  ) {
    return {
      ok: true,
      state: input.state,
      player: prior,
      hit: prior.lastLockOutcome === 'hit',
      completed: prior.result === 'success',
      duplicate: true,
    };
  }

  if (prior.result !== 'active') {
    return { ok: false, reason: 'not_active', state: input.state };
  }

  if (
    input.expectedSequence != null &&
    input.expectedSequence !== prior.stateSequence
  ) {
    return { ok: false, reason: 'stale_sequence', state: input.state };
  }

  if (input.nowMonoMs > prior.deadlineMonoMs) {
    return { ok: false, reason: 'deadline', state: input.state };
  }

  if (input.ringIndex !== prior.activeRingIndex) {
    return { ok: false, reason: 'wrong_ring', state: input.state };
  }

  const active = prior.rings[prior.activeRingIndex];
  if (!active || active.locked) {
    return { ok: false, reason: 'already_locked', state: input.state };
  }

  const elapsedMs = Math.max(
    0,
    input.nowMonoMs - prior.puzzleStartsMonoMs,
  );
  // Rings only spin after startDelay.
  const spinElapsedMs = Math.max(0, elapsedMs - input.state.startDelayMs);
  const angle = ringAngleAtElapsedMs(
    active,
    spinElapsedMs,
    input.state.targetAngleDeg,
  );
  const distance = circularDistanceDeg(angle, input.state.targetAngleDeg);
  const hit = distance <= input.state.alignmentToleranceDeg;

  const nextRound = cloneRingLockState(input.state);
  const nextPlayer = nextRound.players[input.playerId]!;
  nextPlayer.lastAcceptedCommandId = input.commandId;
  nextPlayer.stateSequence += 1;
  nextPlayer.lastLockRingIndex = input.ringIndex;

  if (!hit) {
    nextPlayer.lastLockOutcome = 'miss';
    return {
      ok: true,
      state: nextRound,
      player: nextPlayer,
      hit: false,
      completed: false,
      duplicate: false,
    };
  }

  const lockedRing = nextPlayer.rings[input.ringIndex]!;
  lockedRing.locked = true;
  lockedRing.lockedAngleDeg = input.state.targetAngleDeg;
  nextPlayer.lastLockOutcome = 'hit';

  const lockedCount = nextPlayer.rings.filter((r) => r.locked).length;
  nextPlayer.progress = lockedCount / RING_LOCK_RING_COUNT;

  if (lockedCount >= RING_LOCK_RING_COUNT) {
    nextPlayer.result = 'success';
    nextPlayer.activeRingIndex = 2;
    return {
      ok: true,
      state: nextRound,
      player: nextPlayer,
      hit: true,
      completed: true,
      duplicate: false,
    };
  }

  nextPlayer.activeRingIndex = lockedCount as RingLockRingIndex;
  return {
    ok: true,
    state: nextRound,
    player: nextPlayer,
    hit: true,
    completed: false,
    duplicate: false,
  };
}

export function markRingLockTimeouts(
  state: RingLockRoundState,
): RingLockRoundState {
  const next = cloneRingLockState(state);
  for (const player of Object.values(next.players)) {
    if (player.result === 'active') {
      player.result = 'timeout';
      player.stateSequence += 1;
      player.lastLockOutcome = null;
    }
  }
  return next;
}

export function validateRingLockAnswer(
  answer: Record<string, unknown>,
):
  | {
      ok: true;
      ringIndex: RingLockRingIndex;
      expectedSequence?: number;
      final?: boolean;
    }
  | { ok: false; reason: string } {
  const parsed = precisionRingLockAnswerSchema.safeParse(answer);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  return {
    ok: true,
    ringIndex: parsed.data.ringIndex,
    expectedSequence: parsed.data.expectedSequence,
    final: parsed.data.final,
  };
}
