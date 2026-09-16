import {
  PASS_THE_PULSE_DEFAULT_TIMING,
  socialPassThePulseAnswerSchema,
  type PassThePulsePlayerResult,
} from '@thelastheart/contracts';
import {
  createSeededRng,
  hashStringToSeed,
} from './complete-sum';

export const SOCIAL_PASS_THE_PULSE_ENGINE_ID = 'social.pass_the_pulse';

export type PassThePulseLegState = {
  legId: string;
  playerId: string;
  routeIndex: number;
  travelStartAtMs: number;
  travelStartMonoMs: number;
  expectedArrivalAtMs: number;
  expectedArrivalMonoMs: number;
  windowOpensAtMs: number;
  windowOpensMonoMs: number;
  windowClosesAtMs: number;
  windowClosesMonoMs: number;
};

export type PassThePulsePublicPayload = {
  schemaVersion: 1;
  participants: Array<{ playerId: string; displayName: string }>;
  routePlayerIds: string[];
  pulseStartAtMs: number;
  startDelayMs: number;
  segmentDurationMs: number;
  hitWindowEarlyMs: number;
  hitWindowLateMs: number;
  resultTransitionMs: number;
  legs: Array<{
    legId: string;
    playerId: string;
    routeIndex: number;
    travelStartAtMs: number;
    expectedArrivalAtMs: number;
    windowOpensAtMs: number;
    windowClosesAtMs: number;
  }>;
  currentLegId: string | null;
  currentTargetPlayerId: string | null;
  results: Record<string, PassThePulsePlayerResult>;
  stateSequence: number;
  challengeStatus: 'active' | 'completed';
};

export type PassThePulseRoundState = Omit<PassThePulsePublicPayload, 'legs'> & {
  pulseStartMonoMs: number;
  legs: PassThePulseLegState[];
  /** Defer challenge resolve so clients can play the final wave. */
  completeResolveAtMonoMs?: number | null;
};

export type PassThePulseTimingConfig = {
  startDelayMs: number;
  segmentDurationMs: number;
  hitWindowEarlyMs: number;
  hitWindowLateMs: number;
  resultTransitionMs: number;
};

export class PassThePulseConfigError extends Error {
  readonly code = 'PASS_THE_PULSE_INVALID_CONFIG';

  constructor(message: string) {
    super(message);
    this.name = 'PassThePulseConfigError';
  }
}

export function resolvePassThePulseTiming(
  server: Record<string, unknown>,
): PassThePulseTimingConfig {
  const startDelayMs = readPositiveMs(
    server['startDelayMs'],
    PASS_THE_PULSE_DEFAULT_TIMING.startDelayMs,
    10_000,
  );
  const segmentDurationMs = readPositiveMs(
    server['segmentDurationMs'],
    PASS_THE_PULSE_DEFAULT_TIMING.segmentDurationMs,
    60_000,
  );
  const hitWindowEarlyMs = readNonNegMs(
    server['hitWindowEarlyMs'],
    PASS_THE_PULSE_DEFAULT_TIMING.hitWindowEarlyMs,
    60_000,
  );
  const hitWindowLateMs = readNonNegMs(
    server['hitWindowLateMs'],
    PASS_THE_PULSE_DEFAULT_TIMING.hitWindowLateMs,
    60_000,
  );
  const resultTransitionMs = readNonNegMs(
    server['resultTransitionMs'],
    PASS_THE_PULSE_DEFAULT_TIMING.resultTransitionMs,
    60_000,
  );
  if (hitWindowEarlyMs + hitWindowLateMs > segmentDurationMs) {
    throw new PassThePulseConfigError(
      'hitWindowEarlyMs + hitWindowLateMs must be <= segmentDurationMs',
    );
  }
  return {
    startDelayMs,
    segmentDurationMs,
    hitWindowEarlyMs,
    hitWindowLateMs,
    resultTransitionMs,
  };
}

export function computePassThePulseDurationMs(
  participantCount: number,
  timing: PassThePulseTimingConfig,
): number {
  if (participantCount < 2 || participantCount > 6) {
    throw new PassThePulseConfigError(
      `pass_the_pulse requires 2–6 participants, got ${participantCount}`,
    );
  }
  return (
    timing.startDelayMs +
    participantCount * timing.segmentDurationMs +
    timing.hitWindowLateMs +
    timing.resultTransitionMs
  );
}

