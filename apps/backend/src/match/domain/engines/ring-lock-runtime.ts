import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
  ChallengeRound,
} from '../types';
import type { SeatChallengeVariant } from '../seat-variants';
import { hashStringToSeed } from './complete-sum';
import {
  PRECISION_RING_LOCK_ENGINE_ID,
  buildInitialRingLockPlayerState,
  generateRingLockPuzzle,
  playerSeedForRingLock,
  resolveRingLockGenerationConfig,
  toRingLockPublicPlayerPayload,
  type RingLockRoundState,
} from './ring-lock';

export {
  PRECISION_RING_LOCK_ENGINE_ID,
  applyRingLockCommand,
  buildInitialRingLockPlayerState,
  circularDistanceDeg,
  cloneRingLockState,
  generateRingLockPuzzle,
  markRingLockTimeouts,
  maxWaitMsToTarget,
  normalizeAngleDeg,
  playerSeedForRingLock,
  resolveRingLockGenerationConfig,
  ringAngleAtElapsedMs,
  signedCircularDistanceDeg,
  toRingLockPublicPlayerPayload,
  validateRingLockAnswer,
  validateRingLockSolvability,
  RingLockConfigError,
  type RingLockPlayerState,
  type RingLockPublicPlayerPayload,
  type RingLockRoundState,
} from './ring-lock';

export { hashStringToSeed } from './complete-sum';

export class PrecisionRingLockEvaluator implements ChallengeEvaluator {
  readonly engineId = PRECISION_RING_LOCK_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.answer['_ringLockSucceeded'] === true) {
      return {
        success: true,
        reasonKey: 'result.success',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }
    if (
      input.answer['_ringLockTimedOut'] === true ||
      input.receivedMonoMs > input.deadlineMonoMs
    ) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    return { success: false, reasonKey: 'result.ring_lock.incomplete' };
  }
}

export function materializeRingLockRound(
  challenge: ChallengeRound,
  timing: {
    startsAtMs: number;
    startsMonoMs: number;
    deadlineAtMs: number;
    deadlineMonoMs: number;
  },
  baseSeed?: number,
): RingLockRoundState {
  const participantIds = [...challenge.participatingPlayerIds];
  if (participantIds.length < 1 || participantIds.length > 6) {
    throw new Error(
      `precision.ring_lock requires 1–6 participants, got ${participantIds.length}`,
    );
  }

  const config = resolveRingLockGenerationConfig(
    challenge.definition.serverConfig,
    challenge.definition.durationMs,
  );
  const configuredSeed =
    typeof baseSeed === 'number'
      ? baseSeed
      : typeof challenge.definition.serverConfig['seed'] === 'number'
        ? (challenge.definition.serverConfig['seed'] as number)
        : hashStringToSeed(challenge.challengeInstanceId);

  const players: RingLockRoundState['players'] = {};
  const seats = new Map<string, SeatChallengeVariant>();

  for (const playerId of participantIds) {
    const seed = playerSeedForRingLock(
      challenge.challengeInstanceId,
      playerId,
      configuredSeed,
    );
    const generated = generateRingLockPuzzle({ seed, config });
    const playerState = buildInitialRingLockPlayerState({
      playerId,
      challengeInstanceId: challenge.challengeInstanceId,
      seed: generated.seed,
      rings: generated.rings,
      puzzleStartsAtMs: timing.startsAtMs,
      puzzleStartsMonoMs: timing.startsMonoMs,
      deadlineAtMs: timing.deadlineAtMs,
      deadlineMonoMs: timing.deadlineMonoMs,
    });
    players[playerId] = playerState;
  }

  const state: RingLockRoundState = {
    challengeInstanceId: challenge.challengeInstanceId,
    targetAngleDeg: config.targetAngleDeg,
    alignmentToleranceDeg: config.alignmentToleranceDeg,
    startDelayMs: config.startDelayMs,
    transitionDelayMs: config.transitionDelayMs,
    difficulty: config.difficulty,
    players,
  };

  for (const playerId of participantIds) {
    const payload = toRingLockPublicPlayerPayload(state, players[playerId]!);
    seats.set(playerId, {
      clientOverlay: { ...payload },
      serverOverlay: {
        seed: payload.seed,
        activeRingIndex: payload.activeRingIndex,
      },
    });
  }

  challenge.ringLockState = state;
  challenge.seatVariants = seats;

  const client = challenge.definition.clientConfig;
  client['ringCount'] = 3;
  client['startDelayMs'] = config.startDelayMs;
  client['targetAngleDeg'] = config.targetAngleDeg;
  client['alignmentToleranceDeg'] = config.alignmentToleranceDeg;
  client['transitionDelayMs'] = config.transitionDelayMs;
  client['difficulty'] = config.difficulty;

  return state;
}

export function syncRingLockSeatOverlays(challenge: ChallengeRound): void {
  const state = challenge.ringLockState;
  if (!state) return;
  const seats =
    challenge.seatVariants ?? new Map<string, SeatChallengeVariant>();
  for (const [playerId, player] of Object.entries(state.players)) {
    const payload = toRingLockPublicPlayerPayload(state, player);
    const existing = seats.get(playerId);
    seats.set(playerId, {
      clientOverlay: {
        ...(existing?.clientOverlay ?? {}),
        ...payload,
      },
      serverOverlay: {
        ...(existing?.serverOverlay ?? {}),
        seed: payload.seed,
        activeRingIndex: payload.activeRingIndex,
      },
      signalPhase: existing?.signalPhase,
      signalToken: existing?.signalToken,
      signalAtMonoMs: existing?.signalAtMonoMs,
      signaledAtMs: existing?.signaledAtMs,
      signalEndsAtMs: existing?.signalEndsAtMs,
      signalEndsAtMonoMs: existing?.signalEndsAtMonoMs,
    });
  }
  for (const [playerId, seat] of seats) {
    if (state.players[playerId] == null) {
      seat.clientOverlay['isParticipant'] = false;
      delete seat.clientOverlay['rings'];
      delete seat.clientOverlay['seed'];
    }
  }
  challenge.seatVariants = seats;
}

export function mergeRingLockIntoClientConfig(
  clientConfig: Record<string, unknown>,
  state: RingLockRoundState,
  viewerPlayerId?: string,
): void {
  clientConfig['ringCount'] = 3;
  clientConfig['startDelayMs'] = state.startDelayMs;
  clientConfig['targetAngleDeg'] = state.targetAngleDeg;
  clientConfig['alignmentToleranceDeg'] = state.alignmentToleranceDeg;
  clientConfig['transitionDelayMs'] = state.transitionDelayMs;
  clientConfig['difficulty'] = state.difficulty;

  if (viewerPlayerId == null) {
    return;
  }
  const player = state.players[viewerPlayerId];
  if (!player) {
    clientConfig['isParticipant'] = false;
    delete clientConfig['rings'];
    delete clientConfig['seed'];
    return;
  }
  const payload = toRingLockPublicPlayerPayload(state, player);
  Object.assign(clientConfig, payload);
}
