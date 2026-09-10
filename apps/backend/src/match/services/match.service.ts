import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation';
import { MatchEngine } from '../domain/match.engine';
import {
  ChallengeEvaluatorRegistryImpl,
  createDevChallengeDefinition,
  DEV_DETERMINISTIC_CHOICE_ENGINE_ID,
  DevDeterministicChoiceEvaluator,
} from '../domain/dev-challenge.evaluator';
import type {
  ChallengeDefinition,
  Clock,
  DomainEvent,
  MatchState,
} from '../domain/types';
import { DomainError, SystemClock } from '../domain/types';
import { InMemoryMatchStore, type MatchStore } from '../store/match.store';
import { ResumeTokenService } from './resume-token.service';

export type MatchBroadcast = {
  matchId: string;
  events: DomainEvent[];
  snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
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

  constructor(config: ConfigService<AppConfig, true>) {
    this.nodeEnv = config.get('NODE_ENV', { infer: true });
    this.store = new InMemoryMatchStore();
    this.tokens = new ResumeTokenService();
    this.registry = new ChallengeEvaluatorRegistryImpl();
    if (this.nodeEnv !== 'production') {
      this.registry.register(new DevDeterministicChoiceEvaluator());
    }
    this.clock = new SystemClock();
    this.engine = new MatchEngine(this.clock, this.registry);
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
    });
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
    return this.enqueue(matchId, async () => {
      const match = await this.requireMatch(matchId);
      const playerId = this.tokens.newPlayerId();
      const issued = this.tokens.issue();
      const result = this.engine.joinPlayer(match, {
        playerId,
        resumeTokenHash: issued.hash,
      });
      await this.store.save(result.match);
      this.emit(result.match, result.events);

      if (
        result.match.players.size === 6 &&
        result.match.status === 'waiting'
      ) {
        await this.startDevRoundLocked(result.match.matchId);
      }

      const latest = await this.requireMatch(matchId);
      return {
        playerId,
        resumeToken: issued.token,
        snapshot: this.engine.toPublicSnapshot(latest),
        events: result.events,
      };
    });
  }

  async resumeMatch(
    matchId: string,
    resumeToken: string,
  ): Promise<{
    playerId: string;
    resumeToken: string;
    snapshot: ReturnType<MatchEngine['toPublicSnapshot']>;
  }> {
    return this.enqueue(matchId, async () => {
      const match = await this.store.get(matchId);
      if (!match) {
        throw new DomainError('MATCH_NOT_FOUND', 'match not found');
      }
      if (match.status === 'completed') {
        throw new DomainError('PLAYER_NOT_FOUND', 'resume failed');
      }
      const hash = this.tokens.hash(resumeToken);
      const player = [...match.players.values()].find(
        (p) => p.resumeTokenHash === hash,
      );
      if (!player) {
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
      await this.store.save(next);
      if (presence.events.length > 0) {
        this.emit(next, presence.events);
      }
      return {
        playerId: player.playerId,
        resumeToken: issued.token,
        snapshot: this.engine.toPublicSnapshot(next),
      };
    });
  }

  async markDisconnected(matchId: string, playerId: string): Promise<void> {
    await this.enqueue(matchId, async () => {
      const match = await this.store.get(matchId);
      if (!match) {
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
    return this.enqueue(input.matchId, async () => {
      const match = await this.requireMatch(input.matchId);
      const result = this.engine.submitAnswer(match, input);
      await this.store.save(result.match);
      if (result.events.length > 0) {
        this.clearTimer(input.matchId);
        this.emit(result.match, result.events);
        await this.maybeContinue(result.match);
      }
      // Always return the latest persisted snapshot so callers never see a
      // stale sequence after resolution / auto-continue.
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
    const match = await this.requireMatch(matchId);
    return { snapshot: this.engine.toPublicSnapshot(match) };
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
      }
    });
  }

  getEngineForTests(): MatchEngine {
    return this.engine;
  }

  getStoreForTests(): MatchStore {
    return this.store;
  }

  private assertDevAllowed(): void {
    if (this.nodeEnv === 'production') {
      throw new DomainError(
        'INVALID_DEFINITION',
        'dev match features forbidden in production',
      );
    }
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
    if (match.status === 'waiting' && match.winnerId == null) {
      const survivors = [...match.players.values()].filter(
        (p) => p.status === 'active',
      );
      if (survivors.length >= 2) {
        await this.startDevRoundLocked(match.matchId);
      }
    }
  }

  private scheduleTimeout(matchId: string, durationMs: number): void {
    this.clearTimer(matchId);
    if (this.nodeEnv === 'test') {
      // Deterministic tests advance FakeClock and call forceTimeout.
      return;
    }
    const timer = setTimeout(() => {
      void this.forceTimeout(matchId).catch((error: unknown) => {
        this.logger.error({
          event: 'match_timeout_failed',
          matchId,
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, durationMs);
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