/**
 * Keep Studio `durationMs` authoritative. If the configured pulse timeline
 * would overrun the active challenge window, compress segment duration so
 * every seat still receives a reachable window before the deadline.
 */
export function fitPassThePulseTimingToDuration(
  participantCount: number,
  timing: PassThePulseTimingConfig,
  durationMs: number,
): PassThePulseTimingConfig {
  const needed = computePassThePulseDurationMs(participantCount, timing);
  if (needed <= durationMs) {
    return timing;
  }

  const fixedOverhead =
    timing.startDelayMs + timing.hitWindowLateMs + timing.resultTransitionMs;
  const availableForSegments = durationMs - fixedOverhead;
  const minSegment =
    timing.hitWindowEarlyMs + timing.hitWindowLateMs + 1;
  if (availableForSegments < participantCount * minSegment) {
    throw new PassThePulseConfigError(
      `active challenge time ${durationMs}ms is too short for ${participantCount} players with the configured timing windows`,
    );
  }

  return {
    ...timing,
    segmentDurationMs: Math.floor(availableForSegments / participantCount),
  };
}

function readPositiveMs(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return fallback;
  }
  if (raw < 1 || raw > max) {
    throw new PassThePulseConfigError(
      `timing value out of range: ${raw}`,
    );
  }
  return raw;
}

function readNonNegMs(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return fallback;
  }
  if (raw < 0 || raw > max) {
    throw new PassThePulseConfigError(
      `timing value out of range: ${raw}`,
    );
  }
  return raw;
}

function safeDisplayName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, 64);
}

/** Fisher–Yates shuffle with seeded RNG — every participant appears once. */
export function generatePassThePulseRoute(
  participantIds: string[],
  seed: number,
): string[] {
  if (participantIds.length < 2 || participantIds.length > 6) {
    throw new PassThePulseConfigError(
      `pass_the_pulse requires 2–6 participants, got ${participantIds.length}`,
    );
  }
  const unique = new Set(participantIds);
  if (unique.size !== participantIds.length) {
    throw new PassThePulseConfigError('duplicate participant ids');
  }
  const route = [...participantIds];
  const rng = createSeededRng(seed);
  for (let i = route.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = route[i]!;
    route[i] = route[j]!;
    route[j] = tmp;
  }
  return route;
}

export function buildPassThePulseLegs(input: {
  routePlayerIds: string[];
  pulseStartAtMs: number;
  pulseStartMonoMs: number;
  timing: PassThePulseTimingConfig;
}): PassThePulseLegState[] {
  const { routePlayerIds, pulseStartAtMs, pulseStartMonoMs, timing } = input;
  const legs: PassThePulseLegState[] = [];
  for (let i = 0; i < routePlayerIds.length; i += 1) {
    const travelStartAtMs =
      pulseStartAtMs + timing.startDelayMs + i * timing.segmentDurationMs;
    const travelStartMonoMs =
      pulseStartMonoMs + timing.startDelayMs + i * timing.segmentDurationMs;
    const expectedArrivalAtMs = travelStartAtMs + timing.segmentDurationMs;
    const expectedArrivalMonoMs = travelStartMonoMs + timing.segmentDurationMs;
    const windowOpensAtMs = expectedArrivalAtMs - timing.hitWindowEarlyMs;
    const windowOpensMonoMs = expectedArrivalMonoMs - timing.hitWindowEarlyMs;
    const windowClosesAtMs = expectedArrivalAtMs + timing.hitWindowLateMs;
    const windowClosesMonoMs = expectedArrivalMonoMs + timing.hitWindowLateMs;
    legs.push({
      legId: `leg-${i}`,
      playerId: routePlayerIds[i]!,
      routeIndex: i,
      travelStartAtMs,
      travelStartMonoMs,
      expectedArrivalAtMs,
      expectedArrivalMonoMs,
      windowOpensAtMs,
      windowOpensMonoMs,
      windowClosesAtMs,
      windowClosesMonoMs,
    });
  }
  return legs;
}

