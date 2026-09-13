import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/env.validation';
import {
  BOOTSTRAP_PINS,
  ReleaseResolverService,
} from '../../content/services/release-resolver.service';
import { EmergencyControlsService } from '../../content/services/emergency-controls.service';
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
import { createLaunchEvaluators } from '../domain/engines/launch-evaluators';
import { createAdvancedEvaluators } from '../domain/engines/advanced-evaluators';
import type {
  ChallengeDefinition,
  Clock,
  CreateMatchOptions,
  DomainEvent,
  MatchMode,
  MatchState,
} from '../domain/types';
import {
  DomainError,
  MATCH_PLAYER_CAPACITY,
  MIN_LIVE_MATCH_PLAYERS,
  QUICK_LOBBY_FILL_EXTEND_MS,
  QUICK_LOBBY_FILL_MAX_REMAINING_MS,
  QUICK_LOBBY_FILL_WAIT_MS,
  SystemClock,
} from '../domain/types';
import { InMemoryMatchStore, type MatchStore } from '../store/match.store';
import { ResumeTokenService } from './resume-token.service';
import { DevFixtureProvider } from '../challenges/dev-fixture.provider';
import type { ChallengeDefinitionProvider } from '../challenges/challenge-definition.provider';
import { RoomCodeRegistry } from './room-code.registry';

const READY_COUNTDOWN_MS = 3000;
const ROUND_RESULT_MS = 2500;
const RESUME_ACK_PREFIX = 'match.resume:';
const REMATCH_WINDOW_MS = 60_000;

export type PlayerIdentityInput = {
  displayName: string;
  avatarColor: string;
};

export type SeatCredentials = {
  matchId: string;
  playerId: string;
  resumeToken: string;
  snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  roomCode?: string | null;
  /** When set, gateway/matchmaking should (re)arm the open-lobby fill timer. */
  lobbyFillWaitMs?: number;
};

type RematchParty = {
  newMatchId: string;
  mode: MatchMode;
  roomCode: string | null;
  hostPlayerId: string | null;
  expiresAtMs: number;
};
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
export class MatchService implements OnModuleDestroy, OnModuleInit {
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
  private readonly roomCodes: RoomCodeRegistry;
  /** Source matchId → rematch party (party join window). */
  private readonly rematchParties = new Map<string, RematchParty>();
  private botFillEnabled: boolean;
  private botFillWaitMs: number;
  private matchmakingPaused = false;
  /** Test-only barriers after match mutation, before identity ops return. */
  private identityBarrierHooks: {
    afterJoinMutated?: () => Promise<void>;
    afterResumeMutated?: () => Promise<void>;
    beforeFinalizeJoin?: (playerId: string) => Promise<void>;
    afterFinalizeJoin?: (playerId: string) => Promise<void>;
  } = {};

