import { randomInt, randomUUID } from 'node:crypto';
import type {
  ChallengeDefinition,
  ChallengeEvaluatorRegistry,
  ChallengeRound,
  Clock,
  CreateMatchOptions,
  DomainEvent,
  MatchMode,
  MatchPhase,
  MatchState,
  PlayerChallengeResolution,
  PlayerState,
  PublicChallengeView,
} from './types';
import {
  DomainError,
  INITIAL_ENERGY,
  INITIAL_HEARTS,
  MATCH_PLAYER_CAPACITY,
  MAX_CHALLENGE_DURATION_MS,
  MIN_CHALLENGE_DURATION_MS,
  MIN_LIVE_MATCH_PLAYERS,
} from './types';
import { WAIT_FOR_SIGNAL_ENGINE_ID } from './wait-for-signal.evaluator';
import {
  assignSeatVariants,
  cloneSeatVariants,
  type SeatChallengeVariant,
} from './seat-variants';
import { materializeMemoryRound } from './memory-round';
import { materializePack31Round } from './engines/pack-31-evaluators';
import {
  applyCompleteSumSelection,
  LOGIC_COMPLETE_SUM_ENGINE_ID,
  materializeCompleteSumRound,
  mergeCompleteSumIntoClientConfig,
  validateCompleteSumSelectionAnswer,
  type CompleteSumRoundState,
} from './engines/complete-sum-runtime';
import {
  applyPassThePulseTap,
  clonePassThePulseState,
  materializePassThePulseRound,
  mergePassThePulseIntoClientConfig,
  resolveDuePassThePulseMisses,
  SOCIAL_PASS_THE_PULSE_ENGINE_ID,
  validatePassThePulseTapAnswer,
} from './engines/pass-the-pulse-runtime';
import {
  cloneInventory,
  convertEnergyForPlayer,
  defaultPowerConfig,
  eligibleDangerPulseTargets,
  grantEventsFromConversion,
  makeAttackId,
  playersWithOffensiveCharge,
  resetMeterAfterPowerConsume,
  applyHeartLoss,
} from './match.powers';
import { EMPTY_INVENTORY, ENERGY_THRESHOLD } from './types';

/**
 * Inclusive deadline boundary (LH-003B / LH-003C):
 * - Submission is late iff `receivedMonoMs > deadlineMonoMs` (accepted at equality).
 * - Timeout resolves iff `monoMs > deadlineMonoMs` (does not resolve at equality).
 * This prevents a race where a submit and a timeout at the exact same mono instant
 * both try to apply hearts/energy.
 */
const WAIT_FOR_SIGNAL_CLIENT_CONFIG_KEYS = [
  'categoryKey',
  'waitingPromptKey',
  'waitingHintKey',
  'activePromptKey',
  'actionKey',
] as const;

function clonePlayers(
  players: Map<string, PlayerState>,
): Map<string, PlayerState> {
  return new Map(
    [...players.entries()].map(([id, player]) => [
      id,
      {
        ...player,
        inventory: cloneInventory(player.inventory ?? EMPTY_INVENTORY),
      },
    ]),
  );
}

function deepCloneJsonRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cloneCompleteSumState(
  state: CompleteSumRoundState,
): CompleteSumRoundState {
  return {
    target: state.target,
    participantIds: [...state.participantIds],
    optionsByPlayerId: Object.fromEntries(
      Object.entries(state.optionsByPlayerId).map(([id, opts]) => [
        id,
        [...opts],
      ]),
    ),
    selections: { ...state.selections },
    currentTotal: state.currentTotal,
    allSelected: state.allSelected,
    stateSequence: state.stateSequence,
    incorrectTotal: state.incorrectTotal,
    successResolveAtMonoMs: state.successResolveAtMonoMs ?? null,
    hidden: {
      solutionByPlayerId: { ...state.hidden.solutionByPlayerId },
    },
  };
}

function assertJsonCompatible(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(
      'INVALID_DEFINITION',
      `${path} must be a JSON object`,
    );
  }
  try {
    JSON.stringify(value);
  } catch {
    throw new DomainError(
      'INVALID_DEFINITION',
      `${path} must be JSON-compatible`,
    );
  }
}

function pinDefinition(definition: ChallengeDefinition): ChallengeDefinition {
  assertJsonCompatible(definition.clientConfig, 'clientConfig');
  assertJsonCompatible(definition.serverConfig, 'serverConfig');
  return {
    ...definition,
    choiceKeys: definition.choiceKeys ? [...definition.choiceKeys] : [],
    clientConfig: deepCloneJsonRecord(definition.clientConfig),
    serverConfig: deepCloneJsonRecord(definition.serverConfig),
  };
}

export function validateChallengeDefinition(
  definition: ChallengeDefinition,
): void {
  if (
    !Number.isInteger(definition.durationMs) ||
    !Number.isFinite(definition.durationMs) ||
    definition.durationMs < MIN_CHALLENGE_DURATION_MS ||
    definition.durationMs > MAX_CHALLENGE_DURATION_MS
  ) {
    throw new DomainError(
      'INVALID_DURATION',
      'challenge duration out of bounds',
    );
  }
  if (
    definition.heartPenaltyOnFailure !== 0 &&
    definition.heartPenaltyOnFailure !== 1
  ) {
    throw new DomainError('INVALID_DEFINITION', 'heart penalty must be 0 or 1');
  }
  if (
    !Number.isInteger(definition.energyRewardOnSuccess) ||
    definition.energyRewardOnSuccess < 0
  ) {
    throw new DomainError(
      'INVALID_DEFINITION',
      'energy reward must be non-negative integer',
    );
  }
  if (
    typeof definition.definitionId !== 'string' ||
    definition.definitionId.trim().length === 0 ||
    !Number.isInteger(definition.definitionVersion) ||
    definition.definitionVersion < 1
  ) {
    throw new DomainError(
      'INVALID_DEFINITION',
      'definition identity/version incomplete',
    );
  }
  if (
    typeof definition.engineId !== 'string' ||
    definition.engineId.trim().length === 0 ||
    typeof definition.promptKey !== 'string' ||
    definition.promptKey.trim().length === 0
  ) {
    throw new DomainError(
      'INVALID_DEFINITION',
      'challenge definition incomplete',
    );
  }
  if (definition.choiceKeys !== undefined) {
    if (!Array.isArray(definition.choiceKeys)) {
      throw new DomainError(
        'INVALID_DEFINITION',
        'choiceKeys must be an array',
      );
    }
    for (const key of definition.choiceKeys) {
      if (typeof key !== 'string' || key.trim().length === 0) {
        throw new DomainError(
          'INVALID_DEFINITION',
          'choiceKeys entries must be non-empty strings',
        );
      }
    }
  }
  assertJsonCompatible(definition.clientConfig, 'clientConfig');
  assertJsonCompatible(definition.serverConfig, 'serverConfig');

  if (definition.engineId === WAIT_FOR_SIGNAL_ENGINE_ID) {
    const delay = definition.serverConfig['signalDelayMs'];
    if (
      typeof delay !== 'number' ||
      !Number.isFinite(delay) ||
      delay < 0 ||
      delay >= definition.durationMs
    ) {
      throw new DomainError(
        'INVALID_DEFINITION',
        'signalDelayMs must satisfy 0 <= signalDelayMs < durationMs',
      );
    }
    const windowMs = definition.serverConfig['signalWindowMs'];
    if (
      typeof windowMs !== 'number' ||
      !Number.isFinite(windowMs) ||
      windowMs <= 0 ||
      delay + windowMs > definition.durationMs
    ) {
      throw new DomainError(
        'INVALID_DEFINITION',
        'signalWindowMs must satisfy 0 < signalWindowMs and signalDelayMs + signalWindowMs <= durationMs',
      );
    }
    // Required translation keys — reject before the challenge starts so clients
    // never enter a stuck/unavailable round from blank or non-string config.
    for (const key of WAIT_FOR_SIGNAL_CLIENT_CONFIG_KEYS) {
      const value = definition.clientConfig[key];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new DomainError(
          'INVALID_DEFINITION',
          `clientConfig.${key} must be a non-empty string`,
        );
      }
    }
  }

  if (definition.engineId === 'memory.sequence') {
    const previewMs = definition.serverConfig['previewMs'];
    if (
      typeof previewMs !== 'number' ||
      !Number.isFinite(previewMs) ||
      previewMs <= 0
    ) {
      throw new DomainError(
        'INVALID_DEFINITION',
        'memory.sequence previewMs must be a positive number',
      );
    }
    const minAnswerMs = 2000;
    if (previewMs + minAnswerMs > definition.durationMs) {
      throw new DomainError(
        'INVALID_DEFINITION',
        'memory.sequence durationMs must leave at least 2000ms after previewMs',
      );
    }
  }
}

/** Pick exactly two random seats for pair sync (solo → fair one-seat fallback). */
export function selectPairSyncRound(playerIds: string[]): {
  participants: string[];
  assignments: Map<string, string>;
} {
  const ids = [...playerIds];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const tmp = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = tmp;
  }
  if (ids.length === 0) {
    return { participants: [], assignments: new Map() };
  }
  if (ids.length === 1) {
    return { participants: [ids[0]!], assignments: new Map() };
  }
  const a = ids[0]!;
  const b = ids[1]!;
  return {
    participants: [a, b],
    assignments: new Map([
      [a, b],
      [b, a],
    ]),
  };
}

function pairSyncTogetherMs(
  serverConfig: Record<string, unknown>,
): number | undefined {
  const raw = serverConfig['togetherMs'];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return undefined;
}

function pairSeatHolding(challenge: ChallengeRound, playerId: string): boolean {
  return challenge.submissions.get(playerId)?.answer['holding'] === true;
}

/** Accumulate overlapping press time. Accidental release pauses; it does not reset. */
function updatePairSyncOverlap(
  challenge: ChallengeRound,
  nowMonoMs: number,
): number {
  const ids = challenge.participatingPlayerIds;
  const bothHolding =
    ids.length >= 2 && ids.every((id) => pairSeatHolding(challenge, id));
  const started = challenge.pairSyncOverlapStartedMonoMs;
  let overlap = challenge.pairSyncOverlapMs ?? 0;
  if (bothHolding) {
    if (started != null && nowMonoMs > started) {
      overlap += nowMonoMs - started;
    }
    challenge.pairSyncOverlapStartedMonoMs = nowMonoMs;
  } else if (started != null) {
    if (nowMonoMs > started) {
      overlap += nowMonoMs - started;
    }
    challenge.pairSyncOverlapStartedMonoMs = null;
  }
  challenge.pairSyncOverlapMs = overlap;
  return overlap;
}

function assignPairSyncSeatOverlays(
  challenge: ChallengeRound,
  allActiveIds: string[],
  players: Map<string, { displayName?: string }>,
): Map<string, SeatChallengeVariant> {
  const syncWindowRaw = challenge.definition.serverConfig['syncWindowMs'];
  const syncWindowMs =
    typeof syncWindowRaw === 'number' && Number.isFinite(syncWindowRaw)
      ? syncWindowRaw
      : 500;
  const togetherMs = pairSyncTogetherMs(challenge.definition.serverConfig);
  const seats = new Map<string, SeatChallengeVariant>();
  for (const id of allActiveIds) {
    const isParticipant = challenge.participatingPlayerIds.includes(id);
    const partnerId = challenge.pairAssignments?.get(id);
    const partnerDisplayName =
      partnerId != null ? (players.get(partnerId)?.displayName ?? null) : null;
    seats.set(id, {
      clientOverlay: {
        isParticipant,
        partnerPlayerId: partnerId ?? null,
        partnerDisplayName,
        partnerHolding: false,
        syncWindowMs,
        ...(togetherMs != null ? { togetherMs } : {}),
      },
      serverOverlay: {},
    });
  }
  return seats;
}

/** Mirror this seat's live press onto the partner overlay. Returns true on change. */
function setPairSyncPartnerHolding(
  challenge: ChallengeRound,
  playerId: string,
  holding: boolean,
): boolean {
  const partnerId = challenge.pairAssignments?.get(playerId);
  if (partnerId == null || challenge.seatVariants == null) {
    return false;
  }
  const seat = challenge.seatVariants.get(partnerId);
  if (!seat) {
    return false;
  }
  if (seat.clientOverlay['partnerHolding'] === holding) {
    return false;
  }
  seat.clientOverlay['partnerHolding'] = holding;
  return true;
}

