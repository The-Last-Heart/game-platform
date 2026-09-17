export const MATCH_PLAYER_CAPACITY = 6;
/** Quick Survival / live lobbies: need at least two humans to start. */
export const MIN_LIVE_MATCH_PLAYERS = 2;
/**
 * After an in-match disconnect, how long to wait for resume before treating the
 * seat as left (so a 2→1 live match can crown the remaining player).
 */
export const DISCONNECT_GRACE_MS = 30_000;
/** How long an open quick lobby waits to fill before starting (if ≥2) or aborting (if 1). */
export const QUICK_LOBBY_FILL_WAIT_MS = 60_000;
/** Host extend adds this much to the open-lobby fill wait. */
export const QUICK_LOBBY_FILL_EXTEND_MS = 30_000;
/** Cap on remaining fill wait after an extend (from now). */
export const QUICK_LOBBY_FILL_MAX_REMAINING_MS = 120_000;
export const INITIAL_HEARTS = 3;
export const INITIAL_ENERGY = 0;
export const MIN_CHALLENGE_DURATION_MS = 3000;
/** Allows longer LH-009 gestures (e.g. fog wipe at 10s) while keeping rounds bounded. */
export const MAX_CHALLENGE_DURATION_MS = 15_000;

export type MatchMode = 'quick_survival' | 'private' | 'training' | 'dev';

export type MatchStatus =
  | 'waiting'
  | 'challenge_active'
  | 'resolving'
  | 'completed';

export type MatchPhase =
  | 'lobby'
  | 'ready_countdown'
  | 'challenge_intro'
  | 'challenge_active'
  | 'round_result'
  | 'power_action'
  | 'power_defense'
  | 'completed'
  | 'draw'
  | 'halted';

export type PowerId = 'danger_pulse' | 'shield' | 'reflection';

export type PlayerPowerInventory = {
  danger_pulse: 0 | 1;
  shield: 0 | 1;
  reflection: 0 | 1;
};

export const EMPTY_INVENTORY: PlayerPowerInventory = {
  danger_pulse: 0,
  shield: 0,
  reflection: 0,
};

export const ENERGY_THRESHOLD = 4;

export type PowerDefinitionRuntime = {
  powerId: PowerId;
  enabled: boolean;
  grantWeight: number;
  eligibleModes: MatchMode[];
  nameKey: string;
  explanationKey: string;
  assetIds: string[];
};

export type PowerConfigurationRuntime = {
  releaseId: string;
  versionLabel: string;
  energyThreshold: 4;
  inventoryMaxTotal: 3;
  inventoryMaxPerPower: 1;
  actionWindowMs: number;
  defenseWindowMs: number;
  powers: PowerDefinitionRuntime[];
};

export type PendingPowerAttack = {
  attackId: string;
  attackerId: string;
  targetId: string;
  powerId: 'danger_pulse';
  reflected: boolean;
  defenseDeadlineAtMs: number;
  defenseDeadlineMonoMs: number;
};

export type LastPowerGrant = {
  playerId: string;
  powerId: PowerId | null;
  outcome: 'granted' | 'inventory_full';
};
export type RoundPhase =
  | 'waiting_signal'
  | 'signal_active'
  | 'signal_expired'
  | 'preview'
  | 'answer'
  | 'resolved';

export type PlayerStatus = 'active' | 'spectator' | 'left';
export type Presence = 'connected' | 'disconnected';

export type PlayerIdentity = {
  displayName?: string;
  avatarColor?: string;
  countryCode?: string;
  /** Durable per-install id for Quick Survival scoring (internal). */
  persistentPlayerId?: string;
};

export type MatchReleasePinsState = {
  challengeCatalogReleaseId: string;
  gameModeRuleReleaseId: string;
  localizationReleaseId: string;
  powerConfigurationReleaseId: string;
};

export type CreateMatchOptions = {
  mode: MatchMode;
  hostPlayerId?: string | null;
  roomCode?: string | null;
  playerCapacity?: number;
  /** Four release pins frozen at match create. */
  releasePins?: MatchReleasePinsState | null;
  /** Playlist resolved from the pinned catalog (never re-reads "current"). */
  pinnedPlaylist?: readonly ChallengeDefinition[];
  /**
   * When true with an explicit `pinnedPlaylist`, skip 5+5+5 restructuring
   * (training.retry re-seats a single last-played definition).
   */
  preservePinnedPlaylist?: boolean;
  /**
   * Hard-only pool for sudden-death after the structured 5+5+5 pack.
   * Defaults to hard-tagged entries from the mode-filtered catalog pool.
   */
  hardLoopPlaylist?: readonly ChallengeDefinition[];
  /** Power configuration frozen at match create. */
  powerConfig?: PowerConfigurationRuntime | null;
};