export function buildInitialPassThePulseState(input: {
  participantIds: string[];
  displayNamesByPlayerId: Record<string, string>;
  routePlayerIds: string[];
  pulseStartAtMs: number;
  pulseStartMonoMs: number;
  timing: PassThePulseTimingConfig;
}): PassThePulseRoundState {
  const { participantIds, routePlayerIds, timing } = input;
  if (participantIds.length !== routePlayerIds.length) {
    throw new PassThePulseConfigError('route length mismatch');
  }
  for (const id of routePlayerIds) {
    if (!participantIds.includes(id)) {
      throw new PassThePulseConfigError(`route player missing from freeze: ${id}`);
    }
  }
  const results: Record<string, PassThePulsePlayerResult> = {};
  const participants: Array<{ playerId: string; displayName: string }> = [];
  for (const playerId of routePlayerIds) {
    results[playerId] = 'waiting';
    participants.push({
      playerId,
      displayName: safeDisplayName(
        input.displayNamesByPlayerId[playerId],
        'Player',
      ),
    });
  }
  const legs = buildPassThePulseLegs({
    routePlayerIds,
    pulseStartAtMs: input.pulseStartAtMs,
    pulseStartMonoMs: input.pulseStartMonoMs,
    timing,
  });
  const first = legs[0]!;
  return {
    schemaVersion: 1,
    participants,
    routePlayerIds: [...routePlayerIds],
    pulseStartAtMs: input.pulseStartAtMs,
    pulseStartMonoMs: input.pulseStartMonoMs,
    startDelayMs: timing.startDelayMs,
    segmentDurationMs: timing.segmentDurationMs,
    hitWindowEarlyMs: timing.hitWindowEarlyMs,
    hitWindowLateMs: timing.hitWindowLateMs,
    resultTransitionMs: timing.resultTransitionMs,
    legs,
    currentLegId: first.legId,
    currentTargetPlayerId: first.playerId,
    results,
    stateSequence: 0,
    challengeStatus: 'active',
    completeResolveAtMonoMs: null,
  };
}

export function toPassThePulsePublicPayload(
  state: PassThePulseRoundState,
): PassThePulsePublicPayload {
  return {
    schemaVersion: 1,
    participants: state.participants.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
    })),
    routePlayerIds: [...state.routePlayerIds],
    pulseStartAtMs: state.pulseStartAtMs,
    startDelayMs: state.startDelayMs,
    segmentDurationMs: state.segmentDurationMs,
    hitWindowEarlyMs: state.hitWindowEarlyMs,
    hitWindowLateMs: state.hitWindowLateMs,
    resultTransitionMs: state.resultTransitionMs,
    legs: state.legs.map((leg) => ({
      legId: leg.legId,
      playerId: leg.playerId,
      routeIndex: leg.routeIndex,
      travelStartAtMs: leg.travelStartAtMs,
      expectedArrivalAtMs: leg.expectedArrivalAtMs,
      windowOpensAtMs: leg.windowOpensAtMs,
      windowClosesAtMs: leg.windowClosesAtMs,
    })),
    currentLegId: state.currentLegId,
    currentTargetPlayerId: state.currentTargetPlayerId,
    results: { ...state.results },
    stateSequence: state.stateSequence,
    challengeStatus: state.challengeStatus,
  };
}

export function clonePassThePulseState(
  state: PassThePulseRoundState,
): PassThePulseRoundState {
  return {
    ...toPassThePulsePublicPayload(state),
    pulseStartMonoMs: state.pulseStartMonoMs,
    legs: state.legs.map((leg) => ({ ...leg })),
    completeResolveAtMonoMs: state.completeResolveAtMonoMs ?? null,
  };
}

function advanceCurrentLeg(state: PassThePulseRoundState): PassThePulseRoundState {
  const nextWaiting = state.legs.find(
    (leg) => state.results[leg.playerId] === 'waiting',
  );
  if (!nextWaiting) {
    return {
      ...state,
      currentLegId: null,
      currentTargetPlayerId: null,
      challengeStatus: 'completed',
    };
  }
  return {
    ...state,
    currentLegId: nextWaiting.legId,
    currentTargetPlayerId: nextWaiting.playerId,
  };
}