  constructor(
    config: ConfigService<AppConfig, true>,
    @Optional()
    @Inject(ReleaseResolverService)
    private readonly releases: ReleaseResolverService | null = null,
    @Optional()
    @Inject(EmergencyControlsService)
    private readonly emergency: EmergencyControlsService | null = null,
  ) {
    this.nodeEnv = config.get('NODE_ENV', { infer: true });
    this.store = new InMemoryMatchStore();
    this.tokens = new ResumeTokenService();
    this.registry = new ChallengeEvaluatorRegistryImpl();
    // wait_for_signal is a real engine — register always
    this.registry.register(new WaitForSignalEvaluator());
    for (const evaluator of createLaunchEvaluators()) {
      this.registry.register(evaluator);
    }
    for (const evaluator of createAdvancedEvaluators()) {
      this.registry.register(evaluator);
    }
    if (this.nodeEnv !== 'production') {
      this.registry.register(new DevDeterministicChoiceEvaluator());
    }
    this.clock = new SystemClock();
    this.engine = new MatchEngine(this.clock, this.registry);
    this.challengeProvider = new DevFixtureProvider();
    this.roomCodes = new RoomCodeRegistry();
    this.botFillEnabled = config.get('MATCHMAKING_BOT_FILL_ENABLED', {
      infer: true,
    });
    this.botFillWaitMs = config.get('MATCHMAKING_BOT_FILL_WAIT_MS', {
      infer: true,
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.emergency) {
      return;
    }
    try {
      const controls = await this.emergency.getControls();
      this.botFillEnabled = controls.botFillEnabled;
      this.botFillWaitMs = controls.botFillWaitMs;
      this.matchmakingPaused = controls.matchmakingPaused;
    } catch (error) {
      this.logger.warn({
        event: 'emergency_controls_load_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  static forTests(options: {
    clock: Clock;
    nodeEnv?: AppConfig['NODE_ENV'];
    botFillEnabled?: boolean;
    botFillWaitMs?: number;
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
      roomCodes: new RoomCodeRegistry(),
      rematchParties: new Map(),
      botFillEnabled: options.botFillEnabled ?? false,
      botFillWaitMs: options.botFillWaitMs ?? 15_000,
      matchmakingPaused: false,
      releases: null,
      emergency: null,
      identityBarrierHooks: {},
    });
    // wait_for_signal always registered
    service['registry'].register(new WaitForSignalEvaluator());
    for (const evaluator of createLaunchEvaluators()) {
      service['registry'].register(evaluator);
    }
    for (const evaluator of createAdvancedEvaluators()) {
      service['registry'].register(evaluator);
    }
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
    const match = await this.createPinnedMatch({ mode: 'dev' });
    return {
      matchId: match.matchId,
      snapshot: this.engine.toPublicSnapshot(match),
    };
  }

  async joinMatch(
    matchId: string,
    identity?: PlayerIdentityInput,
    progress?: { hearts: number; energy: number },
  ): Promise<{
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
        displayName: identity?.displayName,
        avatarColor: identity?.avatarColor,
        hearts: progress?.hearts,
        energy: progress?.energy,
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
      if (this.engine.canStartReadyCountdown(current)) {
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
      try {
        const removed = this.engine.removeLobbyPlayer(match, playerId);
        if (removed.removed) {
          this.clearTimer(matchId);
          const next = removed.match;
          if (
            next.mode === 'quick_survival' &&
            next.phase === 'lobby' &&
            next.players.size > 0 &&
            next.players.size < next.playerCapacity
          ) {
            this.armLobbyFillWait(next, QUICK_LOBBY_FILL_WAIT_MS);
            this.ensureQuickHost(next);
          }
          await this.store.save(next);
          if (removed.events.length > 0) {
            this.emit(next, removed.events);
          }
          if (next.players.size === 0) {
            this.roomCodes.unregisterMatch(matchId);
            await this.store.delete(matchId);
          }
          return;
        }
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'NOT_LOBBY') {
          throw error;
        }
        // Past lobby — fall through to disconnected presence.
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
        await this.publishResolveAndMaybeRoundResult(
          result.match,
          result.events,
        );
        await this.maybeContinue(await this.requireMatch(input.matchId));
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

  async usePower(input: {
    matchId: string;
    playerId: string;
    powerId: 'danger_pulse';
    targetPlayerId: string;
  }): Promise<{ snapshot: ReturnType<MatchEngine['toPublicSnapshot']> }> {
    return this.enqueue(input.matchId, async () => {
      const match = await this.requireMatch(input.matchId);
      const disabled =
        (await this.emergency?.areOffensivePowersDisabled()) === true;
      const result = this.engine.useDangerPulse(match, {
        attackerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        offensivePowersDisabled: disabled,
      });
      await this.store.save(result.match);
      this.emit(result.match, result.events);
      this.logger.log(
        JSON.stringify({
          analytics: 'power.used',
          matchId: input.matchId,
          powerId: 'danger_pulse',
          phase: result.match.phase,
          offensiveDisabled: disabled,
        }),
      );
      if (result.match.phase === 'power_defense' && result.match.pendingAttack) {
        const windowMs =
          result.match.pendingAttack.defenseDeadlineAtMs - this.clock.nowMs();
        this.schedulePhaseTimer(input.matchId, Math.max(1, windowMs));
      }
      return { snapshot: this.engine.toPublicSnapshot(result.match) };
    });
  }

  async defendPower(input: {
    matchId: string;
    playerId: string;
    attackId: string;
    choice: 'none' | 'shield' | 'reflect';
  }): Promise<{ snapshot: ReturnType<MatchEngine['toPublicSnapshot']> }> {
    return this.enqueue(input.matchId, async () => {
      const match = await this.requireMatch(input.matchId);
      const result = this.engine.defendPowerAttack(match, {
        defenderId: input.playerId,
        attackId: input.attackId,
        choice: input.choice,
      });
      await this.store.save(result.match);
      this.emit(result.match, result.events);
      this.logger.log(
        JSON.stringify({
          analytics: 'power.defense',
          matchId: input.matchId,
          choice: input.choice,
          phase: result.match.phase,
        }),
      );
      if (result.match.phase === 'power_defense' && result.match.pendingAttack) {
        const windowMs =
          result.match.pendingAttack.defenseDeadlineAtMs - this.clock.nowMs();
        this.schedulePhaseTimer(input.matchId, Math.max(1, windowMs));
      } else if (result.match.phase === 'round_result') {
        await this.startNextChallengeAfterPowers(input.matchId, result.match);
      }
      const latest = await this.requireMatch(input.matchId);
      return { snapshot: this.engine.toPublicSnapshot(latest) };
    });
  }

  async skipPower(input: {
    matchId: string;
    playerId: string;
  }): Promise<{ snapshot: ReturnType<MatchEngine['toPublicSnapshot']> }> {
    return this.enqueue(input.matchId, async () => {
      const match = await this.requireMatch(input.matchId);
      const result = this.engine.skipPowerAction(match, input.playerId);
      await this.store.save(result.match);
      this.emit(result.match, result.events);
      this.logger.log(
        JSON.stringify({
          analytics: 'power.skipped',
          matchId: input.matchId,
          phase: result.match.phase,
        }),
      );
      if (
        result.match.phase === 'round_result' ||
        result.match.powerActionActorIds.length === 0
      ) {
        await this.startNextChallengeAfterPowers(input.matchId, result.match);
      }
      const latest = await this.requireMatch(input.matchId);
      return { snapshot: this.engine.toPublicSnapshot(latest) };
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
    return this.fillBotsInternal(matchId, { requireDevOnly: true });
  }

  /**
   * Fill remaining lobby seats with bots. Used by create_dev and by
   * matchmaking bot-fill policy when enabled.
   */
  async fillBots(
    matchId: string,
    options?: { allowWhenPolicyEnabled?: boolean },
  ): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    botIds: string[];
  }> {
    if (this.nodeEnv === 'production' && !options?.allowWhenPolicyEnabled) {
      throw new DomainError(
        'DEV_ONLY_FORBIDDEN',
        'bot fill forbidden in production',
      );
    }
    if (
      this.nodeEnv === 'production' &&
      options?.allowWhenPolicyEnabled &&
      !this.botFillEnabled
    ) {
      throw new DomainError(
        'DEV_ONLY_FORBIDDEN',
        'bot fill policy disabled',
      );
    }
    return this.fillBotsInternal(matchId, {
      requireDevOnly: this.nodeEnv === 'production',
    });
  }

  getBotFillPolicy(): { enabled: boolean; waitMs: number } {
    return { enabled: this.botFillEnabled, waitMs: this.botFillWaitMs };
  }

  setBotFillPolicy(policy: { enabled?: boolean; waitMs?: number }): void {
    if (policy.enabled !== undefined) {
      this.botFillEnabled = policy.enabled;
    }
    if (policy.waitMs !== undefined) {
      this.botFillWaitMs = policy.waitMs;
    }
  }

  isMatchmakingPaused(): boolean {
    return this.matchmakingPaused;
  }

  setMatchmakingPaused(paused: boolean): void {
    this.matchmakingPaused = paused;
  }

  /**
   * Refresh in-memory emergency flags from durable controls (after admin patch).
   */
  async refreshEmergencyControlsFromStore(): Promise<void> {
    if (!this.emergency) {
      return;
    }
    const controls = await this.emergency.getControls();
    this.botFillEnabled = controls.botFillEnabled;
    this.botFillWaitMs = controls.botFillWaitMs;
    this.matchmakingPaused = controls.matchmakingPaused;
  }

  /**
   * Resolve current releases once, attach pins + playlist, persist match_pins.
   */
  private async createPinnedMatch(
    options: CreateMatchOptions,
  ): Promise<MatchState> {
    let releasePins = options.releasePins ?? { ...BOOTSTRAP_PINS };
    let pinnedPlaylist =
      options.pinnedPlaylist != null
        ? [...options.pinnedPlaylist]
        : [...this.challengeProvider.getPlaylist()];

    if (this.releases) {
      try {
        releasePins = await this.releases.resolveCurrentPins();
        pinnedPlaylist = await this.releases.getPlaylistForCatalogRelease(
          releasePins.challengeCatalogReleaseId,
          { mode: options.mode },
        );
      } catch (error) {
        this.logger.warn({
          event: 'release_pin_resolve_failed',
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    let powerConfig = options.powerConfig ?? undefined;
    if (this.releases && !powerConfig) {
      try {
        const payload = await this.releases.getPowerConfigurationForRelease(
          releasePins.powerConfigurationReleaseId,
        );
        powerConfig = {
          releaseId: payload.releaseId,
          versionLabel: payload.versionLabel,
          energyThreshold: 4,
          inventoryMaxTotal: 3,
          inventoryMaxPerPower: 1,
          actionWindowMs: payload.actionWindowMs,
          defenseWindowMs: payload.defenseWindowMs,
          powers: payload.powers.map((p) => ({
            powerId: p.powerId,
            enabled: p.enabled,
            grantWeight: p.grantWeight,
            eligibleModes: [...p.eligibleModes],
            nameKey: p.nameKey,
            explanationKey: p.explanationKey,
            assetIds: [...p.assetIds],
          })),
        };
      } catch (error) {
        this.logger.warn({
          event: 'power_config_resolve_failed',
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    const match = this.engine.createMatch(undefined, {
      ...options,
      releasePins,
      pinnedPlaylist,
      powerConfig: powerConfig ?? null,
    });
    await this.store.save(match);
    if (this.releases) {
      try {
        await this.releases.persistMatchPins(match.matchId, releasePins);
      } catch (error) {
        this.logger.warn({
          event: 'match_pins_persist_failed',
          matchId: match.matchId,
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
    return match;
  }

  private async fillBotsInternal(
    matchId: string,
    _options: { requireDevOnly: boolean },
  ): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    botIds: string[];
  }> {
    return this.enqueue(matchId, async () => {
      let match = await this.requireMatch(matchId);
      if (match.status !== 'waiting' || match.phase !== 'lobby') {
        throw new DomainError(
          'MATCH_NOT_JOINABLE',
          'can only fill bots in lobby',
        );
      }
      const botIds: string[] = [];
      while (match.players.size < match.playerCapacity) {
        const botId = `bot-${randomUUID().slice(0, 8)}`;
        const botHash = `bot-hash-${botId}`;
        const result = this.engine.joinPlayer(match, {
          playerId: botId,
          resumeTokenHash: botHash,
          isBot: true,
          displayName: `Bot ${botIds.length + 1}`,
          avatarColor: '#6B7280',
        });
        match = result.match;
        botIds.push(botId);
        this.emit(match, result.events);
      }
      await this.store.save(match);

      if (this.engine.canStartReadyCountdown(match)) {
        await this.beginReadyCountdownLocked(match.matchId);
      }

      const latest = await this.requireMatch(matchId);
      return {
        snapshot: this.engine.toPublicSnapshot(latest),
        botIds,
      };
    });
  }

  /**
   * True while the match is still pre-challenge (lobby / ready_countdown).
   * Used by the gateway so a disconnect frees the seat instead of leaving a
   * ghost "disconnected" row that blocks open-lobby packing.
   */
  async canLeaveLobbySeat(matchId: string): Promise<boolean> {
    const match = await this.store.get(matchId);
    if (!match) {
      return false;
    }
    // Only Quick Survival open lobbies free seats on disconnect. Dev / private /
    // training keep markDisconnected so resume tokens remain valid in lobby.
    return (
      match.mode === 'quick_survival' &&
      match.status === 'waiting' &&
      (match.phase === 'lobby' || match.phase === 'ready_countdown')
    );
  }

  async leaveMatch(
    matchId: string,
    playerId: string,
  ): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']> | null;
    left: boolean;
    emptied: boolean;
    /** When set, matchmaking should (re)arm the open-lobby fill timer. */
    lobbyFillWaitMs?: number;
  }> {
    return this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      const removed = this.engine.removeLobbyPlayer(match, playerId);
      if (!removed.removed) {
        return {
          snapshot: this.engine.toPublicSnapshot(match),
          left: false,
          emptied: false,
        };
      }
      this.clearTimer(matchId);

      const next = removed.match;
      let lobbyFillWaitMs: number | undefined;
      // Vacating a seat before start re-opens the quick lobby for joins and
      // refreshes the fill wait so remaining players are not sealed forever.
      if (
        next.mode === 'quick_survival' &&
        next.phase === 'lobby' &&
        next.players.size > 0 &&
        next.players.size < next.playerCapacity
      ) {
        this.armLobbyFillWait(next, QUICK_LOBBY_FILL_WAIT_MS);
        lobbyFillWaitMs = QUICK_LOBBY_FILL_WAIT_MS;
      }
      if (next.players.size > 0) {
        this.ensureQuickHost(next, playerId);
      }

      await this.store.save(next);
      if (removed.events.length > 0) {
        this.emit(next, removed.events);
      }
      const emptied = next.players.size === 0;
      if (emptied) {
        this.roomCodes.unregisterMatch(matchId);
        await this.store.delete(matchId);
      }
      return {
        snapshot: this.engine.toPublicSnapshot(next),
        left: true,
        emptied,
        lobbyFillWaitMs,
      };
    });
  }

  async setReady(
    matchId: string,
    playerId: string,
  ): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    countdownStarted: boolean;
  }> {
    return this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      const result = this.engine.setPlayerReady(match, playerId);
      if (result.changed) {
        await this.store.save(result.match);
        if (result.events.length > 0) {
          this.emit(result.match, result.events);
        }
      }
      let countdownStarted = false;
      const current = result.match;
      if (this.engine.canStartReadyCountdown(current)) {
        const beforePhase = current.phase;
        await this.beginReadyCountdownLocked(matchId);
        const after = await this.store.get(matchId);
        countdownStarted =
          beforePhase === 'lobby' && after?.phase === 'ready_countdown';
      }
      const latest = await this.requireMatch(matchId);
      return {
        snapshot: this.engine.toPublicSnapshot(latest),
        countdownStarted,
      };
    });
  }

  async createPrivateRoom(identity: PlayerIdentityInput): Promise<
    SeatCredentials & { roomCode: string }
  > {
    const now = this.clock.nowMs();
    const roomCode = this.roomCodes.generate(now);
    const match = await this.createPinnedMatch({
      mode: 'private',
      roomCode,
      playerCapacity: MATCH_PLAYER_CAPACITY,
    });
    this.roomCodes.register(roomCode, match.matchId, now);

    const seated = await this.joinMatch(match.matchId, identity);
    // Host is the first seated player.
    await this.enqueue(match.matchId, async () => {
      const current = await this.requireMatch(match.matchId);
      if (current.hostPlayerId == null) {
        const next = this.engine.setHostPlayerId(current, seated.playerId);
        await this.store.save(next);
      }
    });
    const snap = await this.requestSnapshot(match.matchId);
    return {
      matchId: match.matchId,
      roomCode,
      playerId: seated.playerId,
      resumeToken: seated.resumeToken,
      snapshot: snap.snapshot,
    };
  }

  async joinPrivateRoom(
    input: PlayerIdentityInput & { roomCode: string },
  ): Promise<SeatCredentials & { roomCode: string }> {
    const now = this.clock.nowMs();
    const matchId = this.roomCodes.lookup(input.roomCode, now);
    if (!matchId) {
      throw new DomainError('ROOM_CODE_INVALID', 'room code not found');
    }
    const match = await this.store.get(matchId);
    if (!match || match.mode !== 'private') {
      throw new DomainError('ROOM_CODE_EXPIRED', 'room code expired');
    }
    if (match.status !== 'waiting' || match.phase !== 'lobby') {
      throw new DomainError('ROOM_CODE_EXPIRED', 'room no longer joinable');
    }
    if (match.players.size >= match.playerCapacity) {
      throw new DomainError('ROOM_FULL', 'room is full');
    }
    try {
      const seated = await this.joinMatch(matchId, {
        displayName: input.displayName,
        avatarColor: input.avatarColor,
      });
      return {
        matchId,
        roomCode: match.roomCode ?? this.roomCodes.normalize(input.roomCode),
        playerId: seated.playerId,
        resumeToken: seated.resumeToken,
        snapshot: seated.snapshot,
      };
    } catch (error) {
      if (error instanceof DomainError && error.code === 'MATCH_FULL') {
        throw new DomainError('ROOM_FULL', 'room is full');
      }
      throw error;
    }
  }

  /**
   * Training: capacity-1 wait-for-state match. After gateway finalizeJoin,
   * countdown starts immediately and advances into the challenge path.
   */
  async startTraining(
    identity: PlayerIdentityInput,
    progress?: { hearts: number; energy: number },
  ): Promise<SeatCredentials> {
    const match = await this.createPinnedMatch({
      mode: 'training',
      playerCapacity: 1,
    });
    const seated = await this.joinMatch(match.matchId, identity, progress);
    return {
      matchId: match.matchId,
      playerId: seated.playerId,
      resumeToken: seated.resumeToken,
      snapshot: seated.snapshot,
    };
  }

  /**
   * Retry training after completed/halted/round_result.
   * Mid-run (hearts still > 0): carry remaining hearts/energy into the new seat.
   * Full wipe (0 hearts): fresh restart at INITIAL_HEARTS.
   */
  async retryTraining(
    matchId: string,
    playerId: string,
  ): Promise<SeatCredentials> {
    const match = await this.requireMatch(matchId);
    if (match.mode !== 'training') {
      throw new DomainError('TRAINING_UNAVAILABLE', 'not a training match');
    }
    const player = match.players.get(playerId);
    if (!player) {
      throw new DomainError('NOT_IN_MATCH', 'player not in match');
    }
    if (
      match.phase !== 'completed' &&
      match.phase !== 'halted' &&
      match.phase !== 'round_result'
    ) {
      throw new DomainError(
        'TRAINING_UNAVAILABLE',
        'training retry only after result',
      );
    }
    const identity: PlayerIdentityInput = {
      displayName: player.displayName ?? 'Trainee',
      avatarColor: player.avatarColor ?? '#94A3B8',
    };
    const progress =
      player.hearts > 0
        ? { hearts: player.hearts, energy: player.energy }
        : undefined;
    return this.startTraining(identity, progress);
  }

  /**
   * Rematch behavior:
   * - Allowed when the source match is completed or halted.
   * - First caller opens a new lobby of the same mode and becomes host.
   * - Later callers from the same source match (within REMATCH_WINDOW_MS) join
   *   that rematch lobby instead of creating another room.
   * - Private: room code is preserved on the rematch lobby when possible.
   */
  async rematch(
    matchId: string,
    playerId: string,
  ): Promise<SeatCredentials> {
    const source = await this.requireMatch(matchId);
    if (
      source.phase !== 'completed' &&
      source.phase !== 'halted' &&
      source.phase !== 'draw'
    ) {
      throw new DomainError('REMATCH_UNAVAILABLE', 'match not finished');
    }
    const player = source.players.get(playerId);
    if (!player) {
      throw new DomainError('NOT_IN_MATCH', 'player not in match');
    }
    const identity: PlayerIdentityInput = {
      displayName: player.displayName ?? 'Player',
      avatarColor: player.avatarColor ?? '#94A3B8',
    };
    const now = this.clock.nowMs();
    const existing = this.rematchParties.get(matchId);
    if (
      existing &&
      existing.expiresAtMs > now &&
      existing.mode === source.mode
    ) {
      const partyMatch = await this.store.get(existing.newMatchId);
      if (
        partyMatch &&
        partyMatch.status === 'waiting' &&
        partyMatch.phase === 'lobby' &&
        partyMatch.players.size < partyMatch.playerCapacity
      ) {
        const seated = await this.joinMatch(existing.newMatchId, identity);
        // Heal rematch lobbies that never armed a fill wait (pre-fix state).
        let lobbyFillWaitMs: number | undefined;
        if (partyMatch.mode === 'quick_survival') {
          lobbyFillWaitMs = await this.enqueue(
            existing.newMatchId,
            async () => {
              const current = await this.requireMatch(existing.newMatchId);
              if (
                current.phase !== 'lobby' ||
                current.players.size < MIN_LIVE_MATCH_PLAYERS ||
                current.players.size >= current.playerCapacity
              ) {
                return undefined;
              }
              if (
                current.lobbyFillDeadlineMonoMs != null &&
                this.clock.monoMs() < current.lobbyFillDeadlineMonoMs
              ) {
                return Math.max(
                  1,
                  current.lobbyFillDeadlineMonoMs - this.clock.monoMs(),
                );
              }
              this.armLobbyFillWait(current, QUICK_LOBBY_FILL_WAIT_MS);
              await this.store.save(current);
              return QUICK_LOBBY_FILL_WAIT_MS;
            },
          );
        }
        const snap = await this.requestSnapshot(existing.newMatchId);
        return {
          matchId: existing.newMatchId,
          playerId: seated.playerId,
          resumeToken: seated.resumeToken,
          snapshot: snap.snapshot,
          roomCode: partyMatch.roomCode,
          lobbyFillWaitMs,
        };
      }
    }

    const roomCode =
      source.mode === 'private' && source.roomCode
        ? source.roomCode
        : source.mode === 'private'
          ? this.roomCodes.generate(now)
          : null;

    const next = await this.createPinnedMatch({
      mode: source.mode,
      playerCapacity: source.playerCapacity,
      roomCode,
      hostPlayerId: null,
    });
    if (roomCode) {
      this.roomCodes.register(roomCode, next.matchId, now);
    }

    const seated = await this.joinMatch(next.matchId, identity);
    // First rematch clicker is always the new host. Quick rematch also needs
    // the same open-lobby fill deadline as matchmaking — otherwise Start now
    // never appears (mobile gates that chrome on lobbyFillDeadlineAtMs).
    let lobbyFillWaitMs: number | undefined;
    await this.enqueue(next.matchId, async () => {
      const current = await this.requireMatch(next.matchId);
      let updated = this.engine.setHostPlayerId(current, seated.playerId);
      if (updated.mode === 'quick_survival') {
        this.armLobbyFillWait(updated, QUICK_LOBBY_FILL_WAIT_MS);
        lobbyFillWaitMs = QUICK_LOBBY_FILL_WAIT_MS;
      }
      await this.store.save(updated);
    });

    this.rematchParties.set(matchId, {
      newMatchId: next.matchId,
      mode: source.mode,
      roomCode,
      hostPlayerId: seated.playerId,
      expiresAtMs: now + REMATCH_WINDOW_MS,
    });

    const snap = await this.requestSnapshot(next.matchId);
    return {
      matchId: next.matchId,
      playerId: seated.playerId,
      resumeToken: seated.resumeToken,
      snapshot: snap.snapshot,
      roomCode,
      lobbyFillWaitMs,
    };
  }

  /**
   * Create a quick_survival match and seat the given identities (matchmaking).
   * Returns per-player credentials in input order.
   */
  async createQuickSurvivalMatch(
    seats: Array<PlayerIdentityInput & { playerId?: string }>,
  ): Promise<{
    matchId: string;
    assignments: Array<{
      playerId: string;
      resumeToken: string;
      displayName: string;
    }>;
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    lobbyFillWaitMs: number;
  }> {
    if (seats.length === 0 || seats.length > MATCH_PLAYER_CAPACITY) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', 'invalid seat count');
    }
    const match = await this.createPinnedMatch({
      mode: 'quick_survival',
      playerCapacity: MATCH_PLAYER_CAPACITY,
    });
    const assignments: Array<{
      playerId: string;
      resumeToken: string;
      displayName: string;
    }> = [];
    for (const seat of seats) {
      const joined = await this.joinMatch(match.matchId, {
        displayName: seat.displayName,
        avatarColor: seat.avatarColor,
      });
      assignments.push({
        playerId: joined.playerId,
        resumeToken: joined.resumeToken,
        displayName: seat.displayName,
      });
    }
    // Arm open-lobby fill wait (partial start or solo abort when due).
    const withDeadline = await this.requireMatch(match.matchId);
    this.armLobbyFillWait(withDeadline, QUICK_LOBBY_FILL_WAIT_MS);
    // First seated player is the open-lobby host (extend fill wait).
    const firstHostId = assignments[0]?.playerId;
    if (firstHostId) {
      withDeadline.hostPlayerId = firstHostId;
    }
    await this.store.save(withDeadline);
    return {
      matchId: match.matchId,
      assignments,
      snapshot: this.engine.toPublicSnapshot(withDeadline),
      lobbyFillWaitMs: QUICK_LOBBY_FILL_WAIT_MS,
    };
  }

  /**
   * Host extends the open-lobby fill wait (+30s, capped at 120s remaining).
   * Allowed only for quick_survival lobby with 2–5 seated players.
   */
  async extendLobbyFill(
    matchId: string,
    playerId: string,
  ): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
    lobbyFillWaitMs: number;
  }> {
    return this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      if (match.mode !== 'quick_survival') {
        throw new DomainError('NOT_LOBBY', 'extend only for quick survival');
      }
      if (match.status !== 'waiting' || match.phase !== 'lobby') {
        throw new DomainError('NOT_LOBBY', 'extend only while lobby is open');
      }
      if (match.hostPlayerId !== playerId) {
        throw new DomainError('NOT_HOST', 'only the lobby host can extend');
      }
      const size = match.players.size;
      if (size < MIN_LIVE_MATCH_PLAYERS || size >= match.playerCapacity) {
        throw new DomainError(
          'NOT_ENOUGH_PLAYERS',
          'extend requires a partial open lobby (2-5 players)',
        );
      }

      const nowMono = this.clock.monoMs();
      const remaining =
        match.lobbyFillDeadlineMonoMs != null
          ? Math.max(0, match.lobbyFillDeadlineMonoMs - nowMono)
          : 0;
      const nextRemaining = Math.min(
        QUICK_LOBBY_FILL_MAX_REMAINING_MS,
        remaining + QUICK_LOBBY_FILL_EXTEND_MS,
      );
      const result = this.engine.setLobbyFillDeadline(
        match,
        this.clock.nowMs() + nextRemaining,
        nowMono + nextRemaining,
      );
      await this.store.save(result.match);
      if (result.events.length > 0) {
        this.emit(result.match, result.events);
      }
      return {
        snapshot: this.engine.toPublicSnapshot(result.match),
        lobbyFillWaitMs: nextRemaining,
      };
    });
  }

  /**
   * Host starts the quick lobby immediately (≥ MIN_LIVE_MATCH_PLAYERS).
   * Skips remaining fill wait and enters ready countdown with a partial table.
   */
  async startLobbyNow(
    matchId: string,
    playerId: string,
  ): Promise<{
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  }> {
    return this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      if (match.mode !== 'quick_survival') {
        throw new DomainError('NOT_LOBBY', 'start only for quick survival');
      }
      if (match.status !== 'waiting' || match.phase !== 'lobby') {
        throw new DomainError('NOT_LOBBY', 'start only while lobby is open');
      }
      if (match.hostPlayerId !== playerId) {
        throw new DomainError('NOT_HOST', 'only the lobby host can start');
      }
      const size = match.players.size;
      if (size < MIN_LIVE_MATCH_PLAYERS) {
        throw new DomainError(
          'NOT_ENOUGH_PLAYERS',
          'start requires at least two players',
        );
      }

      let current = match;
      for (const seatedId of match.players.keys()) {
        const accepted = this.engine.acceptJoin(current, seatedId);
        current = accepted.match;
      }
      if (current !== match) {
        await this.store.save(current);
      }
      if (
        !this.engine.canStartReadyCountdown(current, {
          allowPartialFill: true,
        })
      ) {
        throw new DomainError(
          'NOT_ENOUGH_PLAYERS',
          'lobby cannot start ready countdown',
        );
      }
      await this.beginReadyCountdownLocked(matchId, {
        allowPartialFill: true,
      });
      const latest = await this.requireMatch(matchId);
      return {
        snapshot: this.engine.toPublicSnapshot(latest),
      };
    });
  }

  /**
   * Open quick_survival lobby with free seats (waiting + lobby, not full).
   * Prefers the fullest room so tables pack before opening another.
   *
   * Past fill deadline does NOT hide incomplete lobbies: resolveQuickLobbyFill
   * still starts (≥2) or aborts (solo) under the match lock, and concurrent
   * joins serialize on that same lock. Sealing here created a window where a
   * host still sitting in lobby was invisible, so the next enqueue opened a
   * second room.
   */
  async findOpenQuickSurvivalLobby(): Promise<string | null> {
    const ids = await this.store.listIds();
    let bestId: string | null = null;
    let bestSize = -1;
    for (const id of ids) {
      const match = await this.store.get(id);
      if (!match) continue;
      if (match.mode !== 'quick_survival') continue;
      if (match.status !== 'waiting' || match.phase !== 'lobby') continue;
      const size = match.players.size;
      if (size <= 0 || size >= match.playerCapacity) continue;
      if (size > bestSize) {
        bestSize = size;
        bestId = id;
      }
    }
    return bestId;
  }

  async getMatchPhase(
    matchId: string,
  ): Promise<{ exists: boolean; phase: MatchState['phase'] | null }> {
    const match = await this.store.get(matchId);
    if (!match) {
      return { exists: false, phase: null };
    }
    return { exists: true, phase: match.phase };
  }

  /**
   * When a quick_survival lobby fill wait elapses:
   * - ≥ MIN_LIVE_MATCH_PLAYERS → begin ready countdown (partial table OK)
   * - 1 player → abort (cannot play live alone)
   * - 0 → delete empty match
   */
  async resolveQuickLobbyFill(matchId: string): Promise<{
    outcome: 'started' | 'aborted_solo' | 'noop' | 'gone';
    playerIds: string[];
  }> {
    return this.enqueue(matchId, async () => {
      const match = await this.store.get(matchId);
      if (!match) {
        return { outcome: 'gone' as const, playerIds: [] };
      }
      if (
        match.mode !== 'quick_survival' ||
        match.status !== 'waiting' ||
        match.phase !== 'lobby'
      ) {
        return { outcome: 'noop' as const, playerIds: [] };
      }
      if (
        match.lobbyFillDeadlineMonoMs != null &&
        this.clock.monoMs() < match.lobbyFillDeadlineMonoMs
      ) {
        return { outcome: 'noop' as const, playerIds: [] };
      }

      const playerIds = [...match.players.keys()];
      const size = match.players.size;

      if (size >= MIN_LIVE_MATCH_PLAYERS) {
        // Accept any reserved seats still awaiting socket finalize so a live
        // table can start when the fill wait elapses (ghost seats should already
        // have been abandoned).
        let current = match;
        for (const playerId of playerIds) {
          const accepted = this.engine.acceptJoin(current, playerId);
          current = accepted.match;
        }
        if (current !== match) {
          await this.store.save(current);
        }
        if (
          !this.engine.canStartReadyCountdown(current, {
            allowPartialFill: true,
          })
        ) {
          return { outcome: 'noop' as const, playerIds };
        }
        await this.beginReadyCountdownLocked(matchId, {
          allowPartialFill: true,
        });
        return { outcome: 'started' as const, playerIds };
      }

      this.clearTimer(matchId);
      this.roomCodes.unregisterMatch(matchId);
      await this.store.delete(matchId);
      return {
        outcome: size === 1 ? ('aborted_solo' as const) : ('gone' as const),
        playerIds,
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
        await this.publishResolveAndMaybeRoundResult(
          result.match,
          result.events,
        );
        await this.maybeContinue(await this.requireMatch(matchId));
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
        const windowMs =
          (match.currentChallenge?.definition.serverConfig[
            'signalWindowMs'
          ] as number) ?? 1000;
        this.scheduleSignalExpiry(matchId, windowMs);
      }
    }

    // Check for blue-window expiry (heart returns to red)
    if (
      match.currentChallenge &&
      match.currentChallenge.status === 'active' &&
      match.currentChallenge.roundPhase === 'signal_active' &&
      match.currentChallenge.signalEndsAtMonoMs != null &&
      this.clock.monoMs() > match.currentChallenge.signalEndsAtMonoMs
    ) {
      const expireResult = this.engine.expireSignal(match);
      if (expireResult.events.length > 0) {
        match = expireResult.match;
        await this.store.save(match);
        this.emit(match, expireResult.events);
      }
    }

    if (
      match.status === 'challenge_active' &&
      match.currentChallenge &&
      match.currentChallenge.status === 'active' &&
      match.currentChallenge.roundPhase === 'preview' &&
      match.currentChallenge.previewEndsAtMonoMs != null &&
      this.clock.monoMs() >= match.currentChallenge.previewEndsAtMonoMs
    ) {
      const previewResult = this.engine.advancePreview(match);
      if (previewResult.events.length > 0) {
        match = previewResult.match;
        await this.store.save(match);
        this.emit(match, previewResult.events);
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
        await this.publishResolveAndMaybeRoundResult(
          match,
          timeoutResult.events,
        );
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
      } else if (match.phase === 'power_action') {
        await this.advanceFromPowerAction(matchId);
      } else if (match.phase === 'power_defense') {
        await this.advanceFromPowerDefense(matchId);
      }
    }
  }

  /**
   * Safe read-only operational aggregates for admin dashboard/system status.
   * Never includes resume tokens, answers, submissions, or serverConfig.
   *
   * activeMatchCount excludes completed/halted. Player metrics are separate
   * fields (connection presence vs spectator status) — not mutually exclusive.
   */
  async getOperationalAggregates(): Promise<{
    activeMatchCount: number;
    matchesByPhase: {
      lobby: number;
      ready_countdown: number;
      challenge_intro: number;
      challenge_active: number;
      round_result: number;
      completed: number;
      halted: number;
    };
    connectedPlayers: number;
    disconnectedPlayers: number;
    spectators: number;
    waitingLobbyCount: number;
  }> {
    const matchesByPhase = {
      lobby: 0,
      ready_countdown: 0,
      challenge_intro: 0,
      challenge_active: 0,
      round_result: 0,
      completed: 0,
      halted: 0,
    };
    let connectedPlayers = 0;
    let disconnectedPlayers = 0;
    let spectators = 0;
    let waitingLobbyCount = 0;

    const ids = await this.store.listIds();
    for (const matchId of ids) {
      const match = await this.store.get(matchId);
      if (!match) {
        continue;
      }
      if (match.phase in matchesByPhase) {
        matchesByPhase[match.phase as keyof typeof matchesByPhase] += 1;
      }
      for (const player of match.players.values()) {
        if (player.status === 'spectator') {
          spectators += 1;
        }
        if (player.presence === 'connected') {
          connectedPlayers += 1;
        } else {
          disconnectedPlayers += 1;
        }
        if (match.phase === 'lobby' && player.status === 'active') {
          waitingLobbyCount += 1;
        }
      }
    }

    const activeMatchCount =
      matchesByPhase.lobby +
      matchesByPhase.ready_countdown +
      matchesByPhase.challenge_intro +
      matchesByPhase.challenge_active +
      matchesByPhase.round_result;

    return {
      activeMatchCount,
      matchesByPhase,
      connectedPlayers,
      disconnectedPlayers,
      spectators,
      waitingLobbyCount,
    };
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

  private async beginReadyCountdownLocked(
    matchId: string,
    options?: { allowPartialFill?: boolean },
  ): Promise<void> {
    const match = await this.requireMatch(matchId);
    if (!this.engine.canStartReadyCountdown(match, options)) {
      return;
    }
    const result = this.engine.beginReadyCountdown(
      match,
      READY_COUNTDOWN_MS,
      options,
    );
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.schedulePhaseTimer(matchId, READY_COUNTDOWN_MS);
  }

  private async advanceFromCountdown(matchId: string): Promise<void> {
    const match = await this.requireMatch(matchId);
    if (match.phase !== 'ready_countdown') return;
    // Room codes are lobby-only — drop once the match leaves the lobby.
    this.roomCodes.unregisterMatch(matchId);
    const definition = this.definitionForNextRound(match);
    if (!definition) {
      const finished = this.engine.completeByStandings(match);
      await this.store.save(finished.match);
      this.emit(finished.match, finished.events);
      return;
    }
    // Pin the next challenge then start it immediately — do not linger in
    // challenge_intro (that screen reveals the upcoming challenge type).
    const intro = this.engine.beginChallengeIntro(match, 0, definition, {
      deferSequenceBump: true,
    });
    const result = this.engine.startChallenge(intro.match);
    const started = result.match;
    await this.store.save(started);
    this.emit(started, result.events);
    this.armActiveChallengeTimers(started);
  }

  private async advanceFromIntro(matchId: string): Promise<void> {
    let match = await this.requireMatch(matchId);
    if (match.phase !== 'challenge_intro') return;
    const result = this.engine.startChallenge(match);
    match = result.match;
    await this.store.save(match);
    this.emit(match, result.events);
    this.armActiveChallengeTimers(match);
  }

  /** Signal + timeout timers for a freshly started challenge. */
  private armActiveChallengeTimers(match: MatchState): void {
    const matchId = match.matchId;
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
    // Training is capacity-1: stay on round_result until retry/leave.
    if (survivors.length < 2) return;

    // Between-round tactical window when anyone can fire Danger Pulse.
    const offered = this.engine.beginPowerAction(match);
    if (offered.events.length > 0) {
      await this.store.save(offered.match);
      this.emit(offered.match, offered.events);
      const windowMs =
        offered.match.powerConfig?.actionWindowMs ??
        offered.match.phaseDeadlineAtMs! - this.clock.nowMs();
      this.schedulePhaseTimer(matchId, Math.max(1, windowMs));
      return;
    }

    await this.startNextChallengeAfterPowers(matchId, offered.match);
  }

  private async advanceFromPowerAction(matchId: string): Promise<void> {
    let match = await this.requireMatch(matchId);
    if (match.phase !== 'power_action') return;
    const events: DomainEvent[] = [];
    for (const id of [...match.powerActionActorIds]) {
      const skipped = this.engine.skipPowerAction(match, id);
      match = skipped.match;
      events.push(...skipped.events);
    }
    await this.store.save(match);
    if (events.length > 0) {
      this.emit(match, events);
    }
    await this.startNextChallengeAfterPowers(matchId, match);
  }

  private async advanceFromPowerDefense(matchId: string): Promise<void> {
    const match = await this.requireMatch(matchId);
    if (match.phase !== 'power_defense') return;
    const expired = this.engine.expirePowerDefense(match);
    if (expired.events.length === 0) return;
    await this.store.save(expired.match);
    this.emit(expired.match, expired.events);
    if (expired.match.phase === 'round_result') {
      await this.startNextChallengeAfterPowers(matchId, expired.match);
    } else if (expired.match.phase === 'power_defense') {
      const windowMs =
        expired.match.pendingAttack!.defenseDeadlineAtMs - this.clock.nowMs();
      this.schedulePhaseTimer(matchId, Math.max(1, windowMs));
    }
  }

  private async startNextChallengeAfterPowers(
    _matchId: string,
    match: MatchState,
  ): Promise<void> {
    const cleared = this.engine.clearExpiredProtection(match);
    const definition = this.definitionForNextRound(cleared);
    if (!definition) {
      const finished = this.engine.completeByStandings(cleared);
      await this.store.save(finished.match);
      this.emit(finished.match, finished.events);
      return;
    }
    const intro = this.engine.beginChallengeIntro(cleared, 0, definition, {
      deferSequenceBump: true,
    });
    const result = this.engine.startChallenge(intro.match);
    await this.store.save(result.match);
    this.emit(result.match, result.events);
    this.armActiveChallengeTimers(result.match);
  }

  /**
   * Next playlist entry for this match. `roundNumber` is how many challenges
   * have already been introduced. The catalog is finite — do not cycle.
   */
  private definitionForNextRound(
    match: MatchState,
  ): ChallengeDefinition | null {
    const playlist =
      match.pinnedPlaylist.length > 0
        ? match.pinnedPlaylist
        : this.challengeProvider.getPlaylist();
    if (playlist.length === 0) {
      return null;
    }
    return playlist[match.roundNumber] ?? null;
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
    // Prefer publishResolveAndMaybeRoundResult at the emit site so clients never
    // observe the intermediate challenge_active + null-challenge snapshot.
    if (
      match.status === 'waiting' &&
      match.currentChallenge?.status === 'resolved'
    ) {
      const survivors = [...match.players.values()].filter(
        (p) => p.status === 'active',
      );
      if (survivors.length >= 2) {
        await this.enterRoundResult(match);
        return;
      }
      if (match.mode === 'training' && survivors.length <= 1) {
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
      } else if (match.mode === 'training' && survivors.length <= 1) {
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

  /**
   * Emit resolve events together with the round-result hold when applicable so
   * clients never apply an intermediate snapshot of challenge_active with a
   * null currentChallenge (that used to flash the lobby player list).
   */
  private async publishResolveAndMaybeRoundResult(
    match: MatchState,
    resolveEvents: DomainEvent[],
  ): Promise<void> {
    if (resolveEvents.length === 0) {
      return;
    }

    // Best-effort challenge attempt analytics write
    if (
      match.currentChallenge?.status === 'resolved' &&
      this.releases
    ) {
      const challenge = match.currentChallenge;
      for (const resolution of challenge.resolutions ?? []) {
        const player = match.players.get(resolution.playerId);
        if (!player || player.isBot) continue;
        void this.releases.writeChallengeAttempt({
          matchId: match.matchId,
          definitionId: challenge.definitionId,
          definitionVersion: challenge.definitionVersion,
          engineId: challenge.engineId,
          outcome: resolution.outcome === 'skipped_spectator' ? 'timeout' : resolution.outcome,
          heartDelta: resolution.heartsDelta,
          energyDelta: resolution.energyDelta,
          measureMs: resolution.measureMs,
          mode: match.mode,
          roundNumber: match.roundNumber,
        });
      }
    }

    if (
      match.status === 'completed' ||
      match.winnerId != null ||
      match.phase === 'halted' ||
      match.phase === 'draw' ||
      match.currentChallenge?.status !== 'resolved'
    ) {
      this.emit(match, resolveEvents);
      return;
    }

    const survivors = [...match.players.values()].filter(
      (p) => p.status === 'active',
    );
    const shouldHold =
      survivors.length >= 2 ||
      (match.mode === 'training' && survivors.length <= 1);
    if (!shouldHold) {
      this.emit(match, resolveEvents);
      return;
    }

    const lastChallenge = match.currentChallenge;
    const result = this.engine.beginRoundResult(
      match,
      lastChallenge.resolutions,
      lastChallenge.challengeInstanceId,
      ROUND_RESULT_MS,
    );
    await this.store.save(result.match);
    this.emit(result.match, [...resolveEvents, ...result.events]);
    this.schedulePhaseTimer(match.matchId, ROUND_RESULT_MS);
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
            const windowMs =
              (result.match.currentChallenge?.definition.serverConfig[
                'signalWindowMs'
              ] as number) ?? 1000;
            this.scheduleSignalExpiry(matchId, windowMs);
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

  private scheduleSignalExpiry(matchId: string, windowMs: number): void {
    if (this.nodeEnv === 'test') return;
    const key = `${matchId}:signal_end`;
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(key);
    }
    const timer = setTimeout(
      () => {
        void this.enqueue(matchId, async () => {
          const match = await this.requireMatch(matchId);
          const result = this.engine.expireSignal(match);
          if (result.events.length > 0) {
            await this.store.save(result.match);
            this.emit(result.match, result.events);
            return;
          }
          const challenge = match.currentChallenge;
          if (
            match.status === 'challenge_active' &&
            challenge &&
            challenge.status === 'active' &&
            challenge.roundPhase === 'signal_active' &&
            challenge.signalEndsAtMonoMs != null &&
            this.clock.monoMs() < challenge.signalEndsAtMonoMs
          ) {
            const remaining =
              challenge.signalEndsAtMonoMs - this.clock.monoMs();
            this.scheduleSignalExpiry(matchId, Math.max(1, remaining));
          }
        }).catch((error: unknown) => {
          this.logger.error({
            event: 'signal_expiry_failed',
            matchId,
            category: error instanceof Error ? error.name : 'UnknownError',
          });
        });
      },
      Math.max(1, windowMs),
    );
    timer.unref?.();
    this.timers.set(key, timer);
  }

  private scheduleBotSubmissions(match: MatchState): void {
    if (!match.currentChallenge) return;
    const challenge = match.currentChallenge;
    const botPlayers = [...match.players.values()].filter(
      (p) =>
        p.isBot && p.status === 'active' && !p.submittedForCurrentChallenge,
    );
    if (botPlayers.length === 0) return;

    // Engine-aware bot answers — prefer safe wrong/failing submissions.
    const answerForEngine = (
      engineId: string,
    ): Record<string, unknown> | null => {
      switch (engineId) {
        case 'trap.no_touch':
          // Touch the zone → fail (bots do not idle-win).
          return { touched: true };
        case 'gesture.reverse_swipe':
          return { dx: 0, dy: 0, durationMs: 50 };
        case 'tap.precision':
          return { tappedTargetIds: [] };
        case 'memory.sequence':
          return { sequence: [] };
        case 'hold.multitouch':
          return { contacts: 1, heldMs: 100, final: true };
        case WAIT_FOR_SIGNAL_ENGINE_ID:
        default:
          return { signalToken: 'bot-miss' };
      }
    };

    const submitBots = async () => {
      const answer = answerForEngine(challenge.engineId);
      if (!answer) return;
      for (const bot of botPlayers) {
        try {
          await this.submitAnswer({
            matchId: match.matchId,
            playerId: bot.playerId,
            challengeInstanceId: challenge.challengeInstanceId,
            commandId: randomUUID(),
            answer,
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
              match.phase === 'round_result' ||
              match.phase === 'power_action' ||
              match.phase === 'power_defense') &&
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

  /** Arm wall + mono open-lobby fill deadlines together. */
  private armLobbyFillWait(match: MatchState, waitMs: number): void {
    match.lobbyFillDeadlineAtMs = this.clock.nowMs() + waitMs;
    match.lobbyFillDeadlineMonoMs = this.clock.monoMs() + waitMs;
  }

  /**
   * Ensure quick_survival has a host. If `leftPlayerId` was the host (or host
   * is unset), assign an arbitrary remaining seat.
   */
  private ensureQuickHost(match: MatchState, leftPlayerId?: string): void {
    if (match.mode !== 'quick_survival') {
      return;
    }
    if (match.players.size === 0) {
      match.hostPlayerId = null;
      return;
    }
    const hostGone =
      match.hostPlayerId == null ||
      match.hostPlayerId === leftPlayerId ||
      !match.players.has(match.hostPlayerId);
    if (!hostGone) {
      return;
    }
    match.hostPlayerId = match.players.keys().next().value ?? null;
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