export type Clock = {
  /** Wall-clock epoch ms for protocol timestamps. */
  nowMs(): number;
  /** Monotonic ms for deadline comparisons — must not track wall-clock skew. */
  monoMs(): number;
};

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }

  monoMs(): number {
    // performance.now() is monotonic within the process; never use Date.now().
    return performance.now();
  }
}

export class FakeClock implements Clock {
  private wall: number;
  private mono: number;

  constructor(startMs = 1_700_000_000_000) {
    this.wall = startMs;
    this.mono = startMs;
  }

  nowMs(): number {
    return this.wall;
  }

  monoMs(): number {
    return this.mono;
  }

  /** Advance both wall and monotonic time together (normal time passage). */
  advance(ms: number): void {
    this.wall += ms;
    this.mono += ms;
  }

  /** Move only wall clock — simulates NTP skew without affecting deadlines. */
  setWall(ms: number): void {
    this.wall = ms;
  }

  /** Advance only monotonic time (deadline progression). */
  advanceMono(ms: number): void {
    this.mono += ms;
  }

  set(ms: number): void {
    this.wall = ms;
    this.mono = ms;
  }
}

export type ChallengeDefinition = {
  definitionId: string;
  /** Positive integer catalog version pinned onto active rounds. */
  definitionVersion: number;
  engineId: string;
  durationMs: number;
  /** Instruction hold before play; 0 skips challenge_intro. */
  introDurationMs?: number;
  /** Success/fail hold before the next round. */
  resultHoldMs?: number;
  heartPenaltyOnFailure: 0 | 1;
  energyRewardOnSuccess: number;
  promptKey: string;
  /** Catalog difficulty used to order the room pack (easy → medium → hard). */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Optional / empty for non-choice engines. */
  choiceKeys?: string[];
  /** Safe parameters for reusable mobile engines — may be sent to clients. */
  clientConfig: Record<string, unknown>;
  /** Private authoritative parameters — never sent to clients. */
  serverConfig: Record<string, unknown>;
};

export type PlayerState = {
  playerId: string;
  hearts: number;
  energy: number;
  /**
   * Match-scoped Quick Survival claimed points (+5 win / +10 survive / −5 fail,
   * floored at 0). Published on public snapshots for terminal standings.
   */
  claimedPoints: number;
  status: PlayerStatus;
  presence: Presence;
  submittedForCurrentChallenge: boolean;
  resumeTokenHash: string;
  isBot?: boolean;
  displayName?: string;
  avatarColor?: string;
  countryCode?: string;
  /** Durable install id for leaderboard scoring; never published in snapshots. */
  persistentPlayerId?: string;
  /** Explicit ready for private lobbies; other modes may auto-ready on accept. */
  ready: boolean;
  /**
   * Internal join-acceptance bookkeeping (not public).
   * Reserved seats start false; gateway finalizeJoin sets true after live
   * lease + credentials. Bots are accepted immediately on server fill.
   */
  joinAccepted: boolean;
  inventory: PlayerPowerInventory;
  /** Protected through the end of this round number (inclusive). */
  protectedThroughRound: number | null;
  lastDangerPulseTargetId: string | null;
  /** Players who already skipped/acted in the current power_action window. */
  powerActionResolved: boolean;
};

export type PlayerChallengeResolution = {
  playerId: string;
  outcome: 'success' | 'failure' | 'timeout' | 'skipped_spectator' | 'left';
  heartsDelta: number;
  energyDelta: number;
  heartsAfter: number;
  energyAfter: number;
  statusAfter: PlayerStatus;
  reasonKey?: string;
  measureMs?: number;
};

