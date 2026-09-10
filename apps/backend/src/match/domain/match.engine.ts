import { randomUUID } from 'node:crypto';
import type {
  ChallengeDefinition,
  ChallengeEvaluatorRegistry,
  ChallengeRound,
  Clock,
  DomainEvent,
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

function clonePlayers(
  players: Map<string, PlayerState>,
): Map<string, PlayerState> {
  return new Map(
    [...players.entries()].map(([id, player]) => [id, { ...player }]),
  );
}

function pinDefinition(definition: ChallengeDefinition): ChallengeDefinition {
  return {
    ...definition,
    choiceKeys: definition.choiceKeys ? [...definition.choiceKeys] : [],
    clientConfig: { ...definition.clientConfig },
    serverConfig: { ...definition.serverConfig },
  };
}

export function validateChallengeDefinition(
  definition: ChallengeDefinition,
): void {
  if (
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
    !definition.definitionId ||
    !Number.isInteger(definition.definitionVersion) ||
    definition.definitionVersion < 1
  ) {
    throw new DomainError(
      'INVALID_DEFINITION',
      'definition identity/version incomplete',
    );
  }
  if (!definition.engineId || !definition.promptKey) {
    throw new DomainError(
      'INVALID_DEFINITION',
      'challenge definition incomplete',
    );
  }
  if (
    definition.choiceKeys !== undefined &&
    !Array.isArray(definition.choiceKeys)
  ) {
    throw new DomainError('INVALID_DEFINITION', 'choiceKeys must be an array');
  }
}

export function toPublicChallengeView(
  challenge: ChallengeRound,
  serverNowMs: number,
): PublicChallengeView {
  return {
    challengeInstanceId: challenge.challengeInstanceId,
    definitionId: challenge.definitionId,
    definitionVersion: challenge.definitionVersion,
    engineId: challenge.engineId,
    promptKey: challenge.definition.promptKey,
    choiceKeys: [...(challenge.definition.choiceKeys ?? [])],
    clientConfig: { ...challenge.definition.clientConfig },
    serverNowMs,
    startsAtMs: challenge.startsAtMs,
    deadlineAtMs: challenge.deadlineAtMs,
    durationMs: challenge.definition.durationMs,
  };
}

export class MatchEngine {
  constructor(
    private readonly clock: Clock,
    private readonly evaluators: ChallengeEvaluatorRegistry,
  ) {}

  createMatch(matchId = randomUUID()): MatchState {
    const now = this.clock.nowMs();
    return {
      matchId,
      status: 'waiting',
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
    input: { playerId: string; resumeTokenHash: string },
  ): { match: MatchState; events: DomainEvent[] } {
    if (match.status !== 'waiting') {
      throw new DomainError('MATCH_NOT_JOINABLE', 'match is not joinable');
    }
    if (match.players.size >= MATCH_PLAYER_CAPACITY) {
      throw new DomainError('MATCH_FULL', 'match is full');
    }
    if (match.players.has(input.playerId)) {
      throw new DomainError('MATCH_NOT_JOINABLE', 'player already joined');
    }

    const next = this.cloneMatch(match);
    next.players.set(input.playerId, {
      playerId: input.playerId,
      hearts: INITIAL_HEARTS,
      energy: INITIAL_ENERGY,
      status: 'active',
      presence: 'connected',
      submittedForCurrentChallenge: false,
      resumeTokenHash: input.resumeTokenHash,
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

  startChallenge(
    match: MatchState,
    definition: ChallengeDefinition,
    challengeInstanceId = randomUUID(),
  ): { match: MatchState; events: DomainEvent[] } {
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
    if (match.players.size !== MATCH_PLAYER_CAPACITY) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', 'match requires six players');
    }
    const isInitialStart = [...match.players.values()].every(
      (p) => p.hearts === INITIAL_HEARTS && p.energy === INITIAL_ENERGY,
    );
    if (isInitialStart && activePlayers.length !== MATCH_PLAYER_CAPACITY) {
      throw new DomainError(
        'NOT_ENOUGH_PLAYERS',
        'initial start requires six active players',
      );
    }
    if (activePlayers.length === 0) {
      throw new DomainError(
        'UNSAFE_ZERO_SURVIVORS',
        'no active players remain',
      );
    }
    if (!isInitialStart && activePlayers.length < 2) {
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
      challengeInstanceId,
      engineId: pinned.engineId,
      definitionId: pinned.definitionId,
      definitionVersion: pinned.definitionVersion,
      definition: pinned,
      participatingPlayerIds: activePlayers.map((p) => p.playerId),
      startsAtMs: nowWall,
      deadlineAtMs: nowWall + pinned.durationMs,
      deadlineMonoMs: nowMono + pinned.durationMs,
      status: 'active',
      submissions: new Map(),
      resolutions: [],
    };
    for (const player of next.players.values()) {
      player.submittedForCurrentChallenge = false;
    }
    next.currentChallenge = round;
    next.status = 'challenge_active';
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

  submitAnswer(
    match: MatchState,
    input: {
      playerId: string;
      challengeInstanceId: string;
      commandId: string;
      answer: Record<string, unknown>;
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

    const receivedMonoMs = this.clock.monoMs();
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
    nextChallenge.submissions.set(input.playerId, {
      commandId: input.commandId,
      answer: input.answer,
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
    if (this.clock.monoMs() < match.currentChallenge.deadlineMonoMs) {
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
        const evaluation = evaluator.evaluate({
          definition: challenge.definition,
          answer: submission.answer,
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
      match.status = 'completed';
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
    } else if (survivors.length === 0) {
      // Do not invent a winner. Halt safely after resolution broadcast.
      match.status = 'resolving';
      const haltBump = this.bump(match);
      events.push(haltBump, {
        kind: 'unsafe_zero_survivors',
        sequence: match.sequence,
        revision: match.revision,
        serverTimestampMs: haltBump.serverTimestampMs,
      });
    } else {
      match.status = 'waiting';
      match.currentChallenge = null;
    }

    return { match, events };
  }

  toPublicSnapshot(match: MatchState): {
    matchId: string;
    status: MatchState['status'];
    revision: number;
    sequence: number;
    winnerId: string | null;
    players: Array<{
      playerId: string;
      hearts: number;
      energy: number;
      status: PlayerState['status'];
      presence: PlayerState['presence'];
      submittedForCurrentChallenge: boolean;
    }>;
    currentChallenge: PublicChallengeView | null;
  } {
    const now = this.clock.nowMs();
    return {
      matchId: match.matchId,
      status: match.status,
      revision: match.revision,
      sequence: match.sequence,
      winnerId: match.winnerId,
      players: [...match.players.values()].map((p) => ({
        playerId: p.playerId,
        hearts: p.hearts,
        energy: p.energy,
        status: p.status,
        presence: p.presence,
        submittedForCurrentChallenge: p.submittedForCurrentChallenge,
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