export function toPublicChallengeView(
  challenge: ChallengeRound,
  serverNowMs: number,
  viewerPlayerId?: string,
): PublicChallengeView {
  const clientConfig = deepCloneJsonRecord(challenge.definition.clientConfig);
  const seat =
    viewerPlayerId != null
      ? challenge.seatVariants?.get(viewerPlayerId)
      : undefined;

  // Memory preview: reveal the authoritative sequence only while preview is live.
  if (challenge.engineId === 'memory.sequence') {
    if (challenge.roundPhase === 'preview') {
      const sequence = challenge.definition.serverConfig['sequence'];
      if (Array.isArray(sequence)) {
        clientConfig['previewSequence'] = sequence.filter(
          (v): v is string => typeof v === 'string',
        );
      }
    }
    // Always mirror option keys from server so answer tiles never go empty.
    const optionKeys = challenge.definition.serverConfig['optionKeys'];
    if (Array.isArray(optionKeys) && clientConfig['optionKeys'] == null) {
      clientConfig['optionKeys'] = optionKeys.filter(
        (v): v is string => typeof v === 'string',
      );
    }
    const previewMs = challenge.definition.serverConfig['previewMs'];
    if (typeof previewMs === 'number' && clientConfig['previewMs'] == null) {
      clientConfig['previewMs'] = previewMs;
    }
  }

  // Non-secret play params mirrored from serverConfig so mobile widgets stay
  // definition-driven without exposing evaluation secrets.
  if (challenge.engineId === 'motion.shake') {
    const required = challenge.definition.serverConfig['requiredShakeCount'];
    if (typeof required === 'number') {
      clientConfig['requiredShakeCount'] = required;
    }
    const noise = challenge.definition.serverConfig['noiseThreshold'];
    if (typeof noise === 'number') {
      clientConfig['noiseThreshold'] = noise;
    }
  }
  if (challenge.engineId === 'motion.tilt_balance') {
    for (const key of [
      'targetX',
      'targetY',
      'holdMs',
      'varianceTolerance',
    ] as const) {
      const value = challenge.definition.serverConfig[key];
      if (typeof value === 'number') {
        clientConfig[key] = value;
      }
    }
  }
  if (challenge.engineId === 'audio.cue') {
    const pulseCount = challenge.definition.serverConfig['pulseCount'];
    if (typeof pulseCount === 'number') {
      clientConfig['pulseCount'] = pulseCount;
    }
  }

  // Pair sync: viewer-private participation flags (seat overlay preferred).
  if (challenge.engineId === 'social.pair_sync') {
    const syncWindowRaw = challenge.definition.serverConfig['syncWindowMs'];
    if (typeof syncWindowRaw === 'number') {
      clientConfig['syncWindowMs'] = syncWindowRaw;
    }
    const togetherMs = pairSyncTogetherMs(challenge.definition.serverConfig);
    if (togetherMs != null) {
      clientConfig['togetherMs'] = togetherMs;
    }
    if (viewerPlayerId != null) {
      clientConfig['isParticipant'] =
        challenge.participatingPlayerIds.includes(viewerPlayerId);
      const partnerId = challenge.pairAssignments?.get(viewerPlayerId);
      clientConfig['partnerPlayerId'] = partnerId ?? null;
    }
  }

  // Complete the Sum: shared live totals/selections + private myChoices.
  if (
    challenge.engineId === LOGIC_COMPLETE_SUM_ENGINE_ID &&
    challenge.completeSumState
  ) {
    mergeCompleteSumIntoClientConfig(
      clientConfig,
      challenge.completeSumState,
      viewerPlayerId,
    );
  }

  // Pass the Pulse: frozen names + authoritative timeline/results.
  if (
    challenge.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID &&
    challenge.passThePulseState
  ) {
    mergePassThePulseIntoClientConfig(
      clientConfig,
      challenge.passThePulseState,
      viewerPlayerId,
    );
  }

  // Seat-private overlays (tilt targets/shapes, pair partner, etc.) — viewer only.
  if (seat) {
    Object.assign(clientConfig, seat.clientOverlay);
  }

  const publicRoundPhase =
    seat?.signalPhase != null ? seat.signalPhase : challenge.roundPhase;

  const view: PublicChallengeView = {
    challengeInstanceId: challenge.challengeInstanceId,
    definitionId: challenge.definitionId,
    definitionVersion: challenge.definitionVersion,
    engineId: challenge.engineId,
    promptKey: challenge.definition.promptKey,
    choiceKeys: [...(challenge.definition.choiceKeys ?? [])],
    clientConfig,
    serverNowMs,
    startsAtMs: challenge.startsAtMs,
    deadlineAtMs: challenge.deadlineAtMs,
    durationMs: challenge.definition.durationMs,
    roundPhase: publicRoundPhase,
  };

  const signalToken = seat?.signalToken ?? challenge.signalToken;
  const signaledAtMs = seat?.signaledAtMs ?? challenge.signaledAtMs;
  const signalEndsAtMs = seat?.signalEndsAtMs ?? challenge.signalEndsAtMs;

  // Only expose signal token while this viewer's blue window is open.
  if (publicRoundPhase === 'signal_active') {
    if (signalToken) {
      view.signalToken = signalToken;
    }
  }
  if (
    publicRoundPhase === 'signal_active' ||
    publicRoundPhase === 'signal_expired' ||
    publicRoundPhase === 'resolved'
  ) {
    if (signaledAtMs != null) {
      view.signaledAtMs = signaledAtMs;
    }
    if (signalEndsAtMs != null) {
      view.signalEndsAtMs = signalEndsAtMs;
    }
  }

  return view;
}

export class MatchEngine {
  constructor(
    private readonly clock: Clock,
    private readonly evaluators: ChallengeEvaluatorRegistry,
  ) {}

  createMatch(matchId?: string, options?: CreateMatchOptions): MatchState {
    const now = this.clock.nowMs();
    const mode: MatchMode = options?.mode ?? 'dev';
    const playerCapacity =
      options?.playerCapacity ??
      (mode === 'training' ? 1 : MATCH_PLAYER_CAPACITY);
    return {
      matchId: matchId ?? randomUUID(),
      status: 'waiting',
      phase: 'lobby',
      mode,
      hostPlayerId: options?.hostPlayerId ?? null,
      roomCode: options?.roomCode ?? null,
      playerCapacity,
      lobbyFillDeadlineAtMs: null,
      lobbyFillDeadlineMonoMs: null,
      phaseDeadlineAtMs: null,
      phaseDeadlineMonoMs: null,
      roundNumber: 0,
      lastRoundResult: null,
      nextPhaseAtMs: null,
      revision: 1,
      sequence: 0,
      players: new Map(),
      currentChallenge: null,
      winnerId: null,
      createdAtMs: now,
      updatedAtMs: now,
      commandAcks: new Map(),
      releasePins: options?.releasePins ?? null,
      pinnedPlaylist: options?.pinnedPlaylist
        ? [...options.pinnedPlaylist]
        : [],
      hardLoopPlaylist: options?.hardLoopPlaylist
        ? [...options.hardLoopPlaylist]
        : [],
      powerConfig: options?.powerConfig ?? defaultPowerConfig(),
      pendingAttack: null,
      lastPowerGrant: null,
      powerActionActorIds: [],
    };
  }

