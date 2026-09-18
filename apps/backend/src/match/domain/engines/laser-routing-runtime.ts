import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
  ChallengeRound,
} from '../types';
import type { SeatChallengeVariant } from '../seat-variants';
import { hashStringToSeed } from './complete-sum';
import {
  LASER_ROUTING_ENGINE_ID,
  buildInitialLaserRoutingPlayerState,
  generateLaserRoutingForPlayer,
  toLaserRoutingPublicPlayerPayload,
  type LaserRoutingRoundState,
} from './laser-routing';
import { resolveLaserRoutingGenerationConfig } from '@thelastheart/contracts';

export {
  LASER_ROUTING_ENGINE_ID,
  LASER_ROUTING_SUCCESS_HOLD_MS,
  applyLaserRoutingCommand,
  buildInitialLaserRoutingPlayerState,
  cloneLaserRoutingState,
  generateLaserRoutingForPlayer,
  markLaserRoutingTimeouts,
  toLaserRoutingPublicPlayerPayload,
  validateLaserRoutingAnswer,
  type LaserRoutingPlayerState,
  type LaserRoutingPublicPlayerPayload,
  type LaserRoutingRoundState,
} from './laser-routing';

export class LaserRoutingEvaluator implements ChallengeEvaluator {
  readonly engineId = LASER_ROUTING_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.answer['_laserRoutingSucceeded'] === true) {
      return {
        success: true,
        reasonKey: 'result.success',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }
    if (
      input.answer['_laserRoutingTimedOut'] === true ||
      input.receivedMonoMs > input.deadlineMonoMs
    ) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    return { success: false, reasonKey: 'result.laser.incomplete' };
  }
}

export function materializeLaserRoutingRound(
  challenge: ChallengeRound,
  timing: {
    startsAtMs: number;
    startsMonoMs: number;
    deadlineAtMs: number;
    deadlineMonoMs: number;
  },
  baseSeed?: number,
): LaserRoutingRoundState {
  const participantIds = [...challenge.participatingPlayerIds];
  if (participantIds.length < 1 || participantIds.length > 6) {
    throw new Error(
      `laser.routing requires 1–6 participants, got ${participantIds.length}`,
    );
  }

  const config = resolveLaserRoutingGenerationConfig(
    challenge.definition.serverConfig,
    challenge.definition.durationMs,
  );
  const configuredSeed =
    typeof baseSeed === 'number'
      ? baseSeed
      : typeof challenge.definition.serverConfig['seed'] === 'number'
        ? challenge.definition.serverConfig['seed']
        : hashStringToSeed(challenge.challengeInstanceId);

  const players: LaserRoutingRoundState['players'] = {};
  for (const playerId of participantIds) {
    const generated = generateLaserRoutingForPlayer({
      challengeInstanceId: challenge.challengeInstanceId,
      playerId,
      baseSeed: configuredSeed,
      serverConfig: challenge.definition.serverConfig,
      durationMs: challenge.definition.durationMs,
    });
    players[playerId] = buildInitialLaserRoutingPlayerState({
      playerId,
      challengeInstanceId: challenge.challengeInstanceId,
      generated,
      puzzleStartsAtMs: timing.startsAtMs,
      puzzleStartsMonoMs: timing.startsMonoMs,
      deadlineAtMs: timing.deadlineAtMs,
      deadlineMonoMs: timing.deadlineMonoMs,
    });
  }

  const state: LaserRoutingRoundState = {
    challengeInstanceId: challenge.challengeInstanceId,
    startDelayMs: config.startDelayMs,
    difficulty: config.difficulty,
    successResolveAtMonoMs: null,
    players,
  };

  challenge.laserRoutingState = state;
  syncLaserRoutingSeatOverlays(challenge);

  const client = challenge.definition.clientConfig;
  client['startDelayMs'] = config.startDelayMs;
  client['variant'] = config.variant;
  client['difficulty'] = config.difficulty;

  return state;
}

export function syncLaserRoutingSeatOverlays(challenge: ChallengeRound): void {
  const state = challenge.laserRoutingState;
  if (!state) return;
  const seats =
    challenge.seatVariants ?? new Map<string, SeatChallengeVariant>();
  for (const [playerId, player] of Object.entries(state.players)) {
    const payload = toLaserRoutingPublicPlayerPayload(state, player);
    const existing = seats.get(playerId);
    seats.set(playerId, {
      clientOverlay: {
        ...(existing?.clientOverlay ?? {}),
        ...payload,
      },
      serverOverlay: {
        ...(existing?.serverOverlay ?? {}),
        seed: payload.seed,
        variant: payload.variant,
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
      delete seat.clientOverlay['board'];
      delete seat.clientOverlay['traces'];
      delete seat.clientOverlay['seed'];
    }
  }
  challenge.seatVariants = seats;
}

export function mergeLaserRoutingIntoClientConfig(
  clientConfig: Record<string, unknown>,
  state: LaserRoutingRoundState,
  viewerPlayerId?: string,
): void {
  clientConfig['startDelayMs'] = state.startDelayMs;
  clientConfig['difficulty'] = state.difficulty;

  if (viewerPlayerId == null) {
    delete clientConfig['board'];
    delete clientConfig['traces'];
    delete clientConfig['seed'];
    delete clientConfig['solvedState'];
    return;
  }
  const player = state.players[viewerPlayerId];
  if (!player) {
    clientConfig['isParticipant'] = false;
    delete clientConfig['board'];
    delete clientConfig['traces'];
    delete clientConfig['seed'];
    return;
  }
  const payload = toLaserRoutingPublicPlayerPayload(state, player);
  Object.assign(clientConfig, payload);
}
