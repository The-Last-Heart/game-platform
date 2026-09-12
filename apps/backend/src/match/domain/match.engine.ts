import { randomBytes, randomUUID } from 'node:crypto';
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
} from './types';
import { WAIT_FOR_SIGNAL_ENGINE_ID } from './wait-for-signal.evaluator';

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
    [...players.entries()].map(([id, player]) => [id, { ...player }]),
  );
}

function deepCloneJsonRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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
}

export function toPublicChallengeView(
  challenge: ChallengeRound,
  serverNowMs: number,
): PublicChallengeView {
  const view: PublicChallengeView = {
    challengeInstanceId: challenge.challengeInstanceId,
    definitionId: challenge.definitionId,
    definitionVersion: challenge.definitionVersion,
    engineId: challenge.engineId,
    promptKey: challenge.definition.promptKey,
    choiceKeys: [...(challenge.definition.choiceKeys ?? [])],
    clientConfig: deepCloneJsonRecord(challenge.definition.clientConfig),
    serverNowMs,
    startsAtMs: challenge.startsAtMs,
    deadlineAtMs: challenge.deadlineAtMs,
    durationMs: challenge.definition.durationMs,
    roundPhase: challenge.roundPhase,
  };

  // Only expose signal data after signal has fired
  if (
    challenge.roundPhase === 'signal_active' ||
    challenge.roundPhase === 'resolved'
  ) {
    if (challenge.signalToken) {
      view.signalToken = challenge.signalToken;
    }
    if (challenge.signaledAtMs != null) {
      view.signaledAtMs = challenge.signaledAtMs;
    }
  }

  return view;
}

export class MatchEngine {
  constructor(
    private readonly clock: Clock,
    private readonly evaluators: ChallengeEvaluatorRegistry,
  ) {}