export type ChallengeRound = {
  challengeInstanceId: string;
  engineId: string;
  definitionId: string;
  definitionVersion: number;
  /** Pinned definition snapshot — catalog edits must not mutate this. */
  definition: ChallengeDefinition;
  participatingPlayerIds: string[];
  startsAtMs: number;
  deadlineAtMs: number;
  deadlineMonoMs: number;
  status: 'active' | 'resolved';
  roundPhase: RoundPhase;
  /** Private until signaled; after signal becomes public until window ends. */
  signalToken: string | null;
  signaledAtMs: number | null;
  /** Private monotonic schedule for signal activation. */
  signalAtMonoMs: number | null;
  /** Wall-clock end of the blue window (public while active / after expire). */
  signalEndsAtMs: number | null;
  /** Private monotonic end of the blue window (exclusive). */
  signalEndsAtMonoMs: number | null;
  submissions: Map<
    string,
    {
      commandId: string;
      answer: Record<string, unknown>;
      receivedMonoMs: number;
      /** When false, further progress updates may overwrite until final. */
      final: boolean;
    }
  >;
  resolutions: PlayerChallengeResolution[];
  /** Memory: preview ends at this mono time then answer phase begins. */
  previewEndsAtMonoMs?: number | null;
  /** Pair sync: playerId → partner playerId (symmetric). */
  pairAssignments?: Map<string, string>;
  /**
   * Server-driven per-seat play params (signal timing, tilt targets, …).
   * Never serialize the full map to clients — overlay only the viewer seat.
   */
  seatVariants?: Map<string, import('./seat-variants').SeatChallengeVariant>;
  /**
   * Collaborative complete-sum live state. Hidden solution stays here only —
   * never mirrored into clientConfig or public snapshots.
   */
  completeSumState?: import('./engines/complete-sum').CompleteSumRoundState;
  /**
   * Pass-the-pulse authoritative timeline + per-seat hit/miss results.
   * Reconnect must restore this object — never regenerate the route.
   */
  passThePulseState?: import('./engines/pass-the-pulse').PassThePulseRoundState;
  /**
   * Individual ring-lock puzzles keyed by player. Private angles live here and
   * in seat overlays only — never in the shared public snapshot.
   */
  ringLockState?: import('./engines/ring-lock').RingLockRoundState;
  /** Pair sync: accumulated ms both seats were pressing at the same time. */
  pairSyncOverlapMs?: number;
  /** Pair sync: mono time the current overlapping press started, if any. */
  pairSyncOverlapStartedMonoMs?: number | null;
};

export type MatchState = {
  matchId: string;
  status: MatchStatus;
  phase: MatchPhase;
  mode: MatchMode;
  hostPlayerId: string | null;
  roomCode: string | null;
  /** Seat capacity for this match (default 6; training = 1). */
  playerCapacity: number;
  /**
   * Quick Survival open-lobby fill deadline. While set and phase is lobby, new
   * players may join until capacity; when due, start if ≥2 else abort.
   * Wall clock is published to clients; mono drives server timers.
   */
  lobbyFillDeadlineAtMs: number | null;
  lobbyFillDeadlineMonoMs: number | null;
  phaseDeadlineAtMs: number | null;
  phaseDeadlineMonoMs: number | null;
  roundNumber: number;
  lastRoundResult: {
    challengeInstanceId: string;
    resolutions: PlayerChallengeResolution[];
  } | null;
  nextPhaseAtMs: number | null;
  revision: number;
  sequence: number;
  players: Map<string, PlayerState>;
  currentChallenge: ChallengeRound | null;
  winnerId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** commandId -> last acknowledgement payload */
  commandAcks: Map<string, unknown>;
  /** Frozen at create; active matches never re-resolve current releases. */
  releasePins: MatchReleasePinsState | null;
  /** Ordered definitions: 5 easy → 5 medium → 5 hard (shuffled within tier). */
  pinnedPlaylist: ChallengeDefinition[];
  /** Hard-only recycle pool while ≥2 players still have hearts. */
  hardLoopPlaylist: ChallengeDefinition[];
  /** Frozen power rules for this match (LH-008). */
  powerConfig: PowerConfigurationRuntime | null;
  pendingAttack: PendingPowerAttack | null;
  lastPowerGrant: LastPowerGrant | null;
  /** Player ids that still may act in power_action (have charge and not resolved). */
  powerActionActorIds: string[];
};

