import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
  ChallengeRound,
  PlayerState,
} from '../types';
import type { SeatChallengeVariant } from '../seat-variants';
import {
  SOCIAL_PASS_THE_PULSE_ENGINE_ID,
  buildInitialPassThePulseState,
  fitPassThePulseTimingToDuration,
  generatePassThePulseRoute,
  resolvePassThePulseSeed,
  resolvePassThePulseTiming,
  toPassThePulsePublicPayload,
  type PassThePulseRoundState,
} from './pass-the-pulse';

export {
  SOCIAL_PASS_THE_PULSE_ENGINE_ID,
  applyPassThePulseTap,
  buildInitialPassThePulseState,
  buildPassThePulseLegs,
  clonePassThePulseState,
  computePassThePulseDurationMs,
  fitPassThePulseTimingToDuration,
  generatePassThePulseRoute,
  resolveDuePassThePulseMisses,
  resolvePassThePulseSeed,
  resolvePassThePulseTiming,
  toPassThePulsePublicPayload,
  validatePassThePulseTapAnswer,
  PassThePulseConfigError,
  type PassThePulseRoundState,
  type PassThePulsePublicPayload,
} from './pass-the-pulse';

export class SocialPassThePulseEvaluator implements ChallengeEvaluator {
  readonly engineId = SOCIAL_PASS_THE_PULSE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.answer['_passThePulseHit'] === true) {
      return {
        success: true,
        reasonKey: 'result.success',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }
    if (input.answer['_passThePulseMissed'] === true) {
      return {
        success: false,
        reasonKey: 'result.pass_the_pulse.missed',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    return { success: false, reasonKey: 'result.pass_the_pulse.missed' };
  }
}

export function materializePassThePulseRound(
  challenge: ChallengeRound,
  players: Map<string, PlayerState>,
  clock: { nowMs: () => number; monoMs: () => number },
  seed?: number,
): PassThePulseRoundState {
  const participantIds = [...challenge.participatingPlayerIds].filter((id) => {
    const seat = players.get(id);
    return seat != null && seat.status === 'active';
  });
  if (participantIds.length < 2 || participantIds.length > 6) {
    throw new Error(
      `social.pass_the_pulse requires 2–6 active participants, got ${participantIds.length}`,
    );
  }

  challenge.participatingPlayerIds = participantIds;

  const timing = fitPassThePulseTimingToDuration(
    participantIds.length,
    resolvePassThePulseTiming(challenge.definition.serverConfig),
    challenge.definition.durationMs,
  );
  const configuredSeed =
    typeof seed === 'number'
      ? seed
      : typeof challenge.definition.serverConfig['seed'] === 'number'
        ? (challenge.definition.serverConfig['seed'] as number)
        : undefined;
  const resolvedSeed = resolvePassThePulseSeed(
    challenge.challengeInstanceId,
    participantIds,
    configuredSeed,
  );
  const routePlayerIds = generatePassThePulseRoute(participantIds, resolvedSeed);

  const displayNamesByPlayerId: Record<string, string> = {};
  for (const playerId of participantIds) {
    const seat = players.get(playerId);
    const raw = seat?.displayName;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    displayNamesByPlayerId[playerId] =
      trimmed.length > 0 ? trimmed.slice(0, 64) : 'Player';
  }

  const nowWall = clock.nowMs();
  const nowMono = clock.monoMs();
  const state = buildInitialPassThePulseState({
    participantIds,
    displayNamesByPlayerId,
    routePlayerIds,
    pulseStartAtMs: nowWall,
    pulseStartMonoMs: nowMono,
    timing,
  });

  // Studio "Active challenge time" stays authoritative — do not rewrite it.
  const durationMs = challenge.definition.durationMs;
  challenge.deadlineAtMs = nowWall + durationMs;
  challenge.deadlineMonoMs = nowMono + durationMs;

  const server = challenge.definition.serverConfig;
  server['frozenParticipantIds'] = participantIds;
  server['frozenDisplayNames'] = { ...displayNamesByPlayerId };
  server['routePlayerIds'] = [...routePlayerIds];
  server['startDelayMs'] = timing.startDelayMs;
  server['segmentDurationMs'] = timing.segmentDurationMs;
  server['hitWindowEarlyMs'] = timing.hitWindowEarlyMs;
  server['hitWindowLateMs'] = timing.hitWindowLateMs;
  server['resultTransitionMs'] = timing.resultTransitionMs;
  server['seed'] = resolvedSeed;

  // Seat overlays so live broadcasts personalize isParticipant (same pattern
  // as complete_sum / pair_sync). Spectators get isParticipant: false.
  const seats = new Map<string, SeatChallengeVariant>();
  for (const playerId of participantIds) {
    seats.set(playerId, {
      clientOverlay: { isParticipant: true },
      serverOverlay: {},
    });
  }
  for (const [playerId, seat] of players) {
    if (seats.has(playerId)) continue;
    if (seat.status === 'spectator' || seat.status === 'left') {
      seats.set(playerId, {
        clientOverlay: { isParticipant: false },
        serverOverlay: {},
      });
    }
  }
  challenge.seatVariants = seats;

  challenge.passThePulseState = state;
  return state;
}

export function mergePassThePulseIntoClientConfig(
  clientConfig: Record<string, unknown>,
  state: PassThePulseRoundState,
  viewerPlayerId?: string,
): void {
  const pub = toPassThePulsePublicPayload(state);
  clientConfig['schemaVersion'] = pub.schemaVersion;
  clientConfig['participants'] = pub.participants;
  clientConfig['routePlayerIds'] = pub.routePlayerIds;
  clientConfig['pulseStartAtMs'] = pub.pulseStartAtMs;
  clientConfig['startDelayMs'] = pub.startDelayMs;
  clientConfig['segmentDurationMs'] = pub.segmentDurationMs;
  clientConfig['hitWindowEarlyMs'] = pub.hitWindowEarlyMs;
  clientConfig['hitWindowLateMs'] = pub.hitWindowLateMs;
  clientConfig['resultTransitionMs'] = pub.resultTransitionMs;
  clientConfig['legs'] = pub.legs;
  clientConfig['currentLegId'] = pub.currentLegId;
  clientConfig['currentTargetPlayerId'] = pub.currentTargetPlayerId;
  clientConfig['results'] = pub.results;
  clientConfig['stateSequence'] = pub.stateSequence;
  clientConfig['challengeStatus'] = pub.challengeStatus;
  if (viewerPlayerId != null) {
    clientConfig['isParticipant'] = state.routePlayerIds.includes(viewerPlayerId);
  }
}