function maybeScheduleComplete(
  state: PassThePulseRoundState,
  nowMonoMs: number,
): PassThePulseRoundState {
  const allResolved = state.routePlayerIds.every(
    (id) => state.results[id] === 'hit' || state.results[id] === 'missed',
  );
  if (!allResolved) {
    return state;
  }
  const completed = advanceCurrentLeg({
    ...state,
    challengeStatus: 'completed',
  });
  return {
    ...completed,
    completeResolveAtMonoMs:
      completed.completeResolveAtMonoMs ??
      nowMonoMs + completed.resultTransitionMs,
  };
}

export type ApplyPassThePulseTapResult =
  | {
      ok: true;
      state: PassThePulseRoundState;
      outcome: 'hit' | 'missed';
    }
  | { ok: false; reason: string };

/**
 * Authoritative tap handling.
 * Inclusive window: accepted when opens <= now <= closes.
 * Early (before opens) → missed. Late → rejected (timer owns the miss).
 */
export function applyPassThePulseTap(input: {
  state: PassThePulseRoundState;
  playerId: string;
  legId: string;
  nowMonoMs: number;
}): ApplyPassThePulseTapResult {
  const { state, playerId, legId, nowMonoMs } = input;
  if (state.challengeStatus === 'completed') {
    return { ok: false, reason: 'already_completed' };
  }
  const leg = state.legs.find((l) => l.legId === legId);
  if (!leg) {
    return { ok: false, reason: 'stale_leg' };
  }
  if (leg.playerId !== playerId) {
    return { ok: false, reason: 'not_your_turn' };
  }
  if (state.currentLegId !== legId || state.currentTargetPlayerId !== playerId) {
    return { ok: false, reason: 'not_your_turn' };
  }
  if (state.results[playerId] !== 'waiting') {
    return { ok: false, reason: 'already_resolved' };
  }

  let outcome: 'hit' | 'missed';
  if (nowMonoMs < leg.windowOpensMonoMs) {
    outcome = 'missed';
  } else if (nowMonoMs > leg.windowClosesMonoMs) {
    return { ok: false, reason: 'late' };
  } else {
    // Inclusive boundary at both ends.
    outcome = 'hit';
  }

  const results = { ...state.results, [playerId]: outcome };
  let next: PassThePulseRoundState = {
    ...state,
    results,
    stateSequence: state.stateSequence + 1,
  };
  next = advanceCurrentLeg(next);
  next = maybeScheduleComplete(next, nowMonoMs);
  return { ok: true, state: next, outcome };
}

/** Mark waiting targets whose window has closed as missed. */
export function resolveDuePassThePulseMisses(input: {
  state: PassThePulseRoundState;
  nowMonoMs: number;
}): { changed: boolean; state: PassThePulseRoundState } {
  let state = input.state;
  if (state.challengeStatus === 'completed') {
    return { changed: false, state };
  }
  let changed = false;
  for (const leg of state.legs) {
    if (state.results[leg.playerId] !== 'waiting') continue;
    // Inclusive: miss only when strictly after close.
    if (input.nowMonoMs <= leg.windowClosesMonoMs) continue;
    state = {
      ...state,
      results: { ...state.results, [leg.playerId]: 'missed' },
      stateSequence: state.stateSequence + 1,
    };
    changed = true;
  }
  if (!changed) {
    return { changed: false, state };
  }
  state = advanceCurrentLeg(state);
  state = maybeScheduleComplete(state, input.nowMonoMs);
  return { changed: true, state };
}

export function validatePassThePulseTapAnswer(
  answer: Record<string, unknown>,
): { ok: true; legId: string } | { ok: false; reason: string } {
  const parsed = socialPassThePulseAnswerSchema.safeParse(answer);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, legId: parsed.data.legId };
}

export function resolvePassThePulseSeed(
  challengeInstanceId: string,
  participantIds: string[],
  configured?: number,
): number {
  if (typeof configured === 'number' && Number.isFinite(configured)) {
    return configured >>> 0;
  }
  return hashStringToSeed(`${challengeInstanceId}:${participantIds.join(',')}`);
}

export { hashStringToSeed, createSeededRng };