export type DomainEvent =
  | {
      kind: 'sequence';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
    }
  | {
      kind: 'player_joined';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      playerId: string;
    }
  | {
      kind: 'presence_changed';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      playerId: string;
      presence: Presence;
    }
  | {
      kind: 'challenge_started';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      challenge: ChallengeRound;
      serverNowMs: number;
    }
  | {
      kind: 'challenge_signal';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      challengeInstanceId: string;
      signalToken: string;
      signaledAtMs: number;
      signalEndsAtMs: number;
      serverNowMs: number;
      /** When set, gateway unicasts to this seat only. */
      playerId?: string;
    }
  | {
      kind: 'challenge_signal_ended';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      challengeInstanceId: string;
      signalEndsAtMs: number;
      serverNowMs: number;
      /** When set, gateway unicasts to this seat only. */
      playerId?: string;
    }
  | {
      kind: 'challenge_resolved';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      challengeInstanceId: string;
      resolutions: PlayerChallengeResolution[];
    }
  | {
      kind: 'match_finished';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      winnerId: string;
    }
  | {
      kind: 'match_drawn';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
    }
  | {
      kind: 'unsafe_zero_survivors';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
    }
  | {
      kind: 'power_granted';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      playerId: string;
      powerId: PowerId;
      energyAfter: number;
    }
  | {
      kind: 'power_inventory_full';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      playerId: string;
      energyAfter: number;
    }
  | {
      kind: 'power_offered';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      actorsWithOffensiveCharge: string[];
      actionDeadlineAtMs: number;
    }
  | {
      kind: 'power_used';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      attackId: string;
      attackerId: string;
      targetId: string;
    }
  | {
      kind: 'power_defense_required';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      attackId: string;
      attackerId: string;
      targetId: string;
      reflected: boolean;
      defenseDeadlineAtMs: number;
    }
  | {
      kind: 'power_resolved';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
      attackId: string;
      attackerId: string;
      targetId: string;
      outcome:
        | 'hit'
        | 'shielded'
        | 'reflected_hit'
        | 'reflected_shielded'
        | 'expired'
        | 'cancelled';
      heartsDeltaTarget: number;
      heartsAfterTarget: number;
      statusAfterTarget: PlayerStatus;
    };

export class DomainError extends Error {
  constructor(
    readonly code:
      | 'MATCH_FULL'
      | 'MATCH_NOT_JOINABLE'
      | 'MATCH_NOT_WAITING'
      | 'MATCH_NOT_FOUND'
      | 'CHALLENGE_NOT_ACTIVE'
      | 'SPECTATOR_CANNOT_SUBMIT'
      | 'SUBMISSION_LATE'
      | 'ALREADY_SUBMITTED'
      | 'INVALID_DURATION'
      | 'INVALID_DEFINITION'
      | 'NOT_ENOUGH_PLAYERS'
      | 'ROUND_ALREADY_ACTIVE'
      | 'MATCH_COMPLETED'
      | 'UNSAFE_ZERO_SURVIVORS'
      | 'PLAYER_NOT_FOUND'
      | 'DEV_ONLY_FORBIDDEN'
      | 'ROOM_CODE_INVALID'
      | 'ROOM_CODE_EXPIRED'
      | 'ROOM_FULL'
      | 'QUEUE_CANCELLED'
      | 'QUEUE_TIMEOUT'
      | 'QUEUE_NOT_FOUND'
      | 'ALREADY_IN_QUEUE'
      | 'ALREADY_IN_MATCH'
      | 'NOT_IN_MATCH'
      | 'NOT_HOST'
      | 'REMATCH_UNAVAILABLE'
      | 'MATCHMAKING_PAUSED'
      | 'TRAINING_UNAVAILABLE'
      | 'NOT_LOBBY'
      | 'POWER_NOT_AVAILABLE'
      | 'POWER_PHASE_INVALID'
      | 'ILLEGAL_POWER_TARGET'
      | 'POWER_ATTACK_NOT_FOUND'
      | 'OFFENSIVE_POWERS_DISABLED'
      | 'DISPLAY_NAME_TAKEN'
      | 'DISPLAY_NAME_PROHIBITED'
      | 'DISPLAY_NAME_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export type ChallengeEvaluation = {
  success: boolean;
  reasonKey?: string;
  measureMs?: number;
  /** Optional override for energy granted on success (e.g. risk choice). */
  energyRewardOverride?: number;
};

export interface ChallengeEvaluator {
  readonly engineId: string;
  /**
   * How missing submission at inclusive deadline is treated.
   * Default timeout failure; no-touch uses success.
   */
  readonly absenceOutcome?: 'timeout' | 'success';
  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
    challengeStartsAtMonoMs?: number;
  }): ChallengeEvaluation;
}

export interface ChallengeEvaluatorRegistry {
  get(engineId: string): ChallengeEvaluator | undefined;
}

export type PublicChallengeView = {
  challengeInstanceId: string;
  definitionId: string;
  definitionVersion: number;
  engineId: string;
  promptKey: string;
  choiceKeys: string[];
  clientConfig: Record<string, unknown>;
  serverNowMs: number;
  startsAtMs: number;
  deadlineAtMs: number;
  durationMs: number;
  roundPhase: RoundPhase;
  signalToken?: string;
  signaledAtMs?: number;
  signalEndsAtMs?: number;
};
