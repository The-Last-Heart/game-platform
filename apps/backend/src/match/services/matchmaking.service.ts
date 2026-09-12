import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/env.validation';
import { DomainError, MATCH_PLAYER_CAPACITY } from '../domain/types';
import {
  MatchService,
  type PlayerIdentityInput,
} from './match.service';

const DEFAULT_QUEUE_TIMEOUT_MS = 60_000;
const SCAN_INTERVAL_MS = 1_000;

export type MatchmakingTicket = {
  ticketId: string;
  playerKey: string;
  playerId: string;
  identity: PlayerIdentityInput;
  enqueuedAtMs: number;
  timeoutAtMs: number;
};

export type MatchmakingStatusEvent = {
  ticketId: string;
  state: 'queued' | 'assigned' | 'cancelled' | 'timed_out' | 'failed';
  acceptedSeats: number;
  capacity: 6;
  timeoutAtMs: number | null;
  matchId: string | null;
  serverNowMs: number;
  /** Present when state === 'assigned'. */
  assignment?: {
    playerId: string;
    resumeToken: string;
  };
};

@Injectable()
export class MatchmakingService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private readonly tickets = new Map<string, MatchmakingTicket>();
  private readonly byPlayerKey = new Map<string, string>();
  private readonly listeners = new Set<(event: MatchmakingStatusEvent) => void>();
  private readonly queueTimeoutMs: number;
  private botFillEnabled: boolean;
  private botFillWaitMs: number;
  private scanTimer: NodeJS.Timeout | undefined;
  private matching = false;

  constructor(
    private readonly matches: MatchService,
    config: ConfigService<AppConfig, true>,
  ) {
    const policy = this.matches.getBotFillPolicy();
    this.botFillEnabled = policy.enabled;
    this.botFillWaitMs = policy.waitMs;
    // Prefer env when MatchService was constructed with config.
    try {
      this.botFillEnabled = config.get('MATCHMAKING_BOT_FILL_ENABLED', {
        infer: true,
      });
      this.botFillWaitMs = config.get('MATCHMAKING_BOT_FILL_WAIT_MS', {
        infer: true,
      });
    } catch {
      // forTests / missing config — keep MatchService policy.
    }
    this.queueTimeoutMs = DEFAULT_QUEUE_TIMEOUT_MS;
    this.armScanner();
  }

  static forTests(matches: MatchService, options?: {
    botFillEnabled?: boolean;
    botFillWaitMs?: number;
    queueTimeoutMs?: number;
  }): MatchmakingService {
    const service = Object.create(
      MatchmakingService.prototype,
    ) as MatchmakingService;
    Object.assign(service, {
      logger: new Logger(MatchmakingService.name),
      matches,
      tickets: new Map(),
      byPlayerKey: new Map(),
      listeners: new Set(),
      queueTimeoutMs: options?.queueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS,
      botFillEnabled:
        options?.botFillEnabled ?? matches.getBotFillPolicy().enabled,
      botFillWaitMs:
        options?.botFillWaitMs ?? matches.getBotFillPolicy().waitMs,
      matching: false,
    });
    return service;
  }

  onStatus(listener: (event: MatchmakingStatusEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onModuleDestroy(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    this.listeners.clear();
    this.tickets.clear();
    this.byPlayerKey.clear();
  }

  getBotFillPolicy(): { enabled: boolean; waitMs: number } {
    return { enabled: this.botFillEnabled, waitMs: this.botFillWaitMs };
  }

  /** In-memory Live Ops override (env is the baseline at process start). */
  setBotFillPolicy(policy: { enabled?: boolean; waitMs?: number }): void {
    if (policy.enabled !== undefined) {
      this.botFillEnabled = policy.enabled;
    }
    if (policy.waitMs !== undefined) {
      this.botFillWaitMs = policy.waitMs;
    }
    this.matches.setBotFillPolicy(policy);
  }

  async enqueue(identity: PlayerIdentityInput): Promise<MatchmakingStatusEvent> {
    const playerKey = identity.displayName.trim().toLowerCase();
    if (this.byPlayerKey.has(playerKey)) {
      throw new DomainError('ALREADY_IN_QUEUE', 'already in matchmaking queue');
    }
    const now = Date.now();
    const ticket: MatchmakingTicket = {
      ticketId: randomUUID(),
      playerKey,
      playerId: randomUUID(),
      identity: {
        displayName: identity.displayName.trim(),
        avatarColor: identity.avatarColor,
      },
      enqueuedAtMs: now,
      timeoutAtMs: now + this.queueTimeoutMs,
    };
    this.tickets.set(ticket.ticketId, ticket);
    this.byPlayerKey.set(playerKey, ticket.ticketId);
    const status = this.toStatus(ticket, 'queued', {
      acceptedSeats: this.tickets.size,
    });
    this.emit(status);
    // Fan-out seat count so every waiting ticket sees 2/6… progress.
    if (this.tickets.size > 1) {
      const seats = this.tickets.size;
      for (const other of this.tickets.values()) {
        if (other.ticketId === ticket.ticketId) {
          continue;
        }
        this.emit(
          this.toStatus(other, 'queued', {
            acceptedSeats: seats,
          }),
        );
      }
    }
    const assigned = await this.tryMatch();
    const forTicket = assigned.get(ticket.ticketId);
    if (forTicket) {
      return forTicket;
    }
    const latest = this.tickets.get(ticket.ticketId);
    if (!latest) {
      return status;
    }
    return this.toStatus(latest, 'queued', {
      acceptedSeats: this.tickets.size,
    });
  }

  async cancel(
    ticketIdOrPlayerId: string,
  ): Promise<MatchmakingStatusEvent | null> {
    const ticket =
      this.tickets.get(ticketIdOrPlayerId) ??
      [...this.tickets.values()].find(
        (t) => t.playerId === ticketIdOrPlayerId,
      );
    if (!ticket) {
      throw new DomainError('QUEUE_NOT_FOUND', 'queue ticket not found');
    }
    this.removeTicket(ticket);
    const status = this.toStatus(ticket, 'cancelled', { acceptedSeats: 0 });
    this.emit(status);
    return status;
  }

  getTicket(ticketId: string): MatchmakingTicket | undefined {
    return this.tickets.get(ticketId);
  }

  /** Test helper: drive timeout/bot-fill without waiting on the scanner. */
  async scanForTests(): Promise<void> {
    await this.scan();
  }

  private armScanner(): void {
    if (this.scanTimer) {
      return;
    }
    this.scanTimer = setInterval(() => {
      void this.scan().catch((error: unknown) => {
        this.logger.error({
          event: 'matchmaking_scan_failed',
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, SCAN_INTERVAL_MS);
    this.scanTimer.unref?.();
  }

  private async scan(): Promise<void> {
    const now = Date.now();
    for (const ticket of [...this.tickets.values()]) {
      if (ticket.timeoutAtMs <= now) {
        this.removeTicket(ticket);
        this.emit(this.toStatus(ticket, 'timed_out', { acceptedSeats: 0 }));
      }
    }
    await this.tryMatch();
    await this.maybeBotFill();
  }

  private async tryMatch(): Promise<Map<string, MatchmakingStatusEvent>> {
    const assigned = new Map<string, MatchmakingStatusEvent>();
    if (this.matching) {
      return assigned;
    }
    if (this.tickets.size < MATCH_PLAYER_CAPACITY) {
      return assigned;
    }
    this.matching = true;
    try {
      while (this.tickets.size >= MATCH_PLAYER_CAPACITY) {
        const batch = [...this.tickets.values()]
          .sort((a, b) => a.enqueuedAtMs - b.enqueuedAtMs)
          .slice(0, MATCH_PLAYER_CAPACITY);
        const batchAssigned = await this.assignBatch(batch);
        for (const [id, event] of batchAssigned) {
          assigned.set(id, event);
        }
      }
    } finally {
      this.matching = false;
    }
    return assigned;
  }

  private async maybeBotFill(): Promise<void> {
    if (!this.botFillEnabled || this.matching) {
      return;
    }
    if (this.tickets.size === 0 || this.tickets.size >= MATCH_PLAYER_CAPACITY) {
      return;
    }
    const oldest = [...this.tickets.values()].sort(
      (a, b) => a.enqueuedAtMs - b.enqueuedAtMs,
    )[0];
    if (!oldest) {
      return;
    }
    if (Date.now() - oldest.enqueuedAtMs < this.botFillWaitMs) {
      return;
    }
    this.matching = true;
    try {
      const batch = [...this.tickets.values()].sort(
        (a, b) => a.enqueuedAtMs - b.enqueuedAtMs,
      );
      await this.assignBatch(batch, { fillBots: true });
    } finally {
      this.matching = false;
    }
  }

  private async assignBatch(
    batch: MatchmakingTicket[],
    options?: { fillBots?: boolean },
  ): Promise<Map<string, MatchmakingStatusEvent>> {
    const assigned = new Map<string, MatchmakingStatusEvent>();
    for (const ticket of batch) {
      this.removeTicket(ticket);
    }
    try {
      const created = await this.matches.createQuickSurvivalMatch(
        batch.map((t) => t.identity),
      );
      if (options?.fillBots) {
        await this.matches.fillBots(created.matchId, {
          allowWhenPolicyEnabled: true,
        });
      }
      for (let i = 0; i < batch.length; i += 1) {
        const ticket = batch[i]!;
        const assignment = created.assignments[i]!;
        const event = this.toStatus(ticket, 'assigned', {
          acceptedSeats: MATCH_PLAYER_CAPACITY,
          matchId: created.matchId,
          assignment: {
            playerId: assignment.playerId,
            resumeToken: assignment.resumeToken,
          },
        });
        assigned.set(ticket.ticketId, event);
        this.emit(event);
      }
    } catch (error) {
      this.logger.error({
        event: 'matchmaking_assign_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      for (const ticket of batch) {
        this.emit(this.toStatus(ticket, 'failed', { acceptedSeats: 0 }));
      }
    }
    return assigned;
  }

  private removeTicket(ticket: MatchmakingTicket): void {
    this.tickets.delete(ticket.ticketId);
    if (this.byPlayerKey.get(ticket.playerKey) === ticket.ticketId) {
      this.byPlayerKey.delete(ticket.playerKey);
    }
  }

  private toStatus(
    ticket: MatchmakingTicket,
    state: MatchmakingStatusEvent['state'],
    extras: {
      acceptedSeats: number;
      matchId?: string | null;
      assignment?: MatchmakingStatusEvent['assignment'];
    },
  ): MatchmakingStatusEvent {
    return {
      ticketId: ticket.ticketId,
      state,
      acceptedSeats: extras.acceptedSeats,
      capacity: 6,
      timeoutAtMs: state === 'queued' ? ticket.timeoutAtMs : null,
      matchId: extras.matchId ?? null,
      serverNowMs: Date.now(),
      ...(extras.assignment ? { assignment: extras.assignment } : {}),
    };
  }

  private emit(event: MatchmakingStatusEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