  joinPlayer(
    match: MatchState,
    input: {
      playerId: string;
      resumeTokenHash: string;
      isBot?: boolean;
      displayName?: string;
      avatarColor?: string;
      /** Optional seat vitals (training retry carry-over). Defaults to initial. */
      hearts?: number;
      energy?: number;
    },
  ): { match: MatchState; events: DomainEvent[] } {
    if (match.status !== 'waiting' || match.phase !== 'lobby') {
      throw new DomainError('MATCH_NOT_JOINABLE', 'match is not joinable');
    }
    if (match.players.size >= match.playerCapacity) {
      throw new DomainError('MATCH_FULL', 'match is full');
    }
    if (match.players.has(input.playerId)) {
      throw new DomainError('MATCH_NOT_JOINABLE', 'player already joined');
    }

    const hearts = input.hearts !== undefined ? input.hearts : INITIAL_HEARTS;
    const energy = input.energy !== undefined ? input.energy : INITIAL_ENERGY;
    if (!Number.isInteger(hearts) || hearts < 0 || hearts > INITIAL_HEARTS) {
      throw new DomainError('INVALID_DEFINITION', 'hearts out of range');
    }
    if (!Number.isInteger(energy) || energy < 0 || energy > ENERGY_THRESHOLD) {
      throw new DomainError('INVALID_DEFINITION', 'energy out of range');
    }

    const next = this.cloneMatch(match);
    const isBot = input.isBot === true;
    // Non-private modes auto-ready; private requires explicit match.ready.
    const autoReady = isBot || match.mode !== 'private';
    next.players.set(input.playerId, {
      playerId: input.playerId,
      hearts,
      energy,
      status: hearts > 0 ? 'active' : 'spectator',
      presence: 'connected',
      submittedForCurrentChallenge: false,
      resumeTokenHash: input.resumeTokenHash,
      isBot: input.isBot,
      displayName: input.displayName,
      avatarColor: input.avatarColor,
      ready: autoReady,
      // Bots are server-controlled fills — accepted immediately. Humans require
      // gateway finalizeJoin after live lease + credentials.
      joinAccepted: isBot,
      inventory: { ...EMPTY_INVENTORY },
      protectedThroughRound: null,
      lastDangerPulseTargetId: null,
      powerActionResolved: false,
    });
    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'player_joined',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          playerId: input.playerId,
        },
      ],
    };
  }

  /**
   * Mark a reserved join as gateway-accepted. Idempotent; does not bump
   * sequence or emit public events (acceptance is internal bookkeeping).
   * Non-private modes treat acceptance as ready.
   */
  acceptJoin(
    match: MatchState,
    playerId: string,
  ): { match: MatchState; changed: boolean } {
    const player = match.players.get(playerId);
    if (!player) {
      return { match, changed: false };
    }
    if (player.joinAccepted) {
      return { match, changed: false };
    }
    const next = this.cloneMatch(match);
    const updated = next.players.get(playerId)!;
    updated.joinAccepted = true;
    if (next.mode !== 'private') {
      updated.ready = true;
    }
    return { match: next, changed: true };
  }

  /** True when every seated player has completed join acceptance. */
  allJoinsAccepted(match: MatchState): boolean {
    if (match.players.size === 0) {
      return false;
    }
    return [...match.players.values()].every((p) => p.joinAccepted);
  }

  /**
   * Whether the lobby may begin ready countdown.
   * - private: full table + every seat ready
   * - training: capacity seats accepted (1)
   * - quick_survival: ≥ MIN_LIVE_MATCH_PLAYERS accepted; full table may start
   *   immediately; partial fill only when allowPartialFill is set (fill wait elapsed)
   * - other modes: full table
   */
  canStartReadyCountdown(
    match: MatchState,
    options?: { allowPartialFill?: boolean },
  ): boolean {
    if (match.status !== 'waiting' || match.phase !== 'lobby') {
      return false;
    }
    if (!this.allJoinsAccepted(match)) {
      return false;
    }
    const size = match.players.size;
    if (size <= 0 || size > match.playerCapacity) {
      return false;
    }

    if (match.mode === 'private') {
      if (size !== match.playerCapacity) {
        return false;
      }
      return [...match.players.values()].every((p) => p.ready);
    }

    if (match.mode === 'training') {
      return size === match.playerCapacity;
    }

    if (match.mode === 'quick_survival') {
      if (size < MIN_LIVE_MATCH_PLAYERS) {
        return false;
      }
      if (size === match.playerCapacity) {
        return true;
      }
      return options?.allowPartialFill === true;
    }

    return size === match.playerCapacity;
  }

  /**
   * Set player ready=true. Idempotent. Private lobbies only need this;
   * other modes are already ready after accept.
   */
  setPlayerReady(
    match: MatchState,
    playerId: string,
  ): { match: MatchState; events: DomainEvent[]; changed: boolean } {
    const player = match.players.get(playerId);
    if (!player) {
      throw new DomainError('PLAYER_NOT_FOUND', 'player not found');
    }
    if (player.ready) {
      return { match, events: [], changed: false };
    }
    const next = this.cloneMatch(match);
    next.players.get(playerId)!.ready = true;
    const bump = this.bump(next);
    return { match: next, events: [bump], changed: true };
  }

  setPresence(
    match: MatchState,
    playerId: string,
    presence: PlayerState['presence'],
  ): { match: MatchState; events: DomainEvent[] } {
    const player = match.players.get(playerId);
    if (!player) {
      throw new DomainError('PLAYER_NOT_FOUND', 'player not found');
    }
    if (player.presence === presence) {
      return { match, events: [] };
    }
    const next = this.cloneMatch(match);
    const updated = next.players.get(playerId)!;
    updated.presence = presence;
    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'presence_changed',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          playerId,
          presence,
        },
      ],
    };
  }

  /**
   * Remove a lobby player (voluntary leave or orphaned join).
   * Allowed only while waiting in lobby or ready_countdown; throws otherwise.
   * ready_countdown rolls back to lobby when a seat is vacated.
   */
  removeLobbyPlayer(
    match: MatchState,
    playerId: string,
  ): { match: MatchState; events: DomainEvent[]; removed: boolean } {
    if (match.status !== 'waiting') {
      throw new DomainError('NOT_LOBBY', 'leave only allowed in lobby');
    }
    if (match.phase !== 'lobby' && match.phase !== 'ready_countdown') {
      throw new DomainError('NOT_LOBBY', 'leave only allowed in lobby');
    }
    if (!match.players.has(playerId)) {
      return { match, events: [], removed: false };
    }
    const next = this.cloneMatch(match);
    next.players.delete(playerId);
    if (next.phase === 'ready_countdown') {
      next.phase = 'lobby';
      next.phaseDeadlineAtMs = null;
      next.phaseDeadlineMonoMs = null;
    }
    const bump = this.bump(next);
    // Emit presence_changed so lobby clients drop the seat immediately even if
    // a concurrent snapshot is delayed/reordered relative to other events.
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'presence_changed',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          playerId,
          presence: 'disconnected',
        },
      ],
      removed: true,
    };
  }

  /**
   * Voluntary leave. Lobby seats are deleted; mid-match seats stay on the
   * roster as `left` so results/standings can still show them.
   */
  leavePlayer(
    match: MatchState,
    playerId: string,
  ): {
    match: MatchState;
    events: DomainEvent[];
    left: boolean;
    removedFromLobby: boolean;
  } {
    if (!match.players.has(playerId)) {
      return { match, events: [], left: false, removedFromLobby: false };
    }
    if (
      match.status === 'waiting' &&
      (match.phase === 'lobby' || match.phase === 'ready_countdown')
    ) {
      const removed = this.removeLobbyPlayer(match, playerId);
      return {
        match: removed.match,
        events: removed.events,
        left: removed.removed,
        removedFromLobby: removed.removed,
      };
    }

    const player = match.players.get(playerId)!;
    if (player.status === 'left') {
      return { match, events: [], left: true, removedFromLobby: false };
    }

    // Terminal matches: keep final standings; still stamp left for display.
    const next = this.cloneMatch(match);
    const updated = next.players.get(playerId)!;
    updated.status = 'left';
    updated.presence = 'disconnected';
    updated.submittedForCurrentChallenge = true;
    const bump = this.bump(next);
    const events: DomainEvent[] = [
      bump,
      {
        kind: 'presence_changed',
        sequence: next.sequence,
        revision: next.revision,
        serverTimestampMs: bump.serverTimestampMs,
        playerId,
        presence: 'disconnected',
      },
    ];

    // Mid-challenge: do not make remaining seats wait on a departed player.
    if (
      next.currentChallenge?.status === 'active' &&
      next.phase === 'challenge_active'
    ) {
      const challenge = next.currentChallenge;
      const allSettled = challenge.participatingPlayerIds.every((id) => {
        const seat = next.players.get(id);
        if (!seat || seat.status === 'spectator' || seat.status === 'left') {
          return true;
        }
        const sub = challenge.submissions.get(id);
        return sub != null && sub.final !== false;
      });
      if (allSettled) {
        const resolved = this.resolveChallenge(next);
        return {
          match: resolved.match,
          events: [...events, ...resolved.events],
          left: true,
          removedFromLobby: false,
        };
      }
    }

    return {
      match: next,
      events,
      left: true,
      removedFromLobby: false,
    };
  }

  /**
   * Replace resume token hash without bumping sequence (private credential rotation).
   */
  replaceResumeTokenHash(
    match: MatchState,
    playerId: string,
    resumeTokenHash: string,
  ): MatchState {
    if (!match.players.has(playerId)) {
      throw new DomainError('PLAYER_NOT_FOUND', 'player not found');
    }
    const next = this.cloneMatch(match);
    next.players.get(playerId)!.resumeTokenHash = resumeTokenHash;
    next.updatedAtMs = this.clock.nowMs();
    return next;
  }

  /**
   * Assign host without bumping sequence (private-room bookkeeping).
   */
  setHostPlayerId(match: MatchState, hostPlayerId: string): MatchState {
    const next = this.cloneMatch(match);
    next.hostPlayerId = hostPlayerId;
    next.updatedAtMs = this.clock.nowMs();
    return next;
  }

  /**
   * Update open-lobby fill deadlines and bump sequence so clients refresh the
   * visible countdown (host extend / reopen after leave).
   */
  setLobbyFillDeadline(
    match: MatchState,
    deadlineAtMs: number,
    deadlineMonoMs: number,
  ): { match: MatchState; events: DomainEvent[] } {
    const next = this.cloneMatch(match);
    next.lobbyFillDeadlineAtMs = deadlineAtMs;
    next.lobbyFillDeadlineMonoMs = deadlineMonoMs;
    const bump = this.bump(next);
    return { match: next, events: [bump] };
  }

  beginReadyCountdown(
    match: MatchState,
    durationMs: number,
    options?: { allowPartialFill?: boolean },
  ): { match: MatchState; events: DomainEvent[] } {
    if (!this.canStartReadyCountdown(match, options)) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        match.mode === 'quick_survival'
          ? `quick survival needs ${MIN_LIVE_MATCH_PLAYERS}-${match.playerCapacity} accepted players`
          : `match requires ${match.playerCapacity} ready accepted players`,
      );
    }
    const next = this.cloneMatch(match);
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    next.phase = 'ready_countdown';
    next.phaseDeadlineAtMs = nowWall + durationMs;
    next.phaseDeadlineMonoMs = nowMono + durationMs;
    // Lobby is sealed — no further open-lobby joins.
    next.lobbyFillDeadlineAtMs = null;
    next.lobbyFillDeadlineMonoMs = null;
    const bump = this.bump(next);
    return { match: next, events: [bump] };
  }

  beginChallengeIntro(
    match: MatchState,
    durationMs: number,
    definition: ChallengeDefinition,
    options?: { deferSequenceBump?: boolean },
  ): { match: MatchState; events: DomainEvent[] } {
    validateChallengeDefinition(definition);
    if (!this.evaluators.get(definition.engineId)) {
      throw new DomainError('INVALID_DEFINITION', 'unknown challenge engine');
    }
    const next = this.cloneMatch(match);
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    next.phase = 'challenge_intro';
    next.phaseDeadlineAtMs = nowWall + durationMs;
    next.phaseDeadlineMonoMs = nowMono + durationMs;
    next.roundNumber += 1;

    // Store definition in a pending round for reference but don't start the timer
    const pinned = pinDefinition(definition);
    const activePlayers = [...next.players.values()].filter(
      (p) => p.status === 'active',
    );
    const challengeInstanceId = randomUUID();
    const round: ChallengeRound = {
      challengeInstanceId,
      engineId: pinned.engineId,
      definitionId: pinned.definitionId,
      definitionVersion: pinned.definitionVersion,
      definition: pinned,
      participatingPlayerIds: activePlayers.map((p) => p.playerId),
      startsAtMs: 0, // set on startChallenge
      deadlineAtMs: 0,
      deadlineMonoMs: 0,
      status: 'active',
      roundPhase: 'waiting_signal',
      signalToken: null,
      signaledAtMs: null,
      signalAtMonoMs: null,
      signalEndsAtMs: null,
      signalEndsAtMonoMs: null,
      submissions: new Map(),
      resolutions: [],
    };
    next.currentChallenge = round;
    for (const player of next.players.values()) {
      player.submittedForCurrentChallenge = false;
    }
    // Zero-hold intro → immediate start: defer bump so challenge.started is
    // consecutive (avoids a client sequence gap / recovery flash).
    if (options?.deferSequenceBump === true) {
      next.updatedAtMs = nowWall;
      return { match: next, events: [] };
    }
    const bump = this.bump(next);
    return { match: next, events: [bump] };
  }

  startChallenge(
    match: MatchState,
    definition?: ChallengeDefinition,
    challengeInstanceId?: string,
  ): { match: MatchState; events: DomainEvent[] } {
    // If coming from intro phase, we already have a round set up
    if (match.currentChallenge && match.phase === 'challenge_intro') {
      return this.activateChallengeFromIntro(match);
    }

    // Legacy direct start path (for backward compat with LH-002 tests)
    return this.startChallengeDirect(match, definition!, challengeInstanceId);
  }

  private activateChallengeFromIntro(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    const next = this.cloneMatch(match);
    const challenge = next.currentChallenge!;
    if (!this.evaluators.get(challenge.engineId)) {
      throw new DomainError('INVALID_DEFINITION', 'unknown challenge engine');
    }
    validateChallengeDefinition(challenge.definition);
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();

    challenge.startsAtMs = nowWall;
    challenge.deadlineAtMs = nowWall + challenge.definition.durationMs;
    challenge.deadlineMonoMs = nowMono + challenge.definition.durationMs;

    if (challenge.engineId === WAIT_FOR_SIGNAL_ENGINE_ID) {
      challenge.roundPhase = 'waiting_signal';
      challenge.seatVariants = assignSeatVariants(challenge, nowMono);
      // Round-level fields mirror the earliest seat for legacy timers/tests.
      let earliest: SeatChallengeVariant | undefined;
      for (const seat of challenge.seatVariants.values()) {
        if (
          seat.signalAtMonoMs != null &&
          (earliest?.signalAtMonoMs == null ||
            seat.signalAtMonoMs < earliest.signalAtMonoMs)
        ) {
          earliest = seat;
        }
      }
      challenge.signalAtMonoMs = earliest?.signalAtMonoMs ?? null;
      challenge.signalToken = earliest?.signalToken ?? null;
      challenge.previewEndsAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
    } else if (challenge.engineId === 'memory.sequence') {
      materializeMemoryRound(challenge.definition);
      const previewMs =
        (challenge.definition.serverConfig['previewMs'] as number) ?? 1500;
      challenge.roundPhase = 'preview';
      challenge.previewEndsAtMonoMs = nowMono + previewMs;
      challenge.signalToken = null;
      challenge.signalAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
      challenge.seatVariants = assignSeatVariants(challenge, nowMono);
    } else if (
      challenge.engineId === 'trivia.multiple_choice' ||
      challenge.engineId === 'geography.select_on_map' ||
      challenge.engineId === 'focus.odd_one_out' ||
      challenge.engineId === 'order.sequence_sort' ||
      challenge.engineId === 'precision.maze_path' ||
      challenge.engineId === 'precision.neon_cable' ||
      challenge.engineId === 'gesture.fog_wipe' ||
      challenge.engineId === 'precision.circuit_rotation' ||
      challenge.engineId === 'precision.cable_untangle' ||
      challenge.engineId === 'logic.balance_scale' ||
      challenge.engineId === 'focus.stroop' ||
      challenge.engineId === 'search.select_occurrences'
    ) {
      materializePack31Round(challenge.definition);
      challenge.roundPhase = 'answer';
      challenge.previewEndsAtMonoMs = null;
      challenge.signalToken = null;
      challenge.signalAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
      challenge.seatVariants = assignSeatVariants(challenge, nowMono);
    } else if (challenge.engineId === 'social.pair_sync') {
      challenge.roundPhase = 'answer';
      challenge.previewEndsAtMonoMs = null;
      challenge.signalToken = null;
      challenge.signalAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
      const pool = [...challenge.participatingPlayerIds];
      const selected = selectPairSyncRound(pool);
      challenge.participatingPlayerIds = selected.participants;
      challenge.pairAssignments = selected.assignments;
      challenge.seatVariants = assignPairSyncSeatOverlays(
        challenge,
        pool,
        next.players,
      );
    } else if (challenge.engineId === LOGIC_COMPLETE_SUM_ENGINE_ID) {
      challenge.roundPhase = 'answer';
      challenge.previewEndsAtMonoMs = null;
      challenge.signalToken = null;
      challenge.signalAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
      materializeCompleteSumRound(challenge);
    } else if (challenge.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID) {
      challenge.roundPhase = 'answer';
      challenge.previewEndsAtMonoMs = null;
      challenge.signalToken = null;
      challenge.signalAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
      materializePassThePulseRound(challenge, next.players, this.clock);
    } else {
      challenge.roundPhase = 'answer';
      challenge.previewEndsAtMonoMs = null;
      challenge.signalToken = null;
      challenge.signalAtMonoMs = null;
      challenge.signaledAtMs = null;
      challenge.signalEndsAtMs = null;
      challenge.signalEndsAtMonoMs = null;
      challenge.seatVariants = assignSeatVariants(challenge, nowMono);
    }

    next.status = 'challenge_active';
    next.phase = 'challenge_active';
    next.phaseDeadlineAtMs = challenge.deadlineAtMs;
    next.phaseDeadlineMonoMs = challenge.deadlineMonoMs;
    next.lastRoundResult = null;

    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'challenge_started',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          challenge,
          serverNowMs: nowWall,
        },
      ],
    };
  }

  private startChallengeDirect(
    match: MatchState,
    definition: ChallengeDefinition,
    challengeInstanceId?: string,
  ): { match: MatchState; events: DomainEvent[] } {
    const instanceId = challengeInstanceId ?? randomUUID();
    validateChallengeDefinition(definition);
    if (match.status === 'completed') {
      throw new DomainError('MATCH_COMPLETED', 'match already completed');
    }
    if (
      match.status === 'challenge_active' ||
      match.currentChallenge?.status === 'active'
    ) {
      throw new DomainError('ROUND_ALREADY_ACTIVE', 'challenge already active');
    }
    const activePlayers = [...match.players.values()].filter(
      (p) => p.status === 'active',
    );
    if (match.players.size > match.playerCapacity) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        `match exceeds capacity ${match.playerCapacity}`,
      );
    }
    const minStartPlayers =
      match.mode === 'training'
        ? 1
        : match.mode === 'quick_survival'
          ? MIN_LIVE_MATCH_PLAYERS
          : match.playerCapacity;
    if (match.players.size < minStartPlayers) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        `match requires at least ${minStartPlayers} players`,
      );
    }
    const isInitialStart = [...match.players.values()].every(
      (p) => p.hearts === INITIAL_HEARTS && p.energy === INITIAL_ENERGY,
    );
    if (isInitialStart && activePlayers.length < minStartPlayers) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        `initial start requires at least ${minStartPlayers} active players`,
      );
    }
    if (activePlayers.length === 0) {
      throw new DomainError(
        'UNSAFE_ZERO_SURVIVORS',
        'no active players remain',
      );
    }
    // Training (capacity 1) may continue/finish with a single active player.
    if (
      !isInitialStart &&
      activePlayers.length < 2 &&
      match.playerCapacity > 1
    ) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        'need at least two active players for another round',
      );
    }

    const evaluator = this.evaluators.get(definition.engineId);
    if (!evaluator) {
      throw new DomainError('INVALID_DEFINITION', 'unknown challenge engine');
    }

    const pinned = pinDefinition(definition);
    const next = this.cloneMatch(match);
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();

    const round: ChallengeRound = {
      challengeInstanceId: instanceId,
      engineId: pinned.engineId,
      definitionId: pinned.definitionId,
      definitionVersion: pinned.definitionVersion,
      definition: pinned,
      participatingPlayerIds: activePlayers.map((p) => p.playerId),
      startsAtMs: nowWall,
      deadlineAtMs: nowWall + pinned.durationMs,
      deadlineMonoMs: nowMono + pinned.durationMs,
      status: 'active',
      roundPhase: 'waiting_signal',
      signalToken: null,
      signaledAtMs: null,
      signalAtMonoMs: null,
      signalEndsAtMs: null,
      signalEndsAtMonoMs: null,
      submissions: new Map(),
      resolutions: [],
    };

    if (pinned.engineId === WAIT_FOR_SIGNAL_ENGINE_ID) {
      round.roundPhase = 'waiting_signal';
      round.seatVariants = assignSeatVariants(round, nowMono);
      let earliest: SeatChallengeVariant | undefined;
      for (const seat of round.seatVariants.values()) {
        if (
          seat.signalAtMonoMs != null &&
          (earliest?.signalAtMonoMs == null ||
            seat.signalAtMonoMs < earliest.signalAtMonoMs)
        ) {
          earliest = seat;
        }
      }
      round.signalAtMonoMs = earliest?.signalAtMonoMs ?? null;
      round.signalToken = earliest?.signalToken ?? null;
      round.previewEndsAtMonoMs = null;
    } else if (pinned.engineId === 'memory.sequence') {
      materializeMemoryRound(pinned);
      const previewMs = (pinned.serverConfig['previewMs'] as number) ?? 1500;
      round.roundPhase = 'preview';
      round.previewEndsAtMonoMs = nowMono + previewMs;
      round.seatVariants = assignSeatVariants(round, nowMono);
    } else if (
      pinned.engineId === 'trivia.multiple_choice' ||
      pinned.engineId === 'geography.select_on_map' ||
      pinned.engineId === 'focus.odd_one_out' ||
      pinned.engineId === 'order.sequence_sort' ||
      pinned.engineId === 'precision.maze_path' ||
      pinned.engineId === 'precision.neon_cable' ||
      pinned.engineId === 'gesture.fog_wipe' ||
      pinned.engineId === 'precision.circuit_rotation' ||
      pinned.engineId === 'precision.cable_untangle' ||
      pinned.engineId === 'logic.balance_scale' ||
      pinned.engineId === 'focus.stroop' ||
      pinned.engineId === 'search.select_occurrences'
    ) {
      materializePack31Round(pinned);
      round.roundPhase = 'answer';
      round.previewEndsAtMonoMs = null;
      round.seatVariants = assignSeatVariants(round, nowMono);
    } else if (pinned.engineId === 'social.pair_sync') {
      round.roundPhase = 'answer';
      round.previewEndsAtMonoMs = null;
      const pool = [...round.participatingPlayerIds];
      const selected = selectPairSyncRound(pool);
      round.participatingPlayerIds = selected.participants;
      round.pairAssignments = selected.assignments;
      round.seatVariants = assignPairSyncSeatOverlays(
        round,
        pool,
        next.players,
      );
    } else if (pinned.engineId === LOGIC_COMPLETE_SUM_ENGINE_ID) {
      round.roundPhase = 'answer';
      round.previewEndsAtMonoMs = null;
      materializeCompleteSumRound(round);
    } else if (pinned.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID) {
      round.roundPhase = 'answer';
      round.previewEndsAtMonoMs = null;
      materializePassThePulseRound(round, next.players, this.clock);
    } else {
      round.roundPhase = 'answer';
      round.previewEndsAtMonoMs = null;
      round.seatVariants = assignSeatVariants(round, nowMono);
    }

    for (const player of next.players.values()) {
      player.submittedForCurrentChallenge = false;
    }
    next.currentChallenge = round;
    next.status = 'challenge_active';
    next.phase = 'challenge_active';
    next.phaseDeadlineAtMs = round.deadlineAtMs;
    next.phaseDeadlineMonoMs = round.deadlineMonoMs;
    next.roundNumber += 1;
    next.lastRoundResult = null;

    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'challenge_started',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          challenge: round,
          serverNowMs: nowWall,
        },
      ],
    };
  }

  activateSignal(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (
      !match.currentChallenge ||
      match.currentChallenge.status !== 'active' ||
      match.currentChallenge.engineId !== WAIT_FOR_SIGNAL_ENGINE_ID
    ) {
      return { match, events: [] };
    }

    const next = this.cloneMatch(match);
    const challenge = next.currentChallenge!;
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    const windowMs =
      (challenge.definition.serverConfig['signalWindowMs'] as number) ?? 1000;
    const events: DomainEvent[] = [];

    if (challenge.seatVariants && challenge.seatVariants.size > 0) {
      let activated = 0;
      for (const [playerId, seat] of challenge.seatVariants) {
        if (
          seat.signalPhase !== 'waiting_signal' ||
          seat.signalAtMonoMs == null ||
          nowMono < seat.signalAtMonoMs ||
          !seat.signalToken
        ) {
          continue;
        }
        seat.signalPhase = 'signal_active';
        seat.signaledAtMs = nowWall;
        seat.signalEndsAtMs = nowWall + windowMs;
        seat.signalEndsAtMonoMs = nowMono + windowMs;
        challenge.seatVariants.set(playerId, seat);
        activated += 1;
        events.push({
          kind: 'challenge_signal',
          sequence: 0,
          revision: 0,
          serverTimestampMs: nowWall,
          challengeInstanceId: challenge.challengeInstanceId,
          signalToken: seat.signalToken,
          signaledAtMs: nowWall,
          signalEndsAtMs: seat.signalEndsAtMs,
          serverNowMs: nowWall,
          playerId,
        });
      }
      if (activated === 0) {
        return { match, events: [] };
      }
      // Round-level mirrors any currently active seat (for legacy readers).
      const activeSeat = [...challenge.seatVariants.values()].find(
        (s) => s.signalPhase === 'signal_active',
      );
      challenge.roundPhase = 'signal_active';
      challenge.signalToken = activeSeat?.signalToken ?? challenge.signalToken;
      challenge.signaledAtMs = activeSeat?.signaledAtMs ?? nowWall;
      challenge.signalEndsAtMs = activeSeat?.signalEndsAtMs ?? null;
      challenge.signalEndsAtMonoMs = activeSeat?.signalEndsAtMonoMs ?? null;
      // Seat-private signals are unsequenced on the wire — do not bump
      // match.sequence or clients see a phantom gap on the next room event.
      next.revision += 1;
      next.updatedAtMs = nowWall;
      return {
        match: next,
        events: events.map((event) =>
          event.kind === 'challenge_signal'
            ? {
                ...event,
                sequence: next.sequence,
                revision: next.revision,
                serverTimestampMs: nowWall,
              }
            : event,
        ),
      };
    }

    if (challenge.roundPhase !== 'waiting_signal') {
      return { match, events: [] };
    }
    const signalAtMono = challenge.signalAtMonoMs;
    if (signalAtMono == null || nowMono < signalAtMono) {
      return { match, events: [] };
    }
    challenge.roundPhase = 'signal_active';
    challenge.signaledAtMs = nowWall;
    challenge.signalEndsAtMs = nowWall + windowMs;
    challenge.signalEndsAtMonoMs = nowMono + windowMs;
    events.push({
      kind: 'challenge_signal',
      sequence: 0,
      revision: 0,
      serverTimestampMs: nowWall,
      challengeInstanceId: challenge.challengeInstanceId,
      signalToken: challenge.signalToken!,
      signaledAtMs: nowWall,
      signalEndsAtMs: challenge.signalEndsAtMs,
      serverNowMs: nowWall,
    });

    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        ...events.map((event) =>
          event.kind === 'challenge_signal'
            ? {
                ...event,
                sequence: next.sequence,
                revision: next.revision,
                serverTimestampMs: bump.serverTimestampMs,
              }
            : event,
        ),
      ],
    };
  }

  /**
   * Memory preview → answer transition when preview window elapses.
   */
  advancePreview(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (
      !match.currentChallenge ||
      match.currentChallenge.status !== 'active' ||
      match.currentChallenge.roundPhase !== 'preview'
    ) {
      return { match, events: [] };
    }
    const ends = match.currentChallenge.previewEndsAtMonoMs;
    if (ends == null || this.clock.monoMs() < ends) {
      return { match, events: [] };
    }
    const next = this.cloneMatch(match);
    next.currentChallenge!.roundPhase = 'answer';
    const bump = this.bump(next);
    return { match: next, events: [bump] };
  }

  /**
   * Ends the blue-heart window: heart returns to red; late taps fail.
   * Token is no longer published; evaluation uses the mono window.
   */
  expireSignal(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (
      !match.currentChallenge ||
      match.currentChallenge.status !== 'active' ||
      match.currentChallenge.engineId !== WAIT_FOR_SIGNAL_ENGINE_ID
    ) {
      return { match, events: [] };
    }

    const next = this.cloneMatch(match);
    const challenge = next.currentChallenge!;
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    const events: DomainEvent[] = [];

    if (challenge.seatVariants && challenge.seatVariants.size > 0) {
      let expired = 0;
      for (const [playerId, seat] of challenge.seatVariants) {
        if (
          seat.signalPhase !== 'signal_active' ||
          seat.signalEndsAtMonoMs == null ||
          nowMono <= seat.signalEndsAtMonoMs
        ) {
          continue;
        }
        seat.signalPhase = 'signal_expired';
        challenge.seatVariants.set(playerId, seat);
        expired += 1;
        events.push({
          kind: 'challenge_signal_ended',
          sequence: 0,
          revision: 0,
          serverTimestampMs: nowWall,
          challengeInstanceId: challenge.challengeInstanceId,
          signalEndsAtMs: seat.signalEndsAtMs ?? nowWall,
          serverNowMs: nowWall,
          playerId,
        });
      }
      if (expired === 0) {
        return { match, events: [] };
      }
      const stillWaiting = [...challenge.seatVariants.values()].some(
        (s) => s.signalPhase === 'waiting_signal',
      );
      const stillActive = [...challenge.seatVariants.values()].some(
        (s) => s.signalPhase === 'signal_active',
      );
      challenge.roundPhase = stillWaiting
        ? 'waiting_signal'
        : stillActive
          ? 'signal_active'
          : 'signal_expired';
      // Seat-private ends are unsequenced — keep match.sequence stable.
      next.revision += 1;
      next.updatedAtMs = nowWall;
      return {
        match: next,
        events: events.map((event) =>
          event.kind === 'challenge_signal_ended'
            ? {
                ...event,
                sequence: next.sequence,
                revision: next.revision,
                serverTimestampMs: nowWall,
              }
            : event,
        ),
      };
    }

    if (challenge.roundPhase !== 'signal_active') {
      return { match, events: [] };
    }
    const endsAtMono = challenge.signalEndsAtMonoMs;
    // Inclusive blue window: expire only after the end instant.
    if (endsAtMono == null || nowMono <= endsAtMono) {
      return { match, events: [] };
    }
    challenge.roundPhase = 'signal_expired';
    events.push({
      kind: 'challenge_signal_ended',
      sequence: 0,
      revision: 0,
      serverTimestampMs: nowWall,
      challengeInstanceId: challenge.challengeInstanceId,
      signalEndsAtMs: challenge.signalEndsAtMs ?? nowWall,
      serverNowMs: nowWall,
    });

    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        ...events.map((event) =>
          event.kind === 'challenge_signal_ended'
            ? {
                ...event,
                sequence: next.sequence,
                revision: next.revision,
                serverTimestampMs: bump.serverTimestampMs,
              }
            : event,
        ),
      ],
    };
  }

  beginRoundResult(
    match: MatchState,
    resolutions: PlayerChallengeResolution[],
    challengeInstanceId: string,
    holdMs: number,
  ): { match: MatchState; events: DomainEvent[] } {
    const next = this.cloneMatch(match);
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    next.status = 'waiting';
    next.phase = 'round_result';
    next.phaseDeadlineAtMs = nowWall + holdMs;
    next.phaseDeadlineMonoMs = nowMono + holdMs;
    next.nextPhaseAtMs = nowWall + holdMs;
    next.lastRoundResult = {
      challengeInstanceId,
      resolutions: [...resolutions],
    };
    next.currentChallenge = null;
    const bump = this.bump(next);
    return { match: next, events: [bump] };
  }

  /**
   * End when no further catalog entry remains. Crowns a unique hearts leader;
   * tied top hearts → terminal draw (no winner). Energy must not break ties.
   */
  completeByStandings(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (
      match.status === 'completed' ||
      match.winnerId != null ||
      match.phase === 'draw'
    ) {
      return { match, events: [] };
    }
    const next = this.cloneMatch(match);
    const alive = [...next.players.values()].filter(
      (p) => p.status === 'active' && p.hearts > 0,
    );
    if (alive.length === 0) {
      next.status = 'completed';
      next.phase = 'draw';
      next.winnerId = null;
      next.currentChallenge = null;
      const drawBump = this.bump(next);
      return {
        match: next,
        events: [
          drawBump,
          {
            kind: 'match_drawn',
            sequence: next.sequence,
            revision: next.revision,
            serverTimestampMs: drawBump.serverTimestampMs,
          },
        ],
      };
    }
    const topHearts = Math.max(...alive.map((p) => p.hearts));
    const leaders = alive.filter((p) => p.hearts === topHearts);
    next.currentChallenge = null;
    next.phaseDeadlineAtMs = null;
    next.phaseDeadlineMonoMs = null;
    next.nextPhaseAtMs = null;
    if (leaders.length !== 1) {
      next.status = 'completed';
      next.phase = 'draw';
      next.winnerId = null;
      const drawBump = this.bump(next);
      return {
        match: next,
        events: [
          drawBump,
          {
            kind: 'match_drawn',
            sequence: next.sequence,
            revision: next.revision,
            serverTimestampMs: drawBump.serverTimestampMs,
          },
        ],
      };
    }
    next.status = 'completed';
    next.phase = 'completed';
    next.winnerId = leaders[0]!.playerId;
    const finishBump = this.bump(next);
    return {
      match: next,
      events: [
        finishBump,
        {
          kind: 'match_finished',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: finishBump.serverTimestampMs,
          winnerId: next.winnerId,
        },
      ],
    };
  }

  submitAnswer(
    match: MatchState,
    input: {
      playerId: string;
      challengeInstanceId: string;
      commandId: string;
      answer: Record<string, unknown>;
      /** Optional stamp from enqueue time; defaults to clock.monoMs(). */
      receivedMonoMs?: number;
    },
  ): {
    match: MatchState;
    events: DomainEvent[];
    duplicate: boolean;
    ack: { accepted: boolean; reason?: string };
    /** Pair-sync press edge: fan out partnerHolding without resolving. */
    liveUpdate?: boolean;
  } {
    const existingAck = match.commandAcks.get(input.commandId);
    if (existingAck) {
      return {
        match,
        events: [],
        duplicate: true,
        ack: existingAck as { accepted: boolean; reason?: string },
      };
    }

    if (match.status !== 'challenge_active' || !match.currentChallenge) {
      throw new DomainError('CHALLENGE_NOT_ACTIVE', 'no active challenge');
    }
    const challenge = match.currentChallenge;
    if (challenge.challengeInstanceId !== input.challengeInstanceId) {
      throw new DomainError('CHALLENGE_NOT_ACTIVE', 'challenge mismatch');
    }
    if (challenge.status !== 'active') {
      throw new DomainError(
        'CHALLENGE_NOT_ACTIVE',
        'challenge already resolved',
      );
    }

    const player = match.players.get(input.playerId);
    if (!player) {
      throw new DomainError('PLAYER_NOT_FOUND', 'player not found');
    }
    if (player.status === 'spectator' || player.status === 'left') {
      throw new DomainError(
        'SPECTATOR_CANNOT_SUBMIT',
        'spectator cannot submit',
      );
    }
    if (!challenge.participatingPlayerIds.includes(input.playerId)) {
      const ack = { accepted: false, reason: 'not_participating' };
      const next = this.cloneMatch(match);
      next.commandAcks.set(input.commandId, ack);
      next.updatedAtMs = this.clock.nowMs();
      return { match: next, events: [], duplicate: false, ack };
    }
    // Memory: answers are only valid in the answer phase (after preview).
    if (
      challenge.engineId === 'memory.sequence' &&
      challenge.roundPhase === 'preview'
    ) {
      const ack = { accepted: false, reason: 'preview_active' };
      const next = this.cloneMatch(match);
      next.commandAcks.set(input.commandId, ack);
      next.updatedAtMs = this.clock.nowMs();
      return { match: next, events: [], duplicate: false, ack };
    }

    // Inclusive deadline boundary: late only when strictly after deadline
    // (accepted at equality).
    const receivedMonoMs = input.receivedMonoMs ?? this.clock.monoMs();
    if (receivedMonoMs > challenge.deadlineMonoMs) {
      const ack = { accepted: false, reason: 'late' };
      const next = this.cloneMatch(match);
      next.commandAcks.set(input.commandId, ack);
      next.updatedAtMs = this.clock.nowMs();
      return { match: next, events: [], duplicate: false, ack };
    }

    const existing = challenge.submissions.get(input.playerId);
    const isCompleteSum = challenge.engineId === LOGIC_COMPLETE_SUM_ENGINE_ID;
    const isPassThePulse =
      challenge.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID;
    const isPairSync = challenge.engineId === 'social.pair_sync';
    const pairHasPartner = isPairSync
      ? challenge.pairAssignments?.get(input.playerId) != null
      : false;
    // Pair sync with a partner only completes when overlapping taps reach
    // togetherMs — a release is progress, not a final answer.
    let isFinal = isCompleteSum || isPassThePulse
      ? false
      : isPairSync && pairHasPartner
        ? false
        : input.answer['final'] !== false;
    if (!isCompleteSum && !isPassThePulse && existing && existing.final !== false) {
      const ack = { accepted: true, reason: 'already_submitted' };
      const next = this.cloneMatch(match);
      next.commandAcks.set(input.commandId, ack);
      return { match: next, events: [], duplicate: false, ack };
    }
    if (
      !isCompleteSum &&
      !isPassThePulse &&
      player.submittedForCurrentChallenge
    ) {
      const ack = { accepted: true, reason: 'already_submitted' };
      const next = this.cloneMatch(match);
      next.commandAcks.set(input.commandId, ack);
      return { match: next, events: [], duplicate: false, ack };
    }

    const next = this.cloneMatch(match);
    const nextChallenge = next.currentChallenge!;

    if (isPassThePulse) {
      const parsed = validatePassThePulseTapAnswer(input.answer);
      if (!parsed.ok) {
        const ack = { accepted: false, reason: parsed.reason };
        next.commandAcks.set(input.commandId, ack);
        next.updatedAtMs = this.clock.nowMs();
        return { match: next, events: [], duplicate: false, ack };
      }
      const priorState = nextChallenge.passThePulseState;
      if (!priorState) {
        const ack = { accepted: false, reason: 'malformed' };
        next.commandAcks.set(input.commandId, ack);
        next.updatedAtMs = this.clock.nowMs();
        return { match: next, events: [], duplicate: false, ack };
      }
      const applied = applyPassThePulseTap({
        state: priorState,
        playerId: input.playerId,
        legId: parsed.legId,
        nowMonoMs: receivedMonoMs,
      });
      if (!applied.ok) {
        const ack = { accepted: false, reason: applied.reason };
        next.commandAcks.set(input.commandId, ack);
        next.updatedAtMs = this.clock.nowMs();
        return { match: next, events: [], duplicate: false, ack };
      }
      nextChallenge.passThePulseState = applied.state;
      nextChallenge.submissions.set(input.playerId, {
        commandId: input.commandId,
        answer: {
          legId: parsed.legId,
          final: false,
        },
        receivedMonoMs,
        final: false,
      });
      const ack = { accepted: true, reason: 'progress' };
      next.commandAcks.set(input.commandId, ack);
      next.updatedAtMs = this.clock.nowMs();
      return {
        match: next,
        events: [],
        duplicate: false,
        ack,
        liveUpdate: true,
      };
    }

    if (isCompleteSum) {
      const parsed = validateCompleteSumSelectionAnswer(input.answer);
      if (!parsed.ok) {
        const ack = { accepted: false, reason: parsed.reason };
        next.commandAcks.set(input.commandId, ack);
        next.updatedAtMs = this.clock.nowMs();
        return { match: next, events: [], duplicate: false, ack };
      }
      const priorState = nextChallenge.completeSumState;
      if (!priorState) {
        const ack = { accepted: false, reason: 'malformed' };
        next.commandAcks.set(input.commandId, ack);
        next.updatedAtMs = this.clock.nowMs();
        return { match: next, events: [], duplicate: false, ack };
      }
      const applied = applyCompleteSumSelection({
        state: priorState,
        playerId: input.playerId,
        selectedValue: parsed.selectedValue,
        nowMonoMs: this.clock.monoMs(),
      });
      if (!applied.ok) {
        const ack = {
          accepted: applied.reason === 'already_succeeded',
          reason: applied.reason,
        };
        next.commandAcks.set(input.commandId, ack);
        next.updatedAtMs = this.clock.nowMs();
        return { match: next, events: [], duplicate: false, ack };
      }
      nextChallenge.completeSumState = applied.state;
      nextChallenge.submissions.set(input.playerId, {
        commandId: input.commandId,
        answer: {
          selectedValue: parsed.selectedValue,
          final: false,
        },
        receivedMonoMs,
        final: false,
      });
      const ack = { accepted: true, reason: 'progress' };
      next.commandAcks.set(input.commandId, ack);
      next.updatedAtMs = this.clock.nowMs();
      // Defer resolve so clients can finish the ring/total success motion.
      return {
        match: next,
        events: [],
        duplicate: false,
        ack,
        liveUpdate: true,
      };
    }

    // Pair sync: first progress/tap stamps the press start. Later heldMs
    // updates must not slide that stamp or mixed client/server clocks desync.
    const receivedToStore =
      existing != null && isPairSync ? existing.receivedMonoMs : receivedMonoMs;

    // Store only the client-provided answer — never persist evaluator secrets.
    nextChallenge.submissions.set(input.playerId, {
      commandId: input.commandId,
      answer: { ...input.answer },
      receivedMonoMs: receivedToStore,
      final: isFinal,
    });
    if (isFinal) {
      next.players.get(input.playerId)!.submittedForCurrentChallenge = true;
    }
    const holding = isPairSync && input.answer['holding'] === true;
    const liveUpdate = isPairSync
      ? setPairSyncPartnerHolding(nextChallenge, input.playerId, holding)
      : false;
    const ack = {
      accepted: true,
      reason: isFinal ? undefined : 'progress',
    };
    next.commandAcks.set(input.commandId, ack);
    next.updatedAtMs = this.clock.nowMs();

    if (isPairSync && pairHasPartner) {
      const overlap = updatePairSyncOverlap(nextChallenge, receivedMonoMs);
      const togetherMs =
        pairSyncTogetherMs(nextChallenge.definition.serverConfig) ?? 0;
      if (togetherMs > 0 && overlap >= togetherMs) {
        for (const id of nextChallenge.participatingPlayerIds) {
          const sub = nextChallenge.submissions.get(id);
          if (!sub) continue;
          nextChallenge.submissions.set(id, {
            ...sub,
            final: true,
            answer: { ...sub.answer, final: true, holding: false },
          });
          const seat = next.players.get(id);
          if (seat) seat.submittedForCurrentChallenge = true;
          setPairSyncPartnerHolding(nextChallenge, id, false);
        }
        const resolved = this.resolveChallenge(next);
        return {
          match: resolved.match,
          events: resolved.events,
          duplicate: false,
          ack: { accepted: true },
        };
      }
    }

    // Early resolve when every participating active player has a final submission.
    // Memory is simultaneous recall: keep the shared deadline so one fast seat
    // cannot end the round while others are still answering.
    const allowEarlyResolve = nextChallenge.engineId !== 'memory.sequence';
    const allSubmitted = nextChallenge.participatingPlayerIds.every((id) => {
      const seat = next.players.get(id);
      if (!seat || seat.status === 'spectator' || seat.status === 'left') {
        return true;
      }
      const sub = nextChallenge.submissions.get(id);
      return sub != null && sub.final !== false;
    });
    if (allowEarlyResolve && allSubmitted && isFinal) {
      const resolved = this.resolveChallenge(next);
      return {
        match: resolved.match,
        events: resolved.events,
        duplicate: false,
        ack,
      };
    }

    return { match: next, events: [], duplicate: false, ack, liveUpdate };
  }

  resolveDueTimeouts(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (
      match.status !== 'challenge_active' ||
      !match.currentChallenge ||
      match.currentChallenge.status !== 'active'
    ) {
      return { match, events: [] };
    }
    // Inclusive deadline boundary: timeout due only when strictly after
    // deadline (not at equality).
    if (this.clock.monoMs() <= match.currentChallenge.deadlineMonoMs) {
      return { match, events: [] };
    }
    const next = this.cloneMatch(match);
    if (
      next.currentChallenge?.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID &&
      next.currentChallenge.passThePulseState
    ) {
      const forced = resolveDuePassThePulseMisses({
        state: next.currentChallenge.passThePulseState,
        nowMonoMs: this.clock.monoMs(),
      });
      // Force any still-waiting seats to missed at global deadline.
      const results = { ...forced.state.results };
      let seq = forced.state.stateSequence;
      for (const id of forced.state.routePlayerIds) {
        if (results[id] === 'waiting') {
          results[id] = 'missed';
          seq += 1;
        }
      }
      next.currentChallenge.passThePulseState = {
        ...forced.state,
        results,
        stateSequence: seq,
        challengeStatus: 'completed',
        currentLegId: null,
        currentTargetPlayerId: null,
      };
    }
    return this.resolveChallenge(next);
  }

  /**
   * Resolve complete_sum after the short success-motion hold (ring/total anim).
   * Safe to call when the hold is not due — returns no events.
   */
  resolveDueCompleteSumSuccess(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (
      match.status !== 'challenge_active' ||
      !match.currentChallenge ||
      match.currentChallenge.status !== 'active' ||
      match.currentChallenge.engineId !== LOGIC_COMPLETE_SUM_ENGINE_ID
    ) {
      return { match, events: [] };
    }
    const sumState = match.currentChallenge.completeSumState;
    const dueAt = sumState?.successResolveAtMonoMs;
    if (
      dueAt == null ||
      !sumState?.allSelected ||
      sumState.currentTotal !== sumState.target ||
      this.clock.monoMs() < dueAt
    ) {
      return { match, events: [] };
    }
    return this.resolveChallenge(this.cloneMatch(match));
  }

  /**
   * Auto-miss closed pass-the-pulse windows and resolve after the final hold.
   */
  resolveDuePassThePulse(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
    liveUpdate?: boolean;
  } {
    if (
      match.status !== 'challenge_active' ||
      !match.currentChallenge ||
      match.currentChallenge.status !== 'active' ||
      match.currentChallenge.engineId !== SOCIAL_PASS_THE_PULSE_ENGINE_ID
    ) {
      return { match, events: [] };
    }
    const prior = match.currentChallenge.passThePulseState;
    if (!prior) {
      return { match, events: [] };
    }
    const nowMono = this.clock.monoMs();
    const missed = resolveDuePassThePulseMisses({
      state: prior,
      nowMonoMs: nowMono,
    });
    let nextMatch = match;
    if (missed.changed) {
      nextMatch = this.cloneMatch(match);
      nextMatch.currentChallenge!.passThePulseState = missed.state;
      nextMatch.updatedAtMs = this.clock.nowMs();
    }
    const state = nextMatch.currentChallenge!.passThePulseState!;
    const dueAt = state.completeResolveAtMonoMs;
    if (
      state.challengeStatus === 'completed' &&
      typeof dueAt === 'number' &&
      nowMono >= dueAt
    ) {
      return this.resolveChallenge(this.cloneMatch(nextMatch));
    }
    if (missed.changed) {
      return { match: nextMatch, events: [], liveUpdate: true };
    }
    return { match, events: [] };
  }

  private resolveChallenge(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
    duplicate?: boolean;
    ack?: { accepted: boolean; reason?: string };
  } {
    const challenge = match.currentChallenge;
    if (!challenge || challenge.status !== 'active') {
      return { match, events: [] };
    }

    match.status = 'resolving';
    const evaluator = this.evaluators.get(challenge.engineId);
    if (!evaluator) {
      throw new DomainError('INVALID_DEFINITION', 'unknown challenge engine');
    }

    const resolutions: PlayerChallengeResolution[] = [];
    for (const playerId of challenge.participatingPlayerIds) {
      const player = match.players.get(playerId);
      if (!player) {
        continue;
      }
      if (player.status === 'spectator') {
        resolutions.push({
          playerId,
          outcome: 'skipped_spectator',
          heartsDelta: 0,
          energyDelta: 0,
          heartsAfter: player.hearts,
          energyAfter: player.energy,
          statusAfter: player.status,
        });
        continue;
      }
      if (player.status === 'left') {
        resolutions.push({
          playerId,
          outcome: 'left',
          heartsDelta: 0,
          energyDelta: 0,
          heartsAfter: player.hearts,
          energyAfter: player.energy,
          statusAfter: player.status,
          reasonKey: 'player.status.left',
        });
        continue;
      }

      const submission = challenge.submissions.get(playerId);
      let outcome: PlayerChallengeResolution['outcome'];
      let reasonKey: string | undefined;
      let measureMs: number | undefined;
      let energyDelta = 0;
      if (!submission) {
        if (challenge.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID) {
          const result = challenge.passThePulseState?.results[playerId];
          if (result === 'hit') {
            outcome = 'success';
            reasonKey = 'result.success';
          } else if (result === 'missed') {
            outcome = 'failure';
            reasonKey = 'result.pass_the_pulse.missed';
          } else if (evaluator.absenceOutcome === 'success') {
            outcome = 'success';
            reasonKey = 'result.success';
            measureMs = challenge.definition.durationMs;
          } else {
            outcome = 'timeout';
            reasonKey = 'result.timeout';
          }
        } else if (evaluator.absenceOutcome === 'success') {
          outcome = 'success';
          reasonKey = 'result.success';
          measureMs = challenge.definition.durationMs;
        } else {
          outcome = 'timeout';
          reasonKey = 'result.timeout';
        }
      } else if (submission.receivedMonoMs > challenge.deadlineMonoMs) {
        outcome = 'timeout';
        reasonKey = 'result.timeout';
      } else {
        const answerForEval = { ...submission.answer };
        const seatVariant = challenge.seatVariants?.get(playerId);
        if (challenge.engineId === WAIT_FOR_SIGNAL_ENGINE_ID) {
          const token = seatVariant?.signalToken ?? challenge.signalToken;
          const startMono =
            seatVariant?.signalAtMonoMs ?? challenge.signalAtMonoMs;
          const endMono =
            seatVariant?.signalEndsAtMonoMs ?? challenge.signalEndsAtMonoMs;
          if (
            token &&
            startMono != null &&
            endMono != null &&
            submission.receivedMonoMs >= startMono &&
            submission.receivedMonoMs <= endMono
          ) {
            // Inject expected token only inside the inclusive blue window.
            answerForEval['_expectedSignalToken'] = token;
          }
        }
        if (challenge.engineId === 'social.pair_sync') {
          updatePairSyncOverlap(challenge, this.clock.monoMs());
          const partnerId = challenge.pairAssignments?.get(playerId);
          const partnerSub = partnerId
            ? challenge.submissions.get(partnerId)
            : undefined;
          answerForEval['_hasPartner'] = partnerId != null;
          answerForEval['_partnerSubmitted'] = partnerSub != null;
          answerForEval['_overlapMs'] = challenge.pairSyncOverlapMs ?? 0;
          if (partnerSub) {
            answerForEval['_partnerReceivedMonoMs'] = partnerSub.receivedMonoMs;
            answerForEval['_selfReceivedMonoMs'] = submission.receivedMonoMs;
            answerForEval['_partnerHeldMs'] =
              typeof partnerSub.answer['heldMs'] === 'number' &&
              Number.isFinite(partnerSub.answer['heldMs'])
                ? partnerSub.answer['heldMs']
                : 0;
            answerForEval['_partnerReleasedEarly'] =
              partnerSub.answer['releasedEarly'] === true;
          }
        }
        if (challenge.engineId === LOGIC_COMPLETE_SUM_ENGINE_ID) {
          const sumState = challenge.completeSumState;
          const succeeded =
            sumState != null &&
            sumState.allSelected &&
            sumState.currentTotal === sumState.target;
          answerForEval['_completeSumSucceeded'] = succeeded;
          answerForEval['_completeSumAllSelected'] =
            sumState?.allSelected === true;
        }
        if (challenge.engineId === SOCIAL_PASS_THE_PULSE_ENGINE_ID) {
          const pulse = challenge.passThePulseState;
          const result = pulse?.results[playerId];
          answerForEval['_passThePulseHit'] = result === 'hit';
          answerForEval['_passThePulseMissed'] = result === 'missed';
        }
        const definitionForEval =
          seatVariant && Object.keys(seatVariant.serverOverlay).length > 0
            ? {
                ...challenge.definition,
                serverConfig: {
                  ...challenge.definition.serverConfig,
                  ...seatVariant.serverOverlay,
                },
              }
            : challenge.definition;
        const evaluation = evaluator.evaluate({
          definition: definitionForEval,
          answer: answerForEval,
          receivedMonoMs: submission.receivedMonoMs,
          deadlineMonoMs: challenge.deadlineMonoMs,
        });
        outcome = evaluation.success ? 'success' : 'failure';
        reasonKey = evaluation.reasonKey;
        measureMs = evaluation.measureMs;
        if (
          evaluation.success &&
          typeof evaluation.energyRewardOverride === 'number'
        ) {
          energyDelta = evaluation.energyRewardOverride;
        }
      }

      let heartsDelta = 0;
      if (outcome === 'success') {
        if (energyDelta === 0) {
          energyDelta = challenge.definition.energyRewardOnSuccess;
        }
        const energyBefore = player.energy;
        // Meter stays capped while a granted power is unused.
        if (energyBefore >= ENERGY_THRESHOLD) {
          energyDelta = 0;
        } else {
          const room = ENERGY_THRESHOLD - energyBefore;
          const applied = Math.min(energyDelta, room);
          player.energy += applied;
          energyDelta = applied;
        }
        if (
          match.mode !== 'training' &&
          energyBefore < ENERGY_THRESHOLD &&
          player.energy >= ENERGY_THRESHOLD
        ) {
          const config = match.powerConfig ?? defaultPowerConfig();
          const { grant } = convertEnergyForPlayer(
            player,
            match.mode,
            config,
            () => Math.random(),
          );
          if (grant) {
            // Defer event emission until after sequence bump below.
            (
              player as PlayerState & { __pendingGrant?: typeof grant }
            ).__pendingGrant = grant;
          }
        }
      } else {
        heartsDelta = -challenge.definition.heartPenaltyOnFailure;
        player.hearts = Math.max(0, player.hearts + heartsDelta);
      }
      if (player.hearts === 0) {
        player.status = 'spectator';
      }
      resolutions.push({
        playerId,
        outcome,
        heartsDelta,
        energyDelta,
        heartsAfter: player.hearts,
        energyAfter: Math.min(ENERGY_THRESHOLD, player.energy),
        statusAfter: player.status,
        reasonKey,
        measureMs,
      });
    }

    // Pair-sync / subset rounds: active seats that did not participate must
    // still report absolute vitals so clients never treat "missing local
    // resolution" as a wipe of previously earned energy.
    const resolvedIds = new Set(resolutions.map((r) => r.playerId));
    for (const player of match.players.values()) {
      if (resolvedIds.has(player.playerId)) {
        continue;
      }
      resolutions.push({
        playerId: player.playerId,
        outcome: player.status === 'left' ? 'left' : 'skipped_spectator',
        heartsDelta: 0,
        energyDelta: 0,
        heartsAfter: player.hearts,
        energyAfter: Math.min(ENERGY_THRESHOLD, player.energy),
        statusAfter: player.status,
        reasonKey:
          player.status === 'left'
            ? 'player.status.left'
            : 'result.outcome.skipped_spectator',
      });
    }

    challenge.resolutions = resolutions;
    challenge.status = 'resolved';
    challenge.roundPhase = 'resolved';
    match.currentChallenge = challenge;

    const survivors = [...match.players.values()].filter(
      (p) => p.status === 'active' && p.hearts > 0,
    );

    const bump = this.bump(match);
    const events: DomainEvent[] = [
      bump,
      {
        kind: 'challenge_resolved',
        sequence: match.sequence,
        revision: match.revision,
        serverTimestampMs: bump.serverTimestampMs,
        challengeInstanceId: challenge.challengeInstanceId,
        resolutions,
      },
    ];

    for (const p of match.players.values()) {
      const pending = (
        p as PlayerState & {
          __pendingGrant?: {
            outcome: 'granted' | 'inventory_full';
            powerId: import('./types').PowerId | null;
          };
        }
      ).__pendingGrant;
      if (pending) {
        // Each grant is its own sequenced client event. Sharing the resolve
        // sequence caused mobile to drop power.granted after challenge.resolved.
        const grantBump = this.bump(match);
        events.push(
          grantBump,
          ...grantEventsFromConversion(
            match,
            p.playerId,
            pending,
            match.sequence,
            match.revision,
            grantBump.serverTimestampMs,
          ),
        );
        delete (p as PlayerState & { __pendingGrant?: unknown }).__pendingGrant;
      }
    }

    if (survivors.length === 1) {
      // Training is capacity-1: the sole seat is always "one survivor". Never
      // crown here — MatchService advances through the playlist while hearts
      // remain, then completes when the pack is done (or after a wipe → retry).
      if (match.mode === 'training') {
        match.status = 'waiting';
        match.phase = 'challenge_active';
        match.currentChallenge = challenge;
      } else {
        match.status = 'completed';
        match.phase = 'completed';
        match.winnerId = survivors[0]!.playerId;
        match.currentChallenge = challenge;
        const finishBump = this.bump(match);
        events.push(finishBump, {
          kind: 'match_finished',
          sequence: match.sequence,
          revision: match.revision,
          serverTimestampMs: finishBump.serverTimestampMs,
          winnerId: match.winnerId,
        });
      }
    } else if (survivors.length === 0) {
      if (match.mode === 'training') {
        // Last heart lost in training: stay playable for round feedback + retry
        // (fresh 3 hearts). Do not unsafe-halt a solo practice session.
        match.status = 'waiting';
        match.phase = 'challenge_active';
        match.currentChallenge = challenge;
      } else {
        // Simultaneous wipe — no Last Heart remains. Equal elimination → draw.
        match.status = 'completed';
        match.phase = 'draw';
        match.winnerId = null;
        match.currentChallenge = challenge;
        const drawBump = this.bump(match);
        events.push(drawBump, {
          kind: 'match_drawn',
          sequence: match.sequence,
          revision: match.revision,
          serverTimestampMs: drawBump.serverTimestampMs,
        });
      }
    } else {
      // Keep the resolved challenge until the service enters round_result
      // (needed so resolutions can be copied into lastRoundResult).
      match.status = 'waiting';
      match.phase = 'challenge_active';
      match.currentChallenge = challenge;
    }

    return { match, events };
  }

  toPublicSnapshot(
    match: MatchState,
    viewerPlayerId?: string,
  ): {
    matchId: string;
    status: MatchState['status'];
    phase: MatchPhase;
    phaseDeadlineAtMs: number | null;
    lobbyFillDeadlineAtMs: number | null;
    roundNumber: number;
    serverNowMs: number;
    lastRoundResult: MatchState['lastRoundResult'];
    nextPhaseAtMs: number | null;
    revision: number;
    sequence: number;
    winnerId: string | null;
    mode: MatchMode;
    hostPlayerId: string | null;
    roomCode: string | null;
    players: Array<{
      playerId: string;
      hearts: number;
      energy: number;
      status: PlayerState['status'];
      presence: PlayerState['presence'];
      submittedForCurrentChallenge: boolean;
      displayName?: string;
      avatarColor?: string;
      ready: boolean;
      isBot?: boolean;
      isHost: boolean;
    }>;
    currentChallenge: PublicChallengeView | null;
    releasePins: MatchState['releasePins'];
    tactical: {
      pendingAttack: {
        attackId: string;
        attackerId: string;
        targetId: string;
        powerId: 'danger_pulse';
        reflected: boolean;
        defenseDeadlineAtMs: number;
      } | null;
      eligibleTargetIds?: string[];
      actorsWithOffensiveCharge?: string[];
      lastGrant: MatchState['lastPowerGrant'];
    } | null;
  } {
    const now = this.clock.nowMs();
    // Resolve briefly leaves phase=challenge_active with a resolved round still
    // attached so the service can copy resolutions into lastRoundResult. Public
    // clients must never see challenge_active + null currentChallenge (mobile
    // used to render that as the lobby player list).
    const resolvedPendingHold =
      match.phase === 'challenge_active' &&
      match.currentChallenge != null &&
      match.currentChallenge.status === 'resolved';
    const lastRoundResult =
      match.lastRoundResult ??
      (resolvedPendingHold
        ? {
            challengeInstanceId: match.currentChallenge!.challengeInstanceId,
            resolutions: [...match.currentChallenge!.resolutions],
          }
        : null);
    const localPlayerForTargets =
      match.phase === 'power_action' ? match.powerActionActorIds[0] : null;
    return {
      matchId: match.matchId,
      status: match.status,
      phase: resolvedPendingHold ? 'round_result' : match.phase,
      phaseDeadlineAtMs: match.phaseDeadlineAtMs,
      lobbyFillDeadlineAtMs: match.lobbyFillDeadlineAtMs,
      roundNumber: match.roundNumber,
      serverNowMs: now,
      lastRoundResult,
      nextPhaseAtMs: match.nextPhaseAtMs,
      revision: match.revision,
      sequence: match.sequence,
      winnerId: match.winnerId,
      mode: match.mode,
      hostPlayerId: match.hostPlayerId,
      roomCode: match.roomCode,
      players: [...match.players.values()].map((p) => ({
        playerId: p.playerId,
        hearts: p.hearts,
        energy: Math.min(ENERGY_THRESHOLD, p.energy),
        status: p.status,
        presence: p.presence,
        submittedForCurrentChallenge: p.submittedForCurrentChallenge,
        inventory: cloneInventory(p.inventory ?? EMPTY_INVENTORY),
        protectedThroughRound: p.protectedThroughRound,
        lastDangerPulseTargetId: p.lastDangerPulseTargetId,
        ...(p.displayName !== undefined ? { displayName: p.displayName } : {}),
        ...(p.avatarColor !== undefined ? { avatarColor: p.avatarColor } : {}),
        ready: p.ready,
        ...(p.isBot === true ? { isBot: true } : {}),
        isHost: match.hostPlayerId != null && p.playerId === match.hostPlayerId,
      })),
      currentChallenge:
        match.currentChallenge && match.currentChallenge.status === 'active'
          ? toPublicChallengeView(match.currentChallenge, now, viewerPlayerId)
          : null,
      releasePins: match.releasePins,
      tactical: {
        pendingAttack: match.pendingAttack
          ? {
              attackId: match.pendingAttack.attackId,
              attackerId: match.pendingAttack.attackerId,
              targetId: match.pendingAttack.targetId,
              powerId: 'danger_pulse' as const,
              reflected: match.pendingAttack.reflected,
              defenseDeadlineAtMs: match.pendingAttack.defenseDeadlineAtMs,
            }
          : null,
        eligibleTargetIds:
          match.phase === 'power_action' && localPlayerForTargets
            ? eligibleDangerPulseTargets(match, localPlayerForTargets)
            : match.phase === 'power_action'
              ? []
              : undefined,
        actorsWithOffensiveCharge:
          match.phase === 'power_action'
            ? [...match.powerActionActorIds]
            : undefined,
        lastGrant: match.lastPowerGrant,
      },
    };
  }

  beginPowerAction(
    match: MatchState,
    holdMs?: number,
  ): { match: MatchState; events: DomainEvent[] } {
    const next = this.cloneMatch(match);
    const config = next.powerConfig ?? defaultPowerConfig();
    for (const p of next.players.values()) {
      p.powerActionResolved = false;
    }
    const actors = playersWithOffensiveCharge(next).filter((id) => {
      return eligibleDangerPulseTargets(next, id).length > 0;
    });
    if (actors.length === 0) {
      return { match: next, events: [] };
    }
    const windowMs = holdMs ?? config.actionWindowMs;
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    next.status = 'waiting';
    next.phase = 'power_action';
    next.phaseDeadlineAtMs = nowWall + windowMs;
    next.phaseDeadlineMonoMs = nowMono + windowMs;
    next.nextPhaseAtMs = nowWall + windowMs;
    next.powerActionActorIds = actors;
    next.pendingAttack = null;
    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'power_offered',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          actorsWithOffensiveCharge: actors,
          actionDeadlineAtMs: next.phaseDeadlineAtMs!,
        },
      ],
    };
  }

  useDangerPulse(
    match: MatchState,
    input: {
      attackerId: string;
      targetPlayerId: string;
      offensivePowersDisabled?: boolean;
    },
  ): { match: MatchState; events: DomainEvent[] } {
    if (match.phase !== 'power_action') {
      throw new DomainError('POWER_PHASE_INVALID', 'not in power action');
    }
    if (
      match.phaseDeadlineMonoMs != null &&
      this.clock.monoMs() > match.phaseDeadlineMonoMs
    ) {
      throw new DomainError('POWER_PHASE_INVALID', 'action window expired');
    }
    if (input.offensivePowersDisabled) {
      throw new DomainError(
        'OFFENSIVE_POWERS_DISABLED',
        'offensive powers disabled',
      );
    }
    const next = this.cloneMatch(match);
    const attacker = next.players.get(input.attackerId);
    if (!attacker || attacker.status !== 'active') {
      throw new DomainError('POWER_NOT_AVAILABLE', 'attacker unavailable');
    }
    if (attacker.inventory.danger_pulse < 1) {
      throw new DomainError('POWER_NOT_AVAILABLE', 'no danger pulse charge');
    }
    if (attacker.powerActionResolved) {
      throw new DomainError('POWER_PHASE_INVALID', 'already acted');
    }
    const eligible = eligibleDangerPulseTargets(next, input.attackerId);
    if (!eligible.includes(input.targetPlayerId)) {
      throw new DomainError('ILLEGAL_POWER_TARGET', 'illegal target');
    }
    const config = next.powerConfig ?? defaultPowerConfig();
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    attacker.inventory.danger_pulse = 0;
    resetMeterAfterPowerConsume(attacker);
    attacker.powerActionResolved = true;
    attacker.lastDangerPulseTargetId = input.targetPlayerId;
    const attackId = makeAttackId();
    next.pendingAttack = {
      attackId,
      attackerId: input.attackerId,
      targetId: input.targetPlayerId,
      powerId: 'danger_pulse',
      reflected: false,
      defenseDeadlineAtMs: nowWall + config.defenseWindowMs,
      defenseDeadlineMonoMs: nowMono + config.defenseWindowMs,
    };
    next.phase = 'power_defense';
    next.phaseDeadlineAtMs = next.pendingAttack.defenseDeadlineAtMs;
    next.phaseDeadlineMonoMs = next.pendingAttack.defenseDeadlineMonoMs;
    next.nextPhaseAtMs = next.pendingAttack.defenseDeadlineAtMs;
    next.powerActionActorIds = [];
    const usedBump = this.bump(next);
    const defenseBump = this.bump(next);
    return {
      match: next,
      events: [
        usedBump,
        {
          kind: 'power_used',
          sequence: usedBump.sequence,
          revision: next.revision,
          serverTimestampMs: usedBump.serverTimestampMs,
          attackId,
          attackerId: input.attackerId,
          targetId: input.targetPlayerId,
        },
        defenseBump,
        {
          kind: 'power_defense_required',
          sequence: defenseBump.sequence,
          revision: next.revision,
          serverTimestampMs: defenseBump.serverTimestampMs,
          attackId,
          attackerId: input.attackerId,
          targetId: input.targetPlayerId,
          reflected: false,
          defenseDeadlineAtMs: next.pendingAttack.defenseDeadlineAtMs,
        },
      ],
    };
  }

  skipPowerAction(
    match: MatchState,
    playerId: string,
  ): { match: MatchState; events: DomainEvent[] } {
    if (match.phase !== 'power_action') {
      throw new DomainError('POWER_PHASE_INVALID', 'not in power action');
    }
    const next = this.cloneMatch(match);
    const player = next.players.get(playerId);
    if (!player) {
      throw new DomainError('PLAYER_NOT_FOUND', 'player not found');
    }
    if (!next.powerActionActorIds.includes(playerId)) {
      return { match: next, events: [] };
    }
    if (player.powerActionResolved) {
      return { match: next, events: [] };
    }
    player.powerActionResolved = true;
    next.powerActionActorIds = next.powerActionActorIds.filter(
      (id) => id !== playerId,
    );
    const bump = this.bump(next);
    if (next.powerActionActorIds.length === 0) {
      next.phase = 'round_result';
      next.phaseDeadlineAtMs = this.clock.nowMs();
      next.phaseDeadlineMonoMs = this.clock.monoMs();
    }
    return { match: next, events: [bump] };
  }

  defendPowerAttack(
    match: MatchState,
    input: {
      defenderId: string;
      attackId: string;
      choice: 'none' | 'shield' | 'reflect';
    },
  ): { match: MatchState; events: DomainEvent[] } {
    if (match.phase !== 'power_defense' || !match.pendingAttack) {
      throw new DomainError('POWER_PHASE_INVALID', 'not in defense');
    }
    if (match.pendingAttack.attackId !== input.attackId) {
      throw new DomainError('POWER_ATTACK_NOT_FOUND', 'attack mismatch');
    }
    if (match.pendingAttack.targetId !== input.defenderId) {
      throw new DomainError('POWER_PHASE_INVALID', 'not the target');
    }
    if (this.clock.monoMs() > match.pendingAttack.defenseDeadlineMonoMs) {
      throw new DomainError('POWER_PHASE_INVALID', 'defense window expired');
    }
    return this.resolvePendingAttack(match, input.choice);
  }

  expirePowerDefense(match: MatchState): {
    match: MatchState;
    events: DomainEvent[];
  } {
    if (match.phase !== 'power_defense' || !match.pendingAttack) {
      return { match, events: [] };
    }
    // Inclusive deadline: expire when mono has reached/passed the defense end.
    if (this.clock.monoMs() < match.pendingAttack.defenseDeadlineMonoMs) {
      return { match, events: [] };
    }
    return this.resolvePendingAttack(match, 'none');
  }

  private resolvePendingAttack(
    match: MatchState,
    choice: 'none' | 'shield' | 'reflect',
  ): { match: MatchState; events: DomainEvent[] } {
    const next = this.cloneMatch(match);
    const attack = next.pendingAttack!;
    const target = next.players.get(attack.targetId);
    const attacker = next.players.get(attack.attackerId);
    if (!target || !attacker) {
      throw new DomainError('POWER_ATTACK_NOT_FOUND', 'participants missing');
    }

    let outcome:
      | 'hit'
      | 'shielded'
      | 'reflected_hit'
      | 'reflected_shielded'
      | 'expired'
      | 'cancelled' = 'hit';
    let heartsDelta = 0;
    let resolvedTarget = target;

    if (choice === 'shield') {
      if (target.inventory.shield < 1) {
        throw new DomainError('POWER_NOT_AVAILABLE', 'no shield');
      }
      target.inventory.shield = 0;
      resetMeterAfterPowerConsume(target);
      outcome = attack.reflected ? 'reflected_shielded' : 'shielded';
    } else if (choice === 'reflect') {
      if (attack.reflected) {
        throw new DomainError('POWER_NOT_AVAILABLE', 'already reflected');
      }
      if (target.inventory.reflection < 1) {
        throw new DomainError('POWER_NOT_AVAILABLE', 'no reflection');
      }
      target.inventory.reflection = 0;
      resetMeterAfterPowerConsume(target);
      const config = next.powerConfig ?? defaultPowerConfig();
      const nowWall = this.clock.nowMs();
      const nowMono = this.clock.monoMs();
      next.pendingAttack = {
        attackId: makeAttackId(),
        attackerId: attack.targetId,
        targetId: attack.attackerId,
        powerId: 'danger_pulse',
        reflected: true,
        defenseDeadlineAtMs: nowWall + config.defenseWindowMs,
        defenseDeadlineMonoMs: nowMono + config.defenseWindowMs,
      };
      next.phase = 'power_defense';
      next.phaseDeadlineAtMs = next.pendingAttack.defenseDeadlineAtMs;
      next.phaseDeadlineMonoMs = next.pendingAttack.defenseDeadlineMonoMs;
      next.nextPhaseAtMs = next.pendingAttack.defenseDeadlineAtMs;
      const bump = this.bump(next);
      return {
        match: next,
        events: [
          bump,
          {
            kind: 'power_defense_required',
            sequence: next.sequence,
            revision: next.revision,
            serverTimestampMs: bump.serverTimestampMs,
            attackId: next.pendingAttack.attackId,
            attackerId: next.pendingAttack.attackerId,
            targetId: next.pendingAttack.targetId,
            reflected: true,
            defenseDeadlineAtMs: next.pendingAttack.defenseDeadlineAtMs,
          },
        ],
      };
    } else {
      heartsDelta = -1;
      applyHeartLoss(target, heartsDelta);
      target.protectedThroughRound = next.roundNumber + 1;
      outcome = attack.reflected ? 'reflected_hit' : 'hit';
      if (
        choice === 'none' &&
        this.clock.monoMs() > attack.defenseDeadlineMonoMs
      ) {
        outcome = 'expired';
      }
      resolvedTarget = target;
    }

    next.pendingAttack = null;
    next.phase = 'round_result';
    next.phaseDeadlineAtMs = this.clock.nowMs();
    next.phaseDeadlineMonoMs = this.clock.monoMs();
    next.nextPhaseAtMs = next.phaseDeadlineAtMs;
    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'power_resolved',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          attackId: attack.attackId,
          attackerId: attack.attackerId,
          targetId: resolvedTarget.playerId,
          outcome,
          heartsDeltaTarget: heartsDelta,
          heartsAfterTarget: resolvedTarget.hearts,
          statusAfterTarget: resolvedTarget.status,
        },
      ],
    };
  }

  /** Clear protection that has expired relative to the upcoming challenge round. */
  clearExpiredProtection(match: MatchState): MatchState {
    const next = this.cloneMatch(match);
    for (const p of next.players.values()) {
      if (
        p.protectedThroughRound != null &&
        p.protectedThroughRound < next.roundNumber
      ) {
        p.protectedThroughRound = null;
      }
    }
    return next;
  }

  private cloneMatch(match: MatchState): MatchState {
    return {
      ...match,
      players: clonePlayers(match.players),
      commandAcks: new Map(match.commandAcks),
      pinnedPlaylist: [...match.pinnedPlaylist],
      hardLoopPlaylist: [...(match.hardLoopPlaylist ?? [])],
      releasePins: match.releasePins ? { ...match.releasePins } : null,
      powerConfig: match.powerConfig
        ? {
            ...match.powerConfig,
            powers: match.powerConfig.powers.map((p) => ({
              ...p,
              eligibleModes: [...p.eligibleModes],
              assetIds: [...p.assetIds],
            })),
          }
        : null,
      pendingAttack: match.pendingAttack ? { ...match.pendingAttack } : null,
      lastPowerGrant: match.lastPowerGrant ? { ...match.lastPowerGrant } : null,
      powerActionActorIds: [...(match.powerActionActorIds ?? [])],
      lastRoundResult: match.lastRoundResult
        ? {
            ...match.lastRoundResult,
            resolutions: [...match.lastRoundResult.resolutions],
          }
        : null,
      currentChallenge: match.currentChallenge
        ? {
            ...match.currentChallenge,
            submissions: new Map(match.currentChallenge.submissions),
            resolutions: [...match.currentChallenge.resolutions],
            participatingPlayerIds: [
              ...match.currentChallenge.participatingPlayerIds,
            ],
            pairAssignments: match.currentChallenge.pairAssignments
              ? new Map(match.currentChallenge.pairAssignments)
              : undefined,
            seatVariants: cloneSeatVariants(
              match.currentChallenge.seatVariants,
            ),
            completeSumState: match.currentChallenge.completeSumState
              ? cloneCompleteSumState(match.currentChallenge.completeSumState)
              : undefined,
            passThePulseState: match.currentChallenge.passThePulseState
              ? clonePassThePulseState(match.currentChallenge.passThePulseState)
              : undefined,
            definition: pinDefinition(match.currentChallenge.definition),
          }
        : null,
    };
  }

  private bump(match: MatchState): Extract<DomainEvent, { kind: 'sequence' }> {
    match.revision += 1;
    match.sequence += 1;
    match.updatedAtMs = this.clock.nowMs();
    return {
      kind: 'sequence',
      sequence: match.sequence,
      revision: match.revision,
      serverTimestampMs: match.updatedAtMs,
    };
  }
}
