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
  completeResolveAtMonoMs: number | null;
};

export type PassThePulseTimingConfig = {
  startDelayMs: number;
  segmentDurationMs: number;
  hitWindowEarlyMs: number;
  hitWindowLateMs: number;
  resultTransitionMs: number;
};

export class PassThePulseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassThePulseConfigError';
  }
}

function safeDisplayName(raw: string | undefined, fallback: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed.slice(0, 64) : fallback;
}

export function resolvePassThePulseTiming(
  serverConfig: Record<string, unknown>,
): PassThePulseTimingConfig {
  const defaults = PASS_THE_PULSE_DEFAULT_TIMING;
  const startDelayMs =
    typeof serverConfig['startDelayMs'] === 'number'
      ? Math.floor(serverConfig['startDelayMs'])
      : defaults.startDelayMs;
  const segmentDurationMs =
    typeof serverConfig['segmentDurationMs'] === 'number'
      ? Math.floor(serverConfig['segmentDurationMs'])
      : defaults.segmentDurationMs;
  const hitWindowEarlyMs =
    typeof serverConfig['hitWindowEarlyMs'] === 'number'
      ? Math.floor(serverConfig['hitWindowEarlyMs'])
      : defaults.hitWindowEarlyMs;
  const hitWindowLateMs =
    typeof serverConfig['hitWindowLateMs'] === 'number'
      ? Math.floor(serverConfig['hitWindowLateMs'])
      : defaults.hitWindowLateMs;
  const resultTransitionMs =
    typeof serverConfig['resultTransitionMs'] === 'number'
      ? Math.floor(serverConfig['resultTransitionMs'])
      : defaults.resultTransitionMs;
  if (startDelayMs < 0 || segmentDurationMs <= 0) {
    throw new PassThePulseConfigError('invalid pass_the_pulse timing');
  }
  if (hitWindowEarlyMs + hitWindowLateMs > segmentDurationMs) {
    throw new PassThePulseConfigError(
      'hit windows must fit within segmentDurationMs',
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

/** Natural one-lap duration (used to fit Studio active time). */
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

export function fitPassThePulseTimingToDuration(
  participantCount: number,
  timing: PassThePulseTimingConfig,
  durationMs: number,
): PassThePulseTimingConfig {
  const needed = computePassThePulseDurationMs(participantCount, timing);
  if (needed <= durationMs) {
    return timing;
  }
  const fixed =
    timing.startDelayMs + timing.hitWindowLateMs + timing.resultTransitionMs;
  const budget = durationMs - fixed;
  if (budget < participantCount * 200) {
    throw new PassThePulseConfigError(
      'Studio duration too short for pass_the_pulse',
    );
  }
  let segmentDurationMs = Math.floor(budget / participantCount);
  let hitWindowEarlyMs = Math.min(
    timing.hitWindowEarlyMs,
    Math.floor(segmentDurationMs * 0.35),
  );
  let hitWindowLateMs = Math.min(
    timing.hitWindowLateMs,
    Math.floor(segmentDurationMs * 0.35),
  );
  if (hitWindowEarlyMs + hitWindowLateMs > segmentDurationMs) {
    throw new PassThePulseConfigError(
      'compressed hit windows exceed segment',
    );
  }
  if (segmentDurationMs < 200) {
    throw new PassThePulseConfigError(
      'compressed segmentDurationMs too small',
    );
  }
  return {
    ...timing,
    segmentDurationMs,
    hitWindowEarlyMs,
    hitWindowLateMs,
  };
}

export function generatePassThePulseRoute(
  participantIds: string[],
  seed: number,
): string[] {
  if (participantIds.length < 2 || participantIds.length > 6) {
    throw new PassThePulseConfigError(
      `pass_the_pulse requires 2–6 participants, got ${participantIds.length}`,
    );
  }
  if (new Set(participantIds).size !== participantIds.length) {
    throw new PassThePulseConfigError('duplicate participant ids');
  }
  const rng = createSeededRng(seed >>> 0);
  const route = [...participantIds];
  for (let i = route.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = route[i]!;
    route[i] = route[j]!;
    route[j] = tmp;
  }
  return route;
}

function timingFromState(state: PassThePulseRoundState): PassThePulseTimingConfig {
  return {
    startDelayMs: state.startDelayMs,
    segmentDurationMs: state.segmentDurationMs,
    hitWindowEarlyMs: state.hitWindowEarlyMs,
    hitWindowLateMs: state.hitWindowLateMs,
    resultTransitionMs: state.resultTransitionMs,
  };
}

function wallFromMono(state: PassThePulseRoundState, nowMonoMs: number): number {
  return state.pulseStartAtMs + (nowMonoMs - state.pulseStartMonoMs);
}

function makeLeg(input: {
  legIndex: number;
  playerId: string;
  routeIndex: number;
  travelStartAtMs: number;
  travelStartMonoMs: number;
  timing: PassThePulseTimingConfig;
}): PassThePulseLegState {
  const { timing } = input;
  const expectedArrivalAtMs = input.travelStartAtMs + timing.segmentDurationMs;
  const expectedArrivalMonoMs =
    input.travelStartMonoMs + timing.segmentDurationMs;
  return {
    legId: `leg-${input.legIndex}`,
    playerId: input.playerId,
    routeIndex: input.routeIndex,
    travelStartAtMs: input.travelStartAtMs,
    travelStartMonoMs: input.travelStartMonoMs,
    expectedArrivalAtMs,
    expectedArrivalMonoMs,
    windowOpensAtMs: expectedArrivalAtMs - timing.hitWindowEarlyMs,
    windowOpensMonoMs: expectedArrivalMonoMs - timing.hitWindowEarlyMs,
    windowClosesAtMs: expectedArrivalAtMs + timing.hitWindowLateMs,
    windowClosesMonoMs: expectedArrivalMonoMs + timing.hitWindowLateMs,
  };
}

/** Next clockwise waiting seat after `afterPlayerId` (or first waiting). */
export function nextWaitingPlayerId(
  state: PassThePulseRoundState,
  afterPlayerId: string | null,
): string | null {
  const waiting = state.routePlayerIds.filter(
    (id) => state.results[id] === 'waiting',
  );
  if (waiting.length === 0) return null;
  if (afterPlayerId == null || !state.routePlayerIds.includes(afterPlayerId)) {
    return waiting[0]!;
  }
  const route = state.routePlayerIds;
  const start = route.indexOf(afterPlayerId);
  for (let step = 1; step <= route.length; step += 1) {
    const id = route[(start + step) % route.length]!;
    if (state.results[id] === 'waiting') return id;
  }
  return waiting[0]!;
}

function appendLegTowardWaiting(
  state: PassThePulseRoundState,
  afterPlayerId: string | null,
  travelStartAtMs: number,
  travelStartMonoMs: number,
): PassThePulseRoundState | null {
  const nextId = nextWaitingPlayerId(state, afterPlayerId);
  if (nextId == null) return null;
  const routeIndex = state.routePlayerIds.indexOf(nextId);
  if (routeIndex < 0) return null;
  const leg = makeLeg({
    legIndex: state.legs.length,
    playerId: nextId,
    routeIndex,
    travelStartAtMs,
    travelStartMonoMs,
    timing: timingFromState(state),
  });
  return {
    ...state,
    legs: [...state.legs, leg],
    currentLegId: leg.legId,
    currentTargetPlayerId: nextId,
    stateSequence: state.stateSequence + 1,
  };
}

/** First-lap helper retained for tests / duration math introspection. */
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
    legs.push(
      makeLeg({
        legIndex: i,
        playerId: routePlayerIds[i]!,
        routeIndex: i,
        travelStartAtMs,
        travelStartMonoMs,
        timing,
      }),
    );
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

  // Start with a single leg; further visits are appended so the pulse can
  // keep looping among seats that have not pressed yet.
  const firstId = routePlayerIds[0]!;
  const firstLeg = makeLeg({
    legIndex: 0,
    playerId: firstId,
    routeIndex: 0,
    travelStartAtMs: input.pulseStartAtMs + timing.startDelayMs,
    travelStartMonoMs: input.pulseStartMonoMs + timing.startDelayMs,
    timing,
  });

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
    legs: [firstLeg],
    currentLegId: firstLeg.legId,
    currentTargetPlayerId: firstId,
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
  return {
    ...state,
    challengeStatus: 'completed',
    currentLegId: null,
    currentTargetPlayerId: null,
    completeResolveAtMonoMs:
      state.completeResolveAtMonoMs ??
      nowMonoMs + state.resultTransitionMs,
  };
}

/** After a seat resolves or a window expires, continue among waiting seats. */
function continueAmongWaiting(
  state: PassThePulseRoundState,
  afterPlayerId: string,
  nowMonoMs: number,
): PassThePulseRoundState {
  const completed = maybeScheduleComplete(state, nowMonoMs);
  if (completed.challengeStatus === 'completed') {
    return completed;
  }
  const travelStartMonoMs = Math.max(nowMonoMs, nowMonoMs);
  const travelStartAtMs = wallFromMono(state, travelStartMonoMs);
  const next = appendLegTowardWaiting(
    completed,
    afterPlayerId,
    travelStartAtMs,
    travelStartMonoMs,
  );
  if (next == null) {
    return maybeScheduleComplete(completed, nowMonoMs);
  }
  return next;
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
 * Early (before opens) → missed (lose, button disabled). Late → rejected
 * (timer advances the loop without resolving the seat).
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
  if (state.results[playerId] !== 'waiting') {
    return { ok: false, reason: 'already_resolved' };
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

  let outcome: 'hit' | 'missed';
  if (nowMonoMs < leg.windowOpensMonoMs) {
    outcome = 'missed';
  } else if (nowMonoMs > leg.windowClosesMonoMs) {
    return { ok: false, reason: 'late' };
  } else {
    outcome = 'hit';
  }

  const results = { ...state.results, [playerId]: outcome };
  let next: PassThePulseRoundState = {
    ...state,
    results,
    stateSequence: state.stateSequence + 1,
  };
  next = continueAmongWaiting(next, playerId, nowMonoMs);
  return { ok: true, state: next, outcome };
}

/**
 * When the current window closes without a tap, do NOT mark a miss — keep the
 * seat waiting and loop the pulse to the next player who has not pressed yet.
 * Permanent misses for still-waiting seats happen only at the global deadline.
 */
export function resolveDuePassThePulseMisses(input: {
  state: PassThePulseRoundState;
  nowMonoMs: number;
}): { changed: boolean; state: PassThePulseRoundState } {
  let state = input.state;
  if (state.challengeStatus === 'completed') {
    return { changed: false, state };
  }
  const current = state.legs.find((l) => l.legId === state.currentLegId);
  if (!current) {
    return { changed: false, state };
  }
  if (input.nowMonoMs <= current.windowClosesMonoMs) {
    return { changed: false, state };
  }
  // Seat stays waiting; pulse continues clockwise among unresolved seats.
  state = continueAmongWaiting(state, current.playerId, input.nowMonoMs);
  return { changed: true, state };
}

/** Force remaining waiting seats to missed (global deadline). */
export function forceMissRemainingPassThePulse(
  state: PassThePulseRoundState,
): PassThePulseRoundState {
  const results = { ...state.results };
  let seq = state.stateSequence;
  for (const id of state.routePlayerIds) {
    if (results[id] === 'waiting') {
      results[id] = 'missed';
      seq += 1;
    }
  }
  return {
    ...state,
    results,
    stateSequence: seq,
    challengeStatus: 'completed',
    currentLegId: null,
    currentTargetPlayerId: null,
  };
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