  createMatch(
    matchId?: string,
    options?: CreateMatchOptions,
  ): MatchState {
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
    },
  ): { match: MatchState; events: DomainEvent[] } {
    if (match.status !== 'waiting') {
      throw new DomainError('MATCH_NOT_JOINABLE', 'match is not joinable');
    }
    if (match.players.size >= match.playerCapacity) {
      throw new DomainError('MATCH_FULL', 'match is full');
    }
    if (match.players.has(input.playerId)) {
      throw new DomainError('MATCH_NOT_JOINABLE', 'player already joined');
    }

    const next = this.cloneMatch(match);
    const isBot = input.isBot === true;
    // Non-private modes auto-ready; private requires explicit match.ready.
    const autoReady = isBot || match.mode !== 'private';
    next.players.set(input.playerId, {
      playerId: input.playerId,
      hearts: INITIAL_HEARTS,
      energy: INITIAL_ENERGY,
      status: 'active',
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
   * Whether the lobby may begin ready countdown:
   * - seated count === playerCapacity
   * - every seat joinAccepted
   * - private: every seat ready === true
   * - other modes: ready is auto-satisfied on accept
   */
  canStartReadyCountdown(match: MatchState): boolean {
    if (match.status !== 'waiting' || match.phase !== 'lobby') {
      return false;
    }
    if (match.players.size !== match.playerCapacity) {
      return false;
    }
    if (!this.allJoinsAccepted(match)) {
      return false;
    }
    if (match.mode === 'private') {
      return [...match.players.values()].every((p) => p.ready);
    }
    return true;
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
    return { match: next, events: [bump], removed: true };
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

  beginReadyCountdown(
    match: MatchState,
    durationMs: number,
  ): { match: MatchState; events: DomainEvent[] } {
    if (!this.canStartReadyCountdown(match)) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        `match requires ${match.playerCapacity} ready accepted players`,
      );
    }
    const next = this.cloneMatch(match);
    const nowWall = this.clock.nowMs();
    const nowMono = this.clock.monoMs();
    next.phase = 'ready_countdown';
    next.phaseDeadlineAtMs = nowWall + durationMs;
    next.phaseDeadlineMonoMs = nowMono + durationMs;
    const bump = this.bump(next);
    return { match: next, events: [bump] };
  }

  beginChallengeIntro(
    match: MatchState,
    durationMs: number,
    definition: ChallengeDefinition,
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
      submissions: new Map(),
      resolutions: [],
    };
    next.currentChallenge = round;
    for (const player of next.players.values()) {
      player.submittedForCurrentChallenge = false;
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
      const signalDelay =
        (challenge.definition.serverConfig['signalDelayMs'] as number) ?? 1500;
      challenge.signalAtMonoMs = nowMono + signalDelay;
      challenge.signalToken = randomBytes(16).toString('base64url');
    } else {
      challenge.roundPhase = 'signal_active';
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
    if (match.players.size !== match.playerCapacity) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        `match requires ${match.playerCapacity} players`,
      );
    }
    const isInitialStart = [...match.players.values()].every(
      (p) => p.hearts === INITIAL_HEARTS && p.energy === INITIAL_ENERGY,
    );
    if (isInitialStart && activePlayers.length !== match.playerCapacity) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        `initial start requires ${match.playerCapacity} active players`,
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
      submissions: new Map(),
      resolutions: [],
    };

    if (pinned.engineId === WAIT_FOR_SIGNAL_ENGINE_ID) {
      round.roundPhase = 'waiting_signal';
      const signalDelay =
        (pinned.serverConfig['signalDelayMs'] as number) ?? 1500;
      round.signalAtMonoMs = nowMono + signalDelay;
      round.signalToken = randomBytes(16).toString('base64url');
    } else {
      // Non-signal engines start in signal_active immediately
      round.roundPhase = 'signal_active';
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
      match.currentChallenge.roundPhase !== 'waiting_signal'
    ) {
      return { match, events: [] };
    }

    const signalAtMono = match.currentChallenge.signalAtMonoMs;
    if (signalAtMono == null || this.clock.monoMs() < signalAtMono) {
      return { match, events: [] };
    }

    const next = this.cloneMatch(match);
    const challenge = next.currentChallenge!;
    const nowWall = this.clock.nowMs();
    challenge.roundPhase = 'signal_active';
    challenge.signaledAtMs = nowWall;

    const bump = this.bump(next);
    return {
      match: next,
      events: [
        bump,
        {
          kind: 'challenge_signal',
          sequence: next.sequence,
          revision: next.revision,
          serverTimestampMs: bump.serverTimestampMs,
          challengeInstanceId: challenge.challengeInstanceId,
          signalToken: challenge.signalToken!,
          signaledAtMs: nowWall,
          serverNowMs: nowWall,
        },
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
    if (player.status === 'spectator') {
      throw new DomainError(
        'SPECTATOR_CANNOT_SUBMIT',
        'spectator cannot submit',
      );
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

    if (
      challenge.submissions.has(input.playerId) ||
      player.submittedForCurrentChallenge
    ) {
      const ack = { accepted: true, reason: 'already_submitted' };
      const next = this.cloneMatch(match);
      next.commandAcks.set(input.commandId, ack);
      return { match: next, events: [], duplicate: false, ack };
    }

    const next = this.cloneMatch(match);
    const nextChallenge = next.currentChallenge!;

    // Store only the client-provided answer — never persist evaluator secrets.
    nextChallenge.submissions.set(input.playerId, {
      commandId: input.commandId,
      answer: { ...input.answer },
      receivedMonoMs,
    });
    next.players.get(input.playerId)!.submittedForCurrentChallenge = true;
    const ack = { accepted: true };
    next.commandAcks.set(input.commandId, ack);
    next.updatedAtMs = this.clock.nowMs();

    // Early resolve when every participating active player has submitted.
    const allSubmitted = nextChallenge.participatingPlayerIds.every((id) =>
      nextChallenge.submissions.has(id),
    );
    if (allSubmitted) {
      const resolved = this.resolveChallenge(next);
      return {
        match: resolved.match,
        events: resolved.events,
        duplicate: false,
        ack,
      };
    }

    return { match: next, events: [], duplicate: false, ack };
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
    return this.resolveChallenge(this.cloneMatch(match));
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

      const submission = challenge.submissions.get(playerId);
      let outcome: PlayerChallengeResolution['outcome'];
      if (!submission) {
        outcome = 'timeout';
      } else if (submission.receivedMonoMs > challenge.deadlineMonoMs) {
        outcome = 'timeout';
      } else {
        const answerForEval = { ...submission.answer };
        if (
          challenge.engineId === WAIT_FOR_SIGNAL_ENGINE_ID &&
          challenge.signalToken &&
          challenge.signalAtMonoMs != null &&
          submission.receivedMonoMs >= challenge.signalAtMonoMs
        ) {
          // Inject expected token only for evaluation — never stored on the submission.
          answerForEval['_expectedSignalToken'] = challenge.signalToken;
        }
        const evaluation = evaluator.evaluate({
          definition: challenge.definition,
          answer: answerForEval,
          receivedMonoMs: submission.receivedMonoMs,
          deadlineMonoMs: challenge.deadlineMonoMs,
        });
        outcome = evaluation.success ? 'success' : 'failure';
      }

      let heartsDelta = 0;
      let energyDelta = 0;
      if (outcome === 'success') {
        energyDelta = challenge.definition.energyRewardOnSuccess;
        player.energy += energyDelta;
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
        energyAfter: player.energy,
        statusAfter: player.status,
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

    if (survivors.length === 1) {
      const sole = survivors[0]!;
      const soleResolution = resolutions.find((r) => r.playerId === sole.playerId);
      // Training is capacity-1: "one survivor" is always true after any round.
      // Only crown a winner on an authoritative success; failure/timeout must
      // surface as round feedback (precise practice), not a false victory.
      const trainingFalseVictory =
        match.mode === 'training' && soleResolution?.outcome !== 'success';
      if (trainingFalseVictory) {
        match.status = 'waiting';
        match.phase = 'challenge_active';
        match.currentChallenge = challenge;
      } else {
        match.status = 'completed';
        match.phase = 'completed';
        match.winnerId = sole.playerId;
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
      // Do not invent a winner. Halt safely after resolution broadcast.
      match.status = 'resolving';
      match.phase = 'halted';
      const haltBump = this.bump(match);
      events.push(haltBump, {
        kind: 'unsafe_zero_survivors',
        sequence: match.sequence,
        revision: match.revision,
        serverTimestampMs: haltBump.serverTimestampMs,
      });
    } else {
      // Keep the resolved challenge until the service enters round_result
      // (needed so resolutions can be copied into lastRoundResult).
      match.status = 'waiting';
      match.phase = 'challenge_active';
      match.currentChallenge = challenge;
    }

    return { match, events };
  }

  toPublicSnapshot(match: MatchState): {
    matchId: string;
    status: MatchState['status'];
    phase: MatchPhase;
    phaseDeadlineAtMs: number | null;
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
  } {
    const now = this.clock.nowMs();
    return {
      matchId: match.matchId,
      status: match.status,
      phase: match.phase,
      phaseDeadlineAtMs: match.phaseDeadlineAtMs,
      roundNumber: match.roundNumber,
      serverNowMs: now,
      lastRoundResult: match.lastRoundResult,
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
        energy: p.energy,
        status: p.status,
        presence: p.presence,
        submittedForCurrentChallenge: p.submittedForCurrentChallenge,
        ...(p.displayName !== undefined
          ? { displayName: p.displayName }
          : {}),
        ...(p.avatarColor !== undefined
          ? { avatarColor: p.avatarColor }
          : {}),
        ready: p.ready,
        ...(p.isBot === true ? { isBot: true } : {}),
        isHost: match.hostPlayerId != null && p.playerId === match.hostPlayerId,
      })),
      currentChallenge:
        match.currentChallenge && match.currentChallenge.status === 'active'
          ? toPublicChallengeView(match.currentChallenge, now)
          : null,
    };
  }

  private cloneMatch(match: MatchState): MatchState {
    return {
      ...match,
      players: clonePlayers(match.players),
      commandAcks: new Map(match.commandAcks),
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
