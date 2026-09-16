import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { isProhibitedDisplayName, isValidDisplayNameFormat } from '@thelastheart/contracts';
import type { AppConfig } from '../../config/env.validation';
import { DomainError, MATCH_PLAYER_CAPACITY, QUICK_LOBBY_FILL_WAIT_MS } from '../domain/types';
import {
  MatchService,
  type PlayerIdentityInput,
} from './match.service';

const DEFAULT_QUEUE_TIMEOUT_MS = 60_000;
const SCAN_INTERVAL_MS = 1_000;

export type MatchmakingTicket = {
  ticketId: string;
  playerKey: string;
  /** Authoritative seat id once seated in an open lobby. */
  playerId: string;
  identity: PlayerIdentityInput;
  enqueuedAtMs: number;
  timeoutAtMs: number;
  /** Set as soon as the player is seated in a quick_survival lobby. */
  matchId: string | null;
  resumeToken: string | null;
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

/**
 * Quick Survival pairing: open-lobby model.
 *
 * - First player opens a quick_survival lobby (1/6).
 * - Later players join the fullest open lobby with free seats.
 * - A full lobby (6) starts ready-countdown immediately.
 * - After the lobby fill wait: start with ≥2 players, or abort if still alone.
 *
 * Concurrency (single Nest process):
 * - All seat placements run through a promise-chain mutex so 100 simultaneous
 *   enqueues cannot overfill a room or each open a solo room.
 * - joinPlayer still enforces capacity; MATCH_FULL retries under the lock.
 * Multi-process / multi-region scale needs a distributed lock (e.g. Redis) later.
 *
 * Bot fill is intentionally dormant: policy getters/setters remain for admin UI,
 * but no bots are seated from matchmaking until a later planned milestone.
 */
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
  /** Serializes open-lobby find/join/create — see withSeatingLock. */
  private seatingChain: Promise<void> = Promise.resolve();
  private readonly lobbyFillTimers = new Map<string, NodeJS.Timeout>();
  private readonly lobbyFillWaitMs: number;

  constructor(
    private readonly matches: MatchService,
    config: ConfigService<AppConfig, true>,
  ) {
    const policy = this.matches.getBotFillPolicy();
    this.botFillEnabled = policy.enabled;
    this.botFillWaitMs = policy.waitMs;
    this.lobbyFillWaitMs = QUICK_LOBBY_FILL_WAIT_MS;
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

  static forTests(
    matches: MatchService,
    options?: {
      botFillEnabled?: boolean;
      botFillWaitMs?: number;
      queueTimeoutMs?: number;
      lobbyFillWaitMs?: number;
    },
  ): MatchmakingService {
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
      lobbyFillWaitMs: options?.lobbyFillWaitMs ?? QUICK_LOBBY_FILL_WAIT_MS,
      seatingChain: Promise.resolve(),
      lobbyFillTimers: new Map(),
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
    for (const timer of this.lobbyFillTimers.values()) {
      clearTimeout(timer);
    }
    this.lobbyFillTimers.clear();
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
    if (this.matches.isMatchmakingPaused()) {
      throw new DomainError(
        'MATCHMAKING_PAUSED',
        'matchmaking is paused by live ops',
      );
    }
    // Fail closed before creating a ticket — joinPlayer also enforces this.
    if (!isValidDisplayNameFormat(identity.displayName)) {
      throw new DomainError(
        'DISPLAY_NAME_INVALID',
        'display name must be one or two letter-only parts',
      );
    }
    if (isProhibitedDisplayName(identity.displayName)) {
      throw new DomainError(
        'DISPLAY_NAME_PROHIBITED',
        'display name contains prohibited content',
      );
    }
    try {
      return await this.withSeatingLock(() => this.seatUnderLock(identity));
    } catch (error) {
      if (error instanceof DomainError && error.code === 'ALREADY_IN_QUEUE') {
        throw error;
      }
      if (error instanceof DomainError && error.code === 'MATCHMAKING_PAUSED') {
        throw error;
      }
      if (
        error instanceof DomainError &&
        (error.code === 'DISPLAY_NAME_PROHIBITED' ||
          error.code === 'DISPLAY_NAME_INVALID')
      ) {
        throw error;
      }
      this.logger.error({
        event: 'matchmaking_seat_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      // Ticket may not exist if claim failed before insert.
      return {
        ticketId: randomUUID(),
        state: 'failed',
        acceptedSeats: 0,
        capacity: MATCH_PLAYER_CAPACITY as 6,
        timeoutAtMs: null,
        matchId: null,
        serverNowMs: Date.now(),
      };
    }
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
    if (ticket.matchId) {
      try {
        const left = await this.matches.leaveMatch(
          ticket.matchId,
          ticket.playerId,
        );
        this.onLobbyCompositionChanged(ticket.matchId, {
          emptied: left.emptied,
          lobbyFillWaitMs: left.lobbyFillWaitMs,
        });
      } catch {
        // Match may already be gone or past lobby.
      }
    }
    this.removeTicket(ticket);
    const status = this.toStatus(ticket, 'cancelled', { acceptedSeats: 0 });
    this.emit(status);
    return status;
  }

  getTicket(ticketId: string): MatchmakingTicket | undefined {
    return this.tickets.get(ticketId);
  }

  /**
   * Drop queue bookkeeping after the socket is bound / player left.
   * Does not leave the match.
   */
  releaseTicket(ticketId: string): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return;
    }
    this.removeTicket(ticket);
  }

  releaseTicketForPlayer(playerId: string): void {
    const ticket = [...this.tickets.values()].find(
      (t) => t.playerId === playerId,
    );
    if (ticket) {
      this.removeTicket(ticket);
    }
  }

  /** Test helper: drive lobby idle timeouts without waiting on the scanner. */
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
    // Resolve any quick lobbies whose fill wait elapsed (partial start or solo abort).
    const dueMatchIds = new Set<string>();
    for (const ticket of this.tickets.values()) {
      if (ticket.matchId) {
        dueMatchIds.add(ticket.matchId);
      }
    }
    for (const matchId of dueMatchIds) {
      await this.applyLobbyFillDecision(matchId);
    }

    for (const ticket of [...this.tickets.values()]) {
      if (!ticket.matchId) {
        continue;
      }
      const phase = await this.matches.getMatchPhase(ticket.matchId);
      // Match gone or left lobby (countdown/play) — drop queue bookkeeping.
      if (!phase.exists || phase.phase !== 'lobby') {
        this.removeTicket(ticket);
      }
    }
    // Bot fill intentionally not invoked — deferred product work.
  }

  /** Test helper: fire lobby-fill decision for a match immediately. */
  async resolveLobbyFillForTests(matchId: string): Promise<void> {
    await this.applyLobbyFillDecision(matchId);
  }

  /**
   * After a lobby seat is freed (leave / disconnect / cancel): drop or re-arm
   * the fill timer so the room stays joinable for the refreshed wait window.
   */
  onLobbyCompositionChanged(
    matchId: string,
    options: { emptied: boolean; lobbyFillWaitMs?: number },
  ): void {
    this.clearLobbyFillTimer(matchId);
    if (options.emptied) {
      return;
    }
    if (options.lobbyFillWaitMs != null) {
      this.scheduleLobbyFillTimer(matchId, options.lobbyFillWaitMs);
    }
  }

  private scheduleLobbyFillTimer(matchId: string, waitMs: number): void {
    if (this.lobbyFillTimers.has(matchId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.lobbyFillTimers.delete(matchId);
      void this.applyLobbyFillDecision(matchId).catch((error: unknown) => {
        this.logger.error({
          event: 'lobby_fill_resolve_failed',
          matchId,
          category: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, Math.max(1, waitMs));
    timer.unref?.();
    this.lobbyFillTimers.set(matchId, timer);
  }

  private clearLobbyFillTimer(matchId: string): void {
    const timer = this.lobbyFillTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.lobbyFillTimers.delete(matchId);
    }
  }

  private async applyLobbyFillDecision(matchId: string): Promise<void> {
    const result = await this.matches.resolveQuickLobbyFill(matchId);
    if (result.outcome === 'started' || result.outcome === 'aborted_solo') {
      this.clearLobbyFillTimer(matchId);
    } else if (result.outcome === 'noop' || result.outcome === 'gone') {
      const phase = await this.matches.getMatchPhase(matchId);
      if (!phase.exists || phase.phase !== 'lobby') {
        this.clearLobbyFillTimer(matchId);
      }
    }
    if (result.outcome === 'aborted_solo') {
      for (const playerId of result.playerIds) {
        const ticket = [...this.tickets.values()].find(
          (t) => t.playerId === playerId,
        );
        if (!ticket) {
          continue;
        }
        const timedOut = this.toStatus(ticket, 'timed_out', {
          acceptedSeats: 0,
          matchId: null,
          assignment: {
            playerId: ticket.playerId,
            resumeToken: ticket.resumeToken ?? '',
          },
        });
        this.removeTicket(ticket);
        this.emit(timedOut);
      }
    }
    if (result.outcome === 'started') {
      for (const playerId of result.playerIds) {
        this.releaseTicketForPlayer(playerId);
      }
    }
  }

  /**
   * Claim identity + seat. Caller must hold withSeatingLock.
   */
  private async seatUnderLock(
    identity: PlayerIdentityInput,
  ): Promise<MatchmakingStatusEvent> {
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
        countryCode: identity.countryCode,
        playerId: identity.playerId,
      },
      enqueuedAtMs: now,
      timeoutAtMs: now + this.queueTimeoutMs,
      matchId: null,
      resumeToken: null,
    };
    this.tickets.set(ticket.ticketId, ticket);
    this.byPlayerKey.set(playerKey, ticket.ticketId);

    try {
      return await this.seatIntoOpenLobbyUnlocked(ticket);
    } catch (error) {
      this.removeTicket(ticket);
      throw error;
    }
  }

  /**
   * Seat into fullest open lobby or create one. Caller must hold seating lock.
   * On MATCH_FULL / not-joinable, retries so a burst packs into ceil(N/6) rooms.
   */
  private async seatIntoOpenLobbyUnlocked(
    ticket: MatchmakingTicket,
  ): Promise<MatchmakingStatusEvent> {
    const maxAttempts = MATCH_PLAYER_CAPACITY * 4;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const openMatchId = await this.matches.findOpenQuickSurvivalLobby();
      if (openMatchId) {
        try {
          const joined = await this.matches.joinMatch(
            openMatchId,
            ticket.identity,
          );
          if (joined.snapshot.players.length > MATCH_PLAYER_CAPACITY) {
            throw new DomainError(
              'MATCH_FULL',
              'open lobby exceeded capacity after join',
            );
          }
          // If the fill wait already elapsed, resolve now (noop while still
          // within the window). Covers a spent timer + late packer joining a
          // still-visible lobby after the former seal window.
          if (
            joined.snapshot.phase === 'lobby' &&
            joined.snapshot.players.length >= 2
          ) {
            await this.applyLobbyFillDecision(openMatchId);
          }
          return this.markAssigned(
            ticket,
            openMatchId,
            joined.playerId,
            joined.resumeToken,
            joined.snapshot.players.length,
          );
        } catch (error) {
          if (
            error instanceof DomainError &&
            (error.code === 'MATCH_FULL' ||
              error.code === 'MATCH_NOT_JOINABLE' ||
              error.code === 'MATCH_NOT_FOUND' ||
              error.code === 'DISPLAY_NAME_TAKEN')
          ) {
            continue;
          }
          throw error;
        }
      }

      const created = await this.matches.createQuickSurvivalMatch([
        ticket.identity,
      ]);
      const assignment = created.assignments[0]!;
      this.scheduleLobbyFillTimer(
        created.matchId,
        created.lobbyFillWaitMs ?? this.lobbyFillWaitMs,
      );
      return this.markAssigned(
        ticket,
        created.matchId,
        assignment.playerId,
        assignment.resumeToken,
        created.snapshot.players.length,
      );
    }

    throw new DomainError(
      'MATCHMAKING_PAUSED',
      'unable to seat into an open or new lobby',
    );
  }

  /**
   * FIFO mutex for seating. Critical section covers identity claim +
   * find → join/create so concurrent enqueues cannot overfill a room or each
   * open a solo lobby.
   */
  private async withSeatingLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.seatingChain;
    let release!: () => void;
    this.seatingChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private markAssigned(
    ticket: MatchmakingTicket,
    matchId: string,
    playerId: string,
    resumeToken: string,
    acceptedSeats: number,
  ): MatchmakingStatusEvent {
    ticket.matchId = matchId;
    ticket.playerId = playerId;
    ticket.resumeToken = resumeToken;
    const assigned = this.toStatus(ticket, 'assigned', {
      acceptedSeats,
      matchId,
      assignment: { playerId, resumeToken },
    });
    this.emit(assigned);
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
      capacity: MATCH_PLAYER_CAPACITY as 6,
      timeoutAtMs: state === 'queued' ? ticket.timeoutAtMs : null,
      matchId: extras.matchId ?? ticket.matchId ?? null,
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
