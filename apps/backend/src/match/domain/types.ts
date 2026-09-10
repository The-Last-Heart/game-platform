export const MATCH_PLAYER_CAPACITY = 6;
export const INITIAL_HEARTS = 3;
export const INITIAL_ENERGY = 0;
export const MIN_CHALLENGE_DURATION_MS = 3000;
export const MAX_CHALLENGE_DURATION_MS = 8000;

export type MatchStatus =
  | 'waiting'
  | 'challenge_active'
  | 'resolving'
  | 'completed';

export type PlayerStatus = 'active' | 'spectator';
export type Presence = 'connected' | 'disconnected';

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
  heartPenaltyOnFailure: 0 | 1;
  energyRewardOnSuccess: number;
  promptKey: string;
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
  status: PlayerStatus;
  presence: Presence;
  submittedForCurrentChallenge: boolean;
  resumeTokenHash: string;
};

export type PlayerChallengeResolution = {
  playerId: string;
  outcome: 'success' | 'failure' | 'timeout' | 'skipped_spectator';
  heartsDelta: number;
  energyDelta: number;
  heartsAfter: number;
  energyAfter: number;
  statusAfter: PlayerStatus;
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
  submissions: Map<
    string,
    {
      commandId: string;
      answer: Record<string, unknown>;
      receivedMonoMs: number;
    }
  >;
  resolutions: PlayerChallengeResolution[];
};

export type MatchState = {
  matchId: string;
  status: MatchStatus;
  revision: number;
  sequence: number;
  players: Map<string, PlayerState>;
  currentChallenge: ChallengeRound | null;
  winnerId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** commandId -> last acknowledgement payload */
  commandAcks: Map<string, unknown>;
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
      kind: 'unsafe_zero_survivors';
      sequence: number;
      revision: number;
      serverTimestampMs: number;
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
      | 'PLAYER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export type ChallengeEvaluation = {
  success: boolean;
};

export interface ChallengeEvaluator {
  readonly engineId: string;
  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
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
};
