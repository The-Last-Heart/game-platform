import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/env.validation';
import { MatchEngine } from '../domain/match.engine';
import {
  ChallengeEvaluatorRegistryImpl,
  createDevChallengeDefinition,
  DEV_DETERMINISTIC_CHOICE_ENGINE_ID,
  DevDeterministicChoiceEvaluator,
} from '../domain/dev-challenge.evaluator';
import {
  WaitForSignalEvaluator,
  WAIT_FOR_SIGNAL_ENGINE_ID,
} from '../domain/wait-for-signal.evaluator';
import type {
  ChallengeDefinition,
  Clock,
  DomainEvent,
  MatchState,
} from '../domain/types';
import {
  DomainError,
  MATCH_PLAYER_CAPACITY,
  SystemClock,
} from '../domain/types';
import { InMemoryMatchStore, type MatchStore } from '../store/match.store';
import { ResumeTokenService } from './resume-token.service';
import { DevFixtureProvider } from '../challenges/dev-fixture.provider';
import type { ChallengeDefinitionProvider } from '../challenges/challenge-definition.provider';

const READY_COUNTDOWN_MS = 3000;
const CHALLENGE_INTRO_MS = 2000;
const ROUND_RESULT_MS = 2500;
const RESUME_ACK_PREFIX = 'match.resume:';

type ResumeReceipt = {
  type: 'match.resume';
  requestTokenHash: string;
  playerId: string;
  /** Plaintext for exact idempotent replay; match-scoped in-memory only — never broadcast. */
  resumeToken: string;
};

function resumeAckKey(commandId: string): string {
  return `${RESUME_ACK_PREFIX}${commandId}`;
}

function isResumeReceipt(value: unknown): value is ResumeReceipt {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record['type'] === 'match.resume' &&
    typeof record['requestTokenHash'] === 'string' &&
    typeof record['playerId'] === 'string' &&
    typeof record['resumeToken'] === 'string'
  );
}

/** Keep only the latest resume receipt per player (newest by Map insertion order). */
function pruneResumeAcks(match: MatchState, playerId: string): void {
  const keysForPlayer: string[] = [];
  for (const [key, value] of match.commandAcks) {
    if (!key.startsWith(RESUME_ACK_PREFIX)) {
      continue;
    }
    if (!isResumeReceipt(value) || value.playerId !== playerId) {
      continue;
    }
    keysForPlayer.push(key);
  }
  // Retain only the newest key; older receipts are superseded and unsafe to replay.
  const excess = keysForPlayer.slice(0, Math.max(0, keysForPlayer.length - 1));
  for (const key of excess) {
    match.commandAcks.delete(key);
  }
}

export type MatchBroadcast = {
  matchId: string;
  events: DomainEvent[];
  snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
};

export type FinalizeJoinResult = {
  outcome: 'accepted' | 'alreadyAccepted' | 'leaseLost' | 'playerMissing';
  countdownStarted: boolean;
};

@Injectable()
export class MatchService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchService.name);
  private readonly store: MatchStore;
  private readonly tokens: ResumeTokenService;
  private readonly registry: ChallengeEvaluatorRegistryImpl;
  private engine: MatchEngine;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(broadcast: MatchBroadcast) => void>();
  private readonly clock: Clock;
  private readonly nodeEnv: AppConfig['NODE_ENV'];
  private readonly challengeProvider: ChallengeDefinitionProvider;
  /** Test-only barriers after match mutation, before identity ops return. */
  private identityBarrierHooks: {
    afterJoinMutated?: () => Promise<void>;
    afterResumeMutated?: () => Promise<void>;
    beforeFinalizeJoin?: (playerId: string) => Promise<void>;
    afterFinalizeJoin?: (playerId: string) => Promise<void>;
  } = {};

  constructor(config: ConfigService<AppConfig, true>) {
    this.nodeEnv = config.get('NODE_ENV', { infer: true });
    this.store = new InMemoryMatchStore();
    this.tokens = new ResumeTokenService();
    this.registry = new ChallengeEvaluatorRegistryImpl();
    // wait_for_signal is a real engine — register always
    this.registry.register(new WaitForSignalEvaluator());
    if (this.nodeEnv !== 'production') {
      this.registry.register(new DevDeterministicChoiceEvaluator());
    }
    this.clock = new SystemClock();
    this.engine = new MatchEngine(this.clock, this.registry);
    this.challengeProvider = new DevFixtureProvider();
  }

  static forTests(options: {
    clock: Clock;
    nodeEnv?: AppConfig['NODE_ENV'];
  }): MatchService {
    const service = Object.create(MatchService.prototype) as MatchService;
    Object.assign(service, {
      logger: new Logger(MatchService.name),
      store: new InMemoryMatchStore(),
      tokens: new ResumeTokenService(),
      registry: new ChallengeEvaluatorRegistryImpl(),
      queues: new Map(),
      timers: new Map(),
      listeners: new Set(),
      clock: options.clock,
      nodeEnv: options.nodeEnv ?? 'test',
      challengeProvider: new DevFixtureProvider(),
      identityBarrierHooks: {},
    });
    // wait_for_signal always registered
    service['registry'].register(new WaitForSignalEvaluator());
    if (service['nodeEnv'] !== 'production') {
      service['registry'].register(new DevDeterministicChoiceEvaluator());
    }
    service['engine'] = new MatchEngine(options.clock, service['registry']);
    return service;
  }

  onBroadcast(listener: (broadcast: MatchBroadcast) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.listeners.clear();
  }

  async createDevMatch(): Promise<{
    matchId: string;
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  }> {
    this.assertDevAllowed();
    const match = this.engine.createMatch();
    await this.store.save(match);
    return {
      matchId: match.matchId,
      snapshot: this.engine.toPublicSnapshot(match),
    };
  }

  async joinMatch(matchId: string): Promise<{
    playerId: string;
    resumeToken: string;
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    events: DomainEvent[];
  }> {
    const joinedResult = await this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      const playerId = this.tokens.newPlayerId();
      const issued = this.tokens.issue();
      const result = this.engine.joinPlayer(match, {
        playerId,
        resumeTokenHash: issued.hash,
      });
      await this.store.save(result.match);
      this.emit(result.match, result.events);

      // Ready countdown is deferred until finalizeJoin after the gateway has
      // bound a live socket and delivered session credentials.

      const latest = await this.requireMatch(matchId);
      return {
        playerId,
        resumeToken: issued.token,
        snapshot: this.engine.toPublicSnapshot(latest),
        events: result.events,
      };
    });
    // Barrier outside the match queue so other join/finalize ops can proceed
    // while a gateway race is paused (player-specific acceptance ordering).
    if (this.identityBarrierHooks.afterJoinMutated) {
      await this.identityBarrierHooks.afterJoinMutated();
    }
    return joinedResult;
  }

  /**
   * Finalize a reserved join after the gateway has bound a live socket and
   * delivered credentials. Marks only this player accepted; starts ready
   * countdown only when all six seated players are individually finalized.
   */
  async finalizeJoin(
    matchId: string,
    playerId: string,
    options?: { stillOwnsLease?: () => boolean },
  ): Promise<FinalizeJoinResult> {
    if (this.identityBarrierHooks.beforeFinalizeJoin) {
      await this.identityBarrierHooks.beforeFinalizeJoin(playerId);
    }
    return this.enqueue(matchId, async () => {
      const owns = (): boolean =>
        !options?.stillOwnsLease || options.stillOwnsLease();
      // Lease must still belong to the finalizing socket under the match lock.
      if (!owns()) {
        return { outcome: 'leaseLost' as const, countdownStarted: false };
      }
      const match = await this.store.get(matchId);
      if (!match) {
        return { outcome: 'playerMissing' as const, countdownStarted: false };
      }
      if (!match.players.has(playerId)) {
        return { outcome: 'playerMissing' as const, countdownStarted: false };
      }
      if (!owns()) {
        return { outcome: 'leaseLost' as const, countdownStarted: false };
      }

      const accepted = this.engine.acceptJoin(match, playerId);
      const current = accepted.match;
      if (accepted.changed) {
        await this.store.save(current);
      }
      const outcome = accepted.changed
        ? ('accepted' as const)
        : ('alreadyAccepted' as const);

      let countdownStarted = false;
      if (
        current.players.size === MATCH_PLAYER_CAPACITY &&
        current.status === 'waiting' &&
        current.phase === 'lobby' &&
        this.engine.allJoinsAccepted(current)
      ) {
        const beforePhase =
          (await this.store.get(matchId))?.phase ?? current.phase;
        await this.beginReadyCountdownLocked(matchId);
        const after = await this.store.get(matchId);
        countdownStarted =
          beforePhase === 'lobby' && after?.phase === 'ready_countdown';
      }

      if (this.identityBarrierHooks.afterFinalizeJoin) {
        await this.identityBarrierHooks.afterFinalizeJoin(playerId);
      }
      return { outcome, countdownStarted };
    });
  }

  async resumeMatch(input: {
    matchId: string;
    resumeToken: string;
    commandId: string;
    /** When set, token/receipt must belong to this player (bound-socket guard). */
    expectedPlayerId?: string;
  }): Promise<{
    playerId: string;
    resumeToken: string;
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  }> {
    return this.enqueue(input.matchId, async () => {
      const match = await this.store.get(input.matchId);
      if (!match) {
        throw new DomainError('MATCH_NOT_FOUND', 'match not found');
      }
      // Allow resume for any status (including completed / halted) when the token
      // validates — terminal clients need a final snapshot for convergence.

      const requestTokenHash = this.tokens.hash(input.resumeToken);
      const ackKey = resumeAckKey(input.commandId);
      const existingAck = match.commandAcks.get(ackKey);
      if (
        isResumeReceipt(existingAck) &&
        existingAck.requestTokenHash === requestTokenHash
      ) {
        const player = match.players.get(existingAck.playerId);
        const issuedStillCurrent =
          player != null &&
          this.tokens.hash(existingAck.resumeToken) === player.resumeTokenHash;
        if (
          !issuedStillCurrent ||
          (input.expectedPlayerId != null &&
            existingAck.playerId !== input.expectedPlayerId)
        ) {
          // Superseded receipt or wrong player — non-enumerating unauthorized.
          throw new DomainError('PLAYER_NOT_FOUND', 'resume failed');
        }
        // Idempotent replay of a lost session.accepted — same token, no re-rotate.
        // Re-apply connected presence so a disconnect between attempts does not stick.
        const presence = this.engine.setPresence(
          match,
          existingAck.playerId,
          'connected',
        );
        const next = presence.match;
        if (presence.events.length > 0) {
          await this.store.save(next);
          this.emit(next, presence.events);
        }
        const replayResult = {
          playerId: existingAck.playerId,
          resumeToken: existingAck.resumeToken,
          snapshot: this.engine.toPublicSnapshot(next),
        };
        if (this.identityBarrierHooks.afterResumeMutated) {
          await this.identityBarrierHooks.afterResumeMutated();
        }
        return replayResult;
      }

      const player = [...match.players.values()].find(
        (p) => p.resumeTokenHash === requestTokenHash,
      );
      if (!player) {
        throw new DomainError('PLAYER_NOT_FOUND', 'resume failed');
      }
      if (
        input.expectedPlayerId != null &&
        player.playerId !== input.expectedPlayerId
      ) {
        throw new DomainError('PLAYER_NOT_FOUND', 'resume failed');
      }
      const issued = this.tokens.issue();
      let next = this.engine.replaceResumeTokenHash(
        match,
        player.playerId,
        issued.hash,
      );
      const presence = this.engine.setPresence(
        next,
        player.playerId,
        'connected',
      );
      next = presence.match;
      next.commandAcks = new Map(next.commandAcks);
      next.commandAcks.set(ackKey, {
        type: 'match.resume',
        requestTokenHash,
        playerId: player.playerId,
        resumeToken: issued.token,
      } satisfies ResumeReceipt);
      pruneResumeAcks(next, player.playerId);
      await this.store.save(next);
      if (presence.events.length > 0) {
        this.emit(next, presence.events);
      }
      const resumeResult = {
        playerId: player.playerId,
        resumeToken: issued.token,
        snapshot: this.engine.toPublicSnapshot(next),
      };
      if (this.identityBarrierHooks.afterResumeMutated) {
        await this.identityBarrierHooks.afterResumeMutated();
      }
      return resumeResult;
    });
  }

  /**
   * Roll back a join whose credentials were never delivered (socket died mid-bind).
   * Removes the lobby seat when still waiting; otherwise marks disconnected so the
   * player is not left "connected" without an owning socket.
   */
  async abandonOrphanedJoin(matchId: string, playerId: string): Promise<void> {
    await this.enqueue(matchId, async () => {
      const match = await this.store.get(matchId);
      if (!match) {
        return;
      }
      const removed = this.engine.removeLobbyPlayer(match, playerId);
      if (removed.removed) {
        this.clearTimer(matchId);
        await this.store.save(removed.match);
        if (removed.events.length > 0) {
          this.emit(removed.match, removed.events);
        }
        return;
      }
      try {
        const presence = this.engine.setPresence(
          match,
          playerId,
          'disconnected',
        );
        await this.store.save(presence.match);
        if (presence.events.length > 0) {
          this.emit(presence.match, presence.events);
        }
      } catch {
        // Player already gone.
      }
    });
  }

  async markDisconnected(
    matchId: string,
    playerId: string,
    options?: { stillOwnsLease?: () => boolean },
  ): Promise<void> {
    await this.enqueue(matchId, async () => {
      const owns = (): boolean =>
        !options?.stillOwnsLease || options.stillOwnsLease();
      // Re-check under the match lock so a newer resume/lease owner cannot be
      // overwritten by an older socket's cleanup or disconnect.
      if (!owns()) {
        return;
      }
      const match = await this.store.get(matchId);
      if (!match) {
        return;
      }
      if (!owns()) {
        return;
      }
      try {
        const result = this.engine.setPresence(match, playerId, 'disconnected');
        await this.store.save(result.match);
        if (result.events.length > 0) {
          this.emit(result.match, result.events);
        }
      } catch {
        // Ignore unknown player on disconnect.
      }
    });
  }

  async submitAnswer(input: {
    matchId: string;
    playerId: string;
    challengeInstanceId: string;
    commandId: string;
    answer: Record<string, unknown>;
  }): Promise<{
    ack: { accepted: boolean; reason?: string };
    duplicate: boolean;
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  }> {
    // Stamp at enqueue so queue wait does not push a timely submit past the deadline.
    const receivedMonoMs = this.clock.monoMs();
    return this.enqueue(input.matchId, async () => {
      const match = await this.requireMatch(input.matchId);
      const result = this.engine.submitAnswer(match, {
        ...input,
        receivedMonoMs,
      });
      await this.store.save(result.match);
      if (result.events.length > 0) {
        this.clearTimer(input.matchId);
        this.emit(result.match, result.events);
        await this.maybeContinue(result.match);
      }
      const latest = await this.requireMatch(input.matchId);
      return {
        ack: result.ack,
        duplicate: result.duplicate,
        snapshot: this.engine.toPublicSnapshot(latest),
      };
    });
  }

  async requestSnapshot(matchId: string): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  }> {
    // Linearize with other match mutations via the per-match queue.
    // Client watermark/recovery is separate and still required on the client.
    return this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      return { snapshot: this.engine.toPublicSnapshot(match) };
    });
  }

  async fillDevBots(matchId: string): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    botIds: string[];
  }> {
    if (this.nodeEnv === 'production') {
      throw new DomainError(
        'DEV_ONLY_FORBIDDEN',
        'dev bot fill forbidden in production',
      );
    }
    return this.enqueue(matchId, async () => {
      let match = await this.requireMatch(matchId);
      if (match.status !== 'waiting' || match.phase !== 'lobby') {
        throw new DomainError(
          'MATCH_NOT_JOINABLE',
          'can only fill bots in lobby',
        );
      }
      const botIds: string[] = [];
      while (match.players.size < 6) {
        const botId = `bot-${randomUUID().slice(0, 8)}`;
        const botHash = `bot-hash-${botId}`;
        const result = this.engine.joinPlayer(match, {
          playerId: botId,
          resumeTokenHash: botHash,
          isBot: true,
        });
        match = result.match;
        botIds.push(botId);
        this.emit(match, result.events);
      }
      await this.store.save(match);

      if (
        match.players.size === 6 &&
        match.status === 'waiting' &&
        match.phase === 'lobby'
      ) {
        await this.beginReadyCountdownLocked(match.matchId);
      }

      const latest = await this.requireMatch(matchId);
      return {
        snapshot: this.engine.toPublicSnapshot(latest),
        botIds,
      };
    });
  }

  async startDevRound(
    matchId: string,
    definition?: ChallengeDefinition,
  ): Promise<void> {
    this.assertDevAllowed();
    await this.enqueue(matchId, async () => {
      await this.startDevRoundLocked(matchId, definition);
    });
  }

  async forceTimeout(matchId: string): Promise<void> {
    await this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      const result = this.engine.resolveDueTimeouts(match);
      await this.store.save(result.match);
      if (result.events.length > 0) {
        this.clearTimer(matchId);
        this.emit(result.match, result.events);
        await this.maybeContinue(result.match);
        return;
      }
      // Inclusive deadline boundary: accept at equality; timeout only when
      // monoMs > deadline. If the timer fired at/before equality, reschedule so
      // the timeout cannot vanish.
      const challenge = result.match.currentChallenge;
      if (
        result.match.status === 'challenge_active' &&
        challenge &&
        challenge.status === 'active' &&
        this.clock.monoMs() <= challenge.deadlineMonoMs
      ) {
        const remaining = challenge.deadlineMonoMs - this.clock.monoMs();
        this.scheduleTimeout(matchId, Math.max(1, remaining + 1));
      }
    });
  }

  /**
   * Process all due phase transitions: signal activation, timeouts, phase advances.
   * In test mode this replaces wall-clock setTimeout scheduling.
   */
  async tickDue(matchId: string): Promise<void> {
    await this.enqueue(matchId, async () => {
      await this.tickDueLocked(matchId);
    });
  }

  private async tickDueLocked(matchId: string): Promise<void> {
    let match = await this.requireMatch(matchId);

    // Check for signal activation
    if (
      match.currentChallenge &&
      match.currentChallenge.status === 'active' &&
      match.currentChallenge.roundPhase === 'waiting_signal' &&
      match.currentChallenge.signalAtMonoMs != null &&
      this.clock.monoMs() >= match.currentChallenge.signalAtMonoMs
    ) {
      const signalResult = this.engine.activateSignal(match);
      if (signalResult.events.length > 0) {
        match = signalResult.match;
        await this.store.save(match);
        this.emit(match, signalResult.events);
        this.scheduleBotSubmissions(match);
      }
    }

    // Inclusive deadline boundary: timeout due only when strictly after
    // deadline (not at equality), so a submit stamped at exact deadlineMonoMs
    // is not raced by timeout.
    if (
      match.status === 'challenge_active' &&
      match.currentChallenge &&
      match.currentChallenge.status === 'active' &&
      this.clock.monoMs() > match.currentChallenge.deadlineMonoMs
    ) {
      const timeoutResult = this.engine.resolveDueTimeouts(match);
      if (timeoutResult.events.length > 0) {
        match = timeoutResult.match;
        await this.store.save(match);
        this.clearTimer(matchId);
        this.emit(match, timeoutResult.events);
        await this.maybeContinueAfterResolve(match);
        match = await this.requireMatch(matchId);
      }
    }

    // Check for phase deadline (ready_countdown, challenge_intro, round_result)
    if (
      match.phaseDeadlineMonoMs != null &&
      this.clock.monoMs() >= match.phaseDeadlineMonoMs
    ) {
      if (match.phase === 'ready_countdown') {
        await this.advanceFromCountdown(matchId);
      } else if (match.phase === 'challenge_intro') {
        await this.advanceFromIntro(matchId);
      } else if (match.phase === 'round_result') {
        await this.advanceFromRoundResult(matchId);
      }
    }
  }

  getEngineForTests(): MatchEngine {
    return this.engine;
  }

  getStoreForTests(): MatchStore {
    return this.store;
  }

  /** Test-only: pause identity ops after mutation so gateway races can be asserted. */
  setIdentityBarrierHooksForTests(hooks: {
    afterJoinMutated?: () => Promise<void>;
    afterResumeMutated?: () => Promise<void>;
    beforeFinalizeJoin?: (playerId: string) => Promise<void>;
    afterFinalizeJoin?: (playerId: string) => Promise<void>;
  }): void {
    this.identityBarrierHooks = hooks;
  }

  /** Test-only: whether a phase/timeout timer is armed for this match. */
  hasPhaseTimerForTests(matchId: string): boolean {
    return this.timers.has(matchId);
  }

  private assertDevAllowed(): void {
    if (this.nodeEnv === 'production') {
      throw new DomainError(
        'DEV_ONLY_FORBIDDEN',
        'dev match features forbidden in production',
      );
    }
  }

  private async beginReadyCountdownLocked(matchId: string): Promise<void> {
    const match = await this.requireMatch(matchId);
    if (
      match.players.size !== MATCH_PLAYER_CAPACITY ||
      match.phase !== 'lobby' ||
      match.status !== 'waiting' ||
      !this.engine.allJoinsAccepted(match)
    ) {
      return;
    }
    const result = this.engine.beginReadyCountdown(match, READY_COUNTDOWN_MS);
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.schedulePhaseTimer(matchId, READY_COUNTDOWN_MS);
  }

  private async advanceFromCountdown(matchId: string): Promise<void> {
    const match = await this.requireMatch(matchId);
    if (match.phase !== 'ready_countdown') return;
    const definition = this.challengeProvider.getDefaultDev();
    const result = this.engine.beginChallengeIntro(
      match,
      CHALLENGE_INTRO_MS,
      definition,
    );
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.schedulePhaseTimer(matchId, CHALLENGE_INTRO_MS);
  }

  private async advanceFromIntro(matchId: string): Promise<void> {
    let match = await this.requireMatch(matchId);
    if (match.phase !== 'challenge_intro') return;
    const result = this.engine.startChallenge(match);
    match = result.match;
    await this.store.save(match);
    this.emit(match, result.events);

    // Schedule signal activation for wait_for_signal challenges
    if (
      match.currentChallenge &&
      match.currentChallenge.engineId === WAIT_FOR_SIGNAL_ENGINE_ID &&
      match.currentChallenge.signalAtMonoMs != null
    ) {
      const signalDelay =
        (match.currentChallenge.definition.serverConfig[
          'signalDelayMs'
        ] as number) ?? 1500;
      this.scheduleSignalActivation(matchId, signalDelay);
    }

    // Schedule challenge timeout
    if (match.currentChallenge) {
      this.scheduleTimeout(
        matchId,
        match.currentChallenge.definition.durationMs,
      );
    }
  }

  private async advanceFromRoundResult(matchId: string): Promise<void> {
    const match = await this.requireMatch(matchId);
    if (match.phase !== 'round_result') return;
    if (match.status === 'completed' || match.winnerId) return;

    const survivors = [...match.players.values()].filter(
      (p) => p.status === 'active',
    );
    if (survivors.length < 2) return;

    const definition = this.challengeProvider.getDefaultDev();
    const result = this.engine.beginChallengeIntro(
      match,
      CHALLENGE_INTRO_MS,
      definition,
    );
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.schedulePhaseTimer(matchId, CHALLENGE_INTRO_MS);
  }

  private async startDevRoundLocked(
    matchId: string,
    definition?: ChallengeDefinition,
  ): Promise<void> {
    this.assertDevAllowed();
    const match = await this.requireMatch(matchId);
    if (match.status === 'completed' || match.status === 'challenge_active') {
      return;
    }
    if (match.status === 'resolving') {
      return;
    }
    const def =
      definition ??
      createDevChallengeDefinition({
        durationMs: 3000,
        serverConfig: { expectedChoice: 'a' },
      });
    if (def.engineId !== DEV_DETERMINISTIC_CHOICE_ENGINE_ID) {
      throw new DomainError(
        'INVALID_DEFINITION',
        'only dev engine allowed here',
      );
    }
    const result = this.engine.startChallenge(match, def);
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.scheduleTimeout(matchId, def.durationMs);
  }

  private async maybeContinue(match: MatchState): Promise<void> {
    if (match.status === 'completed' || match.winnerId != null) return;

    // After resolve with survivors: enter the result-hold phase (server-timed).
    if (
      match.status === 'waiting' &&
      match.currentChallenge?.status === 'resolved'
    ) {
      const survivors = [...match.players.values()].filter(
        (p) => p.status === 'active',
      );
      if (survivors.length >= 2) {
        await this.enterRoundResult(match);
      }
      return;
    }

    // Already in round_result without a pending timer (e.g. reconnect edge).
    if (match.status === 'waiting' && match.phase === 'round_result') {
      const survivors = [...match.players.values()].filter(
        (p) => p.status === 'active',
      );
      if (survivors.length >= 2) {
        this.schedulePhaseTimer(match.matchId, ROUND_RESULT_MS);
      }
      return;
    }

    // Legacy path for direct startDevRound flow (deterministic_choice tests).
    if (
      match.status === 'waiting' &&
      match.winnerId == null &&
      match.phase !== 'round_result' &&
      match.phase !== 'challenge_intro' &&
      match.phase !== 'ready_countdown'
    ) {
      const survivors = [...match.players.values()].filter(
        (p) => p.status === 'active',
      );
      if (survivors.length >= 2) {
        await this.startDevRoundLocked(match.matchId);
      }
    }
  }

  private async maybeContinueAfterResolve(match: MatchState): Promise<void> {
    if (match.status === 'completed' || match.winnerId != null) return;

    const survivors = [...match.players.values()].filter(
      (p) => p.status === 'active',
    );
    if (survivors.length >= 2) {
      await this.enterRoundResult(match);
    }
  }

  private async enterRoundResult(match: MatchState): Promise<void> {
    const lastChallenge = match.currentChallenge;
    if (!lastChallenge) {
      // Use lastRoundResult if already set
      if (match.lastRoundResult) {
        this.schedulePhaseTimer(match.matchId, ROUND_RESULT_MS);
        return;
      }
      return;
    }

    const result = this.engine.beginRoundResult(
      match,
      lastChallenge.resolutions,
      lastChallenge.challengeInstanceId,
      ROUND_RESULT_MS,
    );
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.schedulePhaseTimer(match.matchId, ROUND_RESULT_MS);
  }

  private scheduleSignalActivation(matchId: string, delayMs: number): void {
    if (this.nodeEnv === 'test') return;
    const existing = this.timers.get(`${matchId}:signal`);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(`${matchId}:signal`);
    }
    const timer = setTimeout(
      () => {
        void this.enqueue(matchId, async () => {
          const match = await this.requireMatch(matchId);
          const result = this.engine.activateSignal(match);
          if (result.events.length > 0) {
            await this.store.save(result.match);
            this.emit(result.match, result.events);
            this.scheduleBotSubmissions(result.match);
            return;
          }
          // Wall timer can fire before mono reaches signalAtMonoMs — reschedule.
          const challenge = match.currentChallenge;
          if (
            match.status === 'challenge_active' &&
            challenge &&
            challenge.status === 'active' &&
            challenge.roundPhase === 'waiting_signal' &&
            challenge.signalAtMonoMs != null &&
            this.clock.monoMs() < challenge.signalAtMonoMs
          ) {
            const remaining = challenge.signalAtMonoMs - this.clock.monoMs();
            this.scheduleSignalActivation(matchId, Math.max(1, remaining));
          }
        }).catch((error: unknown) => {
          this.logger.error({
            event: 'signal_activation_failed',
            matchId,
            category: error instanceof Error ? error.name : 'UnknownError',
          });
        });
      },
      Math.max(1, delayMs),
    );
    timer.unref?.();
    this.timers.set(`${matchId}:signal`, timer);
  }

  private scheduleBotSubmissions(match: MatchState): void {
    if (!match.currentChallenge) return;
    const challenge = match.currentChallenge;
    const botPlayers = [...match.players.values()].filter(
      (p) =>
        p.isBot && p.status === 'active' && !p.submittedForCurrentChallenge,
    );
    if (botPlayers.length === 0) return;

    // Bots always submit wrong token (bot-miss) — they fail evaluation
    const submitBots = async () => {
      for (const bot of botPlayers) {
        try {
          await this.submitAnswer({
            matchId: match.matchId,
            playerId: bot.playerId,
            challengeInstanceId: challenge.challengeInstanceId,
            commandId: randomUUID(),
            answer: { signalToken: 'bot-miss' },
          });
        } catch {
          // Bot submission may fail if challenge resolved; ignore
        }
      }
    };

    if (this.nodeEnv === 'test') {
      // In test mode, submit synchronously through enqueue
      void submitBots();
    } else {
      const timer = setTimeout(
        () => {
          void submitBots();
        },
        100 + Math.random() * 200,
      );
      timer.unref?.();
      this.timers.set(`${match.matchId}:bots`, timer);
    }
  }

  private schedulePhaseTimer(matchId: string, durationMs: number): void {
    this.clearTimer(matchId);
    if (this.nodeEnv === 'test') return;
    // Wall timers can fire slightly before mono reaches phaseDeadlineMonoMs.
    // Reschedule when advance is not yet due so lobby/intro/result cannot stall.
    const delayMs = Math.max(1, durationMs);
    const timer = setTimeout(() => {
      void this.tickDue(matchId)
        .then(async () => {
          const match = await this.store.get(matchId);
          if (!match || match.phaseDeadlineMonoMs == null) {
            return;
          }
          if (
            (match.phase === 'ready_countdown' ||
              match.phase === 'challenge_intro' ||
              match.phase === 'round_result') &&
            this.clock.monoMs() < match.phaseDeadlineMonoMs
          ) {
            const remaining = match.phaseDeadlineMonoMs - this.clock.monoMs();
            this.schedulePhaseTimer(matchId, Math.max(1, remaining));
          }
        })
        .catch((error: unknown) => {
          this.logger.error({
            event: 'phase_advance_failed',
            matchId,
            category: error instanceof Error ? error.name : 'UnknownError',
          });
        });
    }, delayMs);
    timer.unref?.();
    this.timers.set(matchId, timer);
  }

  private scheduleTimeout(matchId: string, durationMs: number): void {
    this.clearTimer(matchId);
    if (this.nodeEnv === 'test') return;
    // Inclusive deadline boundary: accept at equality; timeout only when
    // monoMs > deadline. Schedule durationMs+1 so the first fire is past
    // equality; forceTimeout still reschedules if mono has not advanced.
    const delayMs = Math.max(1, durationMs + 1);
    const timer = setTimeout(() => {
      void this.forceTimeout(matchId).catch((error: unknown) => {
        this.logger.error({
          event: 'match_timeout_failed',
          matchId,
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, delayMs);
    timer.unref?.();
    this.timers.set(matchId, timer);
  }

  private clearTimer(matchId: string): void {
    const timer = this.timers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(matchId);
    }
  }

  private emit(match: MatchState, events: DomainEvent[]): void {
    if (events.length === 0) {
      return;
    }
    const broadcast: MatchBroadcast = {
      matchId: match.matchId,
      events,
      snapshot: this.engine.toPublicSnapshot(match),
    };
    for (const listener of this.listeners) {
      listener(broadcast);
    }
  }

  private async requireMatch(matchId: string): Promise<MatchState> {
    const match = await this.store.get(matchId);
    if (!match) {
      throw new DomainError('MATCH_NOT_FOUND', 'match not found');
    }
    return match;
  }

  private enqueue<T>(matchId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(matchId) ?? Promise.resolve();
    const run = previous.then(
      () => task(),
      () => task(),
    );
    this.queues.set(
      matchId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }
}
