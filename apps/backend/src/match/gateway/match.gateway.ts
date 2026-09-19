import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  MessageTypes,
  ProtocolValidationError,
  parseClientCommand,
  REALTIME_SCHEMA_VERSION,
  type ClientPlatform,
} from '@thelastheart/contracts';
import { DomainError } from '../domain/types';
import { toPublicChallengeView } from '../domain/match.engine';
import { MatchService, type MatchBroadcast } from '../services/match.service';
import {
  MatchmakingService,
  type MatchmakingStatusEvent,
} from '../services/matchmaking.service';
import { AppVersionPolicyService } from '../../content/services/app-version-policy.service';

type SocketState = {
  playerId?: string;
  matchId?: string;
  ticketId?: string;
  /** Set synchronously on disconnect so pending binds cannot race. */
  disconnected?: boolean;
  /** Immutable for the life of this socket binding. */
  appVersion?: string;
  buildNumber?: string;
  platform?: ClientPlatform;
};

/** Incoming command cap (DoS). Outgoing snapshots can be larger (maps). */
const MAX_INCOMING_COMMAND_BYTES = 16_384;
/** Socket.IO applies this to inbound AND outbound packets. */
const MAX_SOCKET_PACKET_BYTES = 1_048_576;

@WebSocketGateway({
  cors: {
    origin: false,
  },
  maxHttpBufferSize: MAX_SOCKET_PACKET_BYTES,
})
export class MatchGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(MatchGateway.name);

  @WebSocketServer()
  server!: Server;

  private unsubscribe: (() => void) | undefined;
  private unsubscribeMatchmaking: (() => void) | undefined;
  /** `${matchId}:${playerId}` -> current owning socket id */
  private readonly connectionLeases = new Map<string, string>();
  /** ticketId -> socket id waiting in matchmaking */
  private readonly queueSockets = new Map<string, string>();
  /**
   * Per-socket serialization for identity-changing commands
   * (create_dev / join / resume). Errors must not poison the chain.
   */
  private readonly socketIdentityQueues = new Map<string, Promise<unknown>>();
  private disconnectHookForTests: ((socketId: string) => void) | undefined;
  /** Test-only: pause clearClientBinding after ownership check, before disconnect. */
  private clearBindingBarrierForTests: (() => Promise<void>) | undefined;

  constructor(
    private readonly matches: MatchService,
    private readonly matchmaking: MatchmakingService,
    private readonly appVersions: AppVersionPolicyService,
  ) {}

  afterInit(): void {
    this.unsubscribe = this.matches.onBroadcast((broadcast) => {
      this.publishBroadcast(broadcast);
    });
    this.unsubscribeMatchmaking = this.matchmaking.onStatus((event) => {
      void this.handleMatchmakingStatus(event);
    });
  }

  handleConnection(client: Socket): void {
    (client.data as SocketState) = {};
    this.logger.log({
      event: 'socket_connected',
      socketId: client.id,
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const state = client.data as SocketState;
    // Mark before any await so in-flight identity handlers cannot bind afterward.
    state.disconnected = true;
    this.disconnectHookForTests?.(client.id);
    if (state.appVersion) {
      this.appVersions.unregisterSessionVersion(state.appVersion);
    }

    const matchId = state.matchId;
    const playerId = state.playerId;
    if (matchId && playerId) {
      const key = this.leaseKey(matchId, playerId);
      // Lease-owner-aware: only disconnect while this socket still owns the lease.
      // Holding the lease until after the presence write prevents a concurrent
      // resume from being overwritten by a stale disconnect.
      // Free the seat BEFORE cancelling the queue ticket so a cancelled-status
      // clearClientBinding cannot race markDisconnected over a still-seated player.
      if (this.connectionLeases.get(key) === client.id) {
        // Pre-challenge: free the seat immediately so the roster drops the name
        // and open-lobby packing can reuse the same room. Mid-challenge marks
        // disconnected and arms resume grace; expiry treats the seat as left.
        const canLeaveLobby = await this.matches.canLeaveLobbySeat(matchId);
        if (canLeaveLobby && this.connectionLeases.get(key) === client.id) {
          try {
            const left = await this.matches.leaveMatch(matchId, playerId);
            this.matchmaking.releaseTicketForPlayer(playerId);
            this.matchmaking.onLobbyCompositionChanged(matchId, {
              emptied: left.emptied,
              lobbyFillWaitMs: left.lobbyFillWaitMs,
            });
          } catch {
            if (this.connectionLeases.get(key) === client.id) {
              await this.matches.markDisconnected(matchId, playerId, {
                stillOwnsLease: () =>
                  this.connectionLeases.get(key) === client.id,
              });
            }
          }
        } else if (this.connectionLeases.get(key) === client.id) {
          await this.matches.markDisconnected(matchId, playerId, {
            stillOwnsLease: () => this.connectionLeases.get(key) === client.id,
          });
        }
        if (this.connectionLeases.get(key) === client.id) {
          this.connectionLeases.delete(key);
        }
      }
    }

    if (state.ticketId) {
      const ticketId = state.ticketId;
      if (this.queueSockets.get(ticketId) === client.id) {
        this.queueSockets.delete(ticketId);
        try {
          // Seat already freed above when bound; cancel is idempotent leave +
          // queue bookkeeping. Prefer cancel so solo-search sockets still clear.
          await this.matchmaking.cancel(ticketId);
        } catch {
          // Ticket may already be assigned/cancelled.
        }
      }
      state.ticketId = undefined;
    }

    // Drop any residual leases for this socket (never leave ghost owners).
    for (const [key, socketId] of this.connectionLeases) {
      if (socketId === client.id) {
        this.connectionLeases.delete(key);
      }
    }

    this.socketIdentityQueues.delete(client.id);
    this.logger.log({
      event: 'socket_disconnected',
      socketId: client.id,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeMatchmaking?.();
    this.unsubscribeMatchmaking = undefined;
    this.connectionLeases.clear();
    this.queueSockets.clear();
    this.socketIdentityQueues.clear();
    if (this.server) {
      await new Promise<void>((resolve) => {
        void this.server.close(() => resolve());
      });
    }
  }

  @SubscribeMessage('command')
  async onCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    let commandId: string | undefined;
    try {
      const size = Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
      if (size > MAX_INCOMING_COMMAND_BYTES) {
        this.emitError(
          client,
          'INVALID_PAYLOAD',
          'errors.protocol.invalid_payload',
        );
        return;
      }

      const command = parseClientCommand(body);
      if (!command.commandId) {
        this.emitError(
          client,
          'INVALID_PAYLOAD',
          'errors.protocol.invalid_payload',
        );
        return;
      }
      commandId = command.commandId;
      switch (command.type) {
        case MessageTypes.MatchCreateDev:
          await this.enqueueIdentity(client, () =>
            this.handleCreateDev(client, commandId!, command.messageId),
          );
          break;
        case MessageTypes.MatchJoin:
          await this.enqueueIdentity(client, () =>
            this.handleJoin(
              client,
              commandId!,
              command.messageId,
              (command.payload as { matchId: string }).matchId,
            ),
          );
          break;
        case MessageTypes.MatchResume:
          await this.enqueueIdentity(client, () =>
            this.handleResume(
              client,
              commandId!,
              command.messageId,
              command.payload as { matchId: string; resumeToken: string },
            ),
          );
          break;
        case MessageTypes.MatchSubmitAnswer:
          await this.handleSubmit(
            client,
            commandId,
            command.messageId,
            command.payload as {
              challengeInstanceId: string;
              answer: Record<string, unknown>;
            },
          );
          break;
        case MessageTypes.MatchRequestSnapshot:
          await this.handleSnapshot(
            client,
            commandId,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.MatchFillDevBots:
          await this.handleFillDevBots(
            client,
            commandId,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.MatchmakingEnqueue:
          await this.enqueueIdentity(client, () =>
            this.handleMatchmakingEnqueue(
              client,
              commandId!,
              command.messageId,
              command.payload as {
                displayName: string;
                avatarColor: string;
                countryCode: string;
                playerId: string;
              },
            ),
          );
          break;
        case MessageTypes.MatchmakingCancel:
          await this.handleMatchmakingCancel(
            client,
            commandId!,
            command.messageId,
            command.payload as { ticketId?: string },
          );
          break;
        case MessageTypes.PrivateRoomCreate:
          await this.enqueueIdentity(client, () =>
            this.handlePrivateCreate(
              client,
              commandId!,
              command.messageId,
              command.payload as {
                displayName: string;
                avatarColor: string;
                countryCode: string;
                playerId: string;
              },
            ),
          );
          break;
        case MessageTypes.PrivateRoomJoin:
          await this.enqueueIdentity(client, () =>
            this.handlePrivateJoin(
              client,
              commandId!,
              command.messageId,
              command.payload as {
                displayName: string;
                avatarColor: string;
                countryCode: string;
                playerId: string;
                roomCode: string;
              },
            ),
          );
          break;
        case MessageTypes.MatchReady:
          await this.handleReady(
            client,
            commandId!,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.MatchLeave:
          await this.handleLeave(
            client,
            commandId!,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.MatchExtendLobbyFill:
          await this.handleExtendLobbyFill(
            client,
            commandId!,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.MatchStartLobby:
          await this.handleStartLobby(
            client,
            commandId!,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.TrainingStart:
          await this.enqueueIdentity(client, () =>
            this.handleTrainingStart(
              client,
              commandId!,
              command.messageId,
              command.payload as {
                displayName: string;
                avatarColor: string;
                countryCode: string;
                playerId: string;
              },
            ),
          );
          break;
        case MessageTypes.TrainingRetry:
          await this.enqueueIdentity(client, () =>
            this.handleTrainingRetry(
              client,
              commandId!,
              command.messageId,
              (command.payload as { matchId: string }).matchId,
            ),
          );
          break;
        case MessageTypes.TrainingRestart:
          await this.enqueueIdentity(client, () =>
            this.handleTrainingRestart(
              client,
              commandId!,
              command.messageId,
              (command.payload as { matchId: string }).matchId,
            ),
          );
          break;
        case MessageTypes.MatchRematch:
          await this.enqueueIdentity(client, () =>
            this.handleRematch(
              client,
              commandId!,
              command.messageId,
              (command.payload as { matchId: string }).matchId,
            ),
          );
          break;
        case MessageTypes.PowerUse:
          await this.enqueueIdentity(client, () =>
            this.handlePowerUse(
              client,
              commandId!,
              command.messageId,
              command.payload as {
                powerId: 'danger_pulse';
                targetPlayerId: string;
              },
            ),
          );
          break;
        case MessageTypes.PowerDefend:
          await this.enqueueIdentity(client, () =>
            this.handlePowerDefend(
              client,
              commandId!,
              command.messageId,
              command.payload as {
                attackId: string;
                choice: 'none' | 'shield' | 'reflect';
              },
            ),
          );
          break;
        case MessageTypes.PowerSkip:
          await this.enqueueIdentity(client, () =>
            this.handlePowerSkip(
              client,
              commandId!,
              command.messageId,
              command.payload as { matchId: string },
            ),
          );
          break;
        default:
          this.emitError(
            client,
            'UNKNOWN_MESSAGE_TYPE',
            'errors.protocol.unknown_message_type',
          );
      }
    } catch (error) {
      if (error instanceof ProtocolValidationError) {
        this.emitError(client, error.code, error.messageKey, { commandId });
        return;
      }
      if (error instanceof DomainError) {
        this.emitDomainError(client, error, commandId);
        return;
      }
      this.logger.error({
        event: 'command_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      this.emitError(client, 'INTERNAL_ERROR', 'errors.protocol.internal', {
        commandId,
      });
    }
  }

  private async handleCreateDev(
    client: Socket,
    commandId: string,
    correlationId: string,
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    await this.clearClientBinding(client);
    // Disconnect during previous-binding cleanup must not create a new match.
    if (this.isSocketGone(client)) {
      return;
    }
    const created = await this.matches.createDevMatch();
    if (this.isSocketGone(client)) {
      return;
    }
    this.emitToClient(
      client,
      MessageTypes.SessionAccepted,
      {
        matchId: created.matchId,
        role: 'creator',
      },
      { commandId, correlationId, matchId: created.matchId },
    );
    this.emitToClient(client, MessageTypes.MatchSnapshot, created.snapshot, {
      commandId,
      correlationId,
      matchId: created.matchId,
      sequence: created.snapshot.sequence,
    });
  }

  private async handleJoin(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    // Bound sockets may not join as an additional/new player (same or other match).
    if (!this.ensureUnbound(client)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }

    const joined = await this.matches.joinMatch(matchId);
    if (this.isSocketGone(client)) {
      await this.matches.abandonOrphanedJoin(matchId, joined.playerId);
      return;
    }
    if (!this.tryBindSession(client, matchId, joined.playerId)) {
      await this.matches.abandonOrphanedJoin(matchId, joined.playerId);
      return;
    }
    await client.join(this.room(matchId));

    this.emitToClient(
      client,
      MessageTypes.SessionAccepted,
      {
        matchId,
        playerId: joined.playerId,
        resumeToken: joined.resumeToken,
      },
      { commandId, correlationId, matchId },
    );
    this.emitToClient(client, MessageTypes.MatchSnapshot, joined.snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: joined.snapshot.sequence,
    });

    // Countdown starts only after live socket has lease, room, and credentials,
    // and only once every seated player has been individually finalized.
    if (this.isSocketGone(client)) {
      this.releaseLeaseIfOwned(client, matchId, joined.playerId);
      await this.matches.abandonOrphanedJoin(matchId, joined.playerId);
      return;
    }
    const leaseKey = this.leaseKey(matchId, joined.playerId);
    await this.matches.finalizeJoin(matchId, joined.playerId, {
      stillOwnsLease: () => this.connectionLeases.get(leaseKey) === client.id,
    });
    // Only abandon when no live lease owner remains. If another socket took
    // the lease (e.g. resume), leave the reserved player for that owner.
    const owner = this.connectionLeases.get(leaseKey);
    if (owner == null) {
      await this.matches.abandonOrphanedJoin(matchId, joined.playerId);
    }
  }

  private async handleResume(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: {
      matchId: string;
      resumeToken: string;
      appVersion?: string;
      buildNumber?: string;
      platform?: ClientPlatform;
    },
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    const state = client.data as SocketState;
    // Bound socket may only resume within its current match; expectedPlayerId
    // prevents resuming as a different player (no token rotate for the other).
    if (state.matchId && state.matchId !== payload.matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (state.playerId && !state.matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }

    const admitted = await this.bindSocketRuntime(client, payload, commandId);
    if (!admitted) {
      return;
    }

    const resumed = await this.matches.resumeMatch({
      matchId: payload.matchId,
      resumeToken: payload.resumeToken,
      commandId,
      expectedPlayerId: state.playerId,
      appVersion: (client.data as SocketState).appVersion,
    });
    if (this.isSocketGone(client)) {
      await this.matches.markDisconnected(payload.matchId, resumed.playerId);
      return;
    }
    if (!this.tryBindSession(client, payload.matchId, resumed.playerId)) {
      await this.matches.markDisconnected(payload.matchId, resumed.playerId);
      return;
    }
    await client.join(this.room(payload.matchId));

    this.emitToClient(
      client,
      MessageTypes.SessionAccepted,
      {
        matchId: payload.matchId,
        playerId: resumed.playerId,
        resumeToken: resumed.resumeToken,
      },
      { commandId, correlationId, matchId: payload.matchId },
    );
    this.emitToClient(client, MessageTypes.MatchSnapshot, resumed.snapshot, {
      commandId,
      correlationId,
      matchId: payload.matchId,
      sequence: resumed.snapshot.sequence,
    });

    // Resume of an unaccepted reserved seat must finalize after live bind +
    // credentials (idempotent when already accepted).
    if (this.isSocketGone(client)) {
      await this.matches.markDisconnected(payload.matchId, resumed.playerId, {
        stillOwnsLease: () =>
          this.connectionLeases.get(
            this.leaseKey(payload.matchId, resumed.playerId),
          ) === client.id,
      });
      return;
    }
    const resumeLeaseKey = this.leaseKey(payload.matchId, resumed.playerId);
    await this.matches.finalizeJoin(payload.matchId, resumed.playerId, {
      stillOwnsLease: () =>
        this.connectionLeases.get(resumeLeaseKey) === client.id,
    });
  }

  private async handleSubmit(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { challengeInstanceId: string; answer: Record<string, unknown> },
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    let ackSent = false;
    const sendAck = (ack: {
      accepted: boolean;
      reason?: string;
      duplicate: boolean;
    }) => {
      if (ackSent) return;
      ackSent = true;
      this.emitToClient(
        client,
        MessageTypes.ChallengeSubmissionAck,
        {
          accepted: ack.accepted,
          reasonKey: ack.reason
            ? `errors.match.submission_${ack.reason}`
            : undefined,
          duplicate: ack.duplicate,
        },
        {
          commandId,
          correlationId,
          matchId: state.matchId,
        },
      );
    };

    const result = await this.matches.submitAnswer({
      matchId: state.matchId,
      playerId: state.playerId,
      challengeInstanceId: payload.challengeInstanceId,
      commandId,
      answer: payload.answer,
      onAck: sendAck,
    });

    // Fallback if onAck did not run (e.g. older call sites).
    sendAck({
      accepted: result.ack.accepted,
      reason: result.ack.reason,
      duplicate: result.duplicate,
    });
  }

  private async handleSnapshot(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      if (!this.tryReclaimLease(client, state.matchId, state.playerId)) {
        this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
          commandId,
        });
        return;
      }
    }
    const result = await this.matches.requestSnapshot(matchId, state.playerId);
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handleFillDevBots(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.fillDevBots(matchId);
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handleMatchmakingEnqueue(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: {
      displayName: string;
      avatarColor: string;
      countryCode: string;
      playerId: string;
      appVersion?: string;
      buildNumber?: string;
      platform?: ClientPlatform;
    },
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    const prior = client.data as SocketState;
    if (prior.ticketId) {
      try {
        await this.matchmaking.cancel(prior.ticketId);
      } catch {
        // Already gone.
      }
      this.queueSockets.delete(prior.ticketId);
      prior.ticketId = undefined;
    }
    if (!this.ensureUnbound(client)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const admitted = await this.bindSocketRuntime(client, payload, commandId);
    if (!admitted) {
      return;
    }
    const state = client.data as SocketState;
    const status = await this.matchmaking.enqueue({
      displayName: payload.displayName,
      avatarColor: payload.avatarColor,
      countryCode: payload.countryCode,
      playerId: payload.playerId,
      appVersion: state.appVersion,
    });
    if (this.isSocketGone(client)) {
      if (status.state === 'queued') {
        try {
          await this.matchmaking.cancel(status.ticketId);
        } catch {
          // ignore
        }
      }
      return;
    }
    state.ticketId = status.ticketId;
    this.queueSockets.set(status.ticketId, client.id);
    this.emitMatchmakingStatus(client, status, { commandId, correlationId });
    if (status.state === 'assigned' && status.matchId && status.assignment) {
      await this.bindAssignedMatchmaking(
        client,
        commandId,
        correlationId,
        status,
      );
    }
  }

  private async handleMatchmakingCancel(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { ticketId?: string },
  ): Promise<void> {
    const state = client.data as SocketState;
    const ticketId = payload.ticketId ?? state.ticketId;
    if (!ticketId) {
      this.emitError(client, 'QUEUE_NOT_FOUND', 'errors.queue.not_found', {
        commandId,
      });
      return;
    }
    const status = await this.matchmaking.cancel(ticketId);
    if (this.queueSockets.get(ticketId) === client.id) {
      this.queueSockets.delete(ticketId);
    }
    state.ticketId = undefined;
    // Assignment binds the socket to the lobby seat; cancel must clear that
    // binding so the same socket can enqueue again.
    if (state.matchId || state.playerId) {
      const matchId = state.matchId;
      const playerId = state.playerId;
      if (matchId && playerId) {
        const key = this.leaseKey(matchId, playerId);
        if (this.connectionLeases.get(key) === client.id) {
          this.connectionLeases.delete(key);
        }
        void client.leave(this.room(matchId));
      }
      state.matchId = undefined;
      state.playerId = undefined;
    }
    if (status) {
      this.emitMatchmakingStatus(client, status, { commandId, correlationId });
    }
  }

  private async handlePrivateCreate(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: {
      displayName: string;
      avatarColor: string;
      countryCode: string;
      playerId: string;
      appVersion?: string;
      buildNumber?: string;
      platform?: ClientPlatform;
    },
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    if (!this.ensureUnbound(client)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const admitted = await this.bindSocketRuntime(client, payload, commandId);
    if (!admitted) {
      return;
    }
    const state = client.data as SocketState;
    const created = await this.matches.createPrivateRoom({
      displayName: payload.displayName,
      avatarColor: payload.avatarColor,
      countryCode: payload.countryCode,
      playerId: payload.playerId,
      appVersion: state.appVersion,
    });
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      created.matchId,
      created.playerId,
      created.resumeToken,
    );
  }

  private async handlePrivateJoin(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: {
      displayName: string;
      avatarColor: string;
      countryCode: string;
      playerId: string;
      roomCode: string;
      appVersion?: string;
      buildNumber?: string;
      platform?: ClientPlatform;
    },
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    if (!this.ensureUnbound(client)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const admitted = await this.bindSocketRuntime(client, payload, commandId);
    if (!admitted) {
      return;
    }
    const state = client.data as SocketState;
    const joined = await this.matches.joinPrivateRoom({
      displayName: payload.displayName,
      avatarColor: payload.avatarColor,
      countryCode: payload.countryCode,
      playerId: payload.playerId,
      roomCode: payload.roomCode,
      appVersion: state.appVersion,
    });
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      joined.matchId,
      joined.playerId,
      joined.resumeToken,
    );
    if (joined.lobbyFillWaitMs != null) {
      this.matchmaking.onLobbyCompositionChanged(joined.matchId, {
        emptied: false,
        lobbyFillWaitMs: joined.lobbyFillWaitMs,
      });
    }
  }

  private async handleReady(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.setReady(matchId, state.playerId);
    if (result.countdownStarted) {
      // Clear fill timer; countdown owns the match now.
      this.matchmaking.onLobbyCompositionChanged(matchId, { emptied: false });
    }
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handleExtendLobbyFill(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.extendLobbyFill(matchId, state.playerId);
    this.matchmaking.onLobbyCompositionChanged(matchId, {
      emptied: false,
      lobbyFillWaitMs: result.lobbyFillWaitMs,
    });
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handleStartLobby(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.startLobbyNow(matchId, state.playerId);
    // Clear fill timer; do not re-arm — countdown owns the match now.
    this.matchmaking.onLobbyCompositionChanged(matchId, { emptied: false });
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handleLeave(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const playerId = state.playerId;
    const result = await this.matches.leaveMatch(matchId, playerId);
    this.matchmaking.releaseTicketForPlayer(playerId);
    this.matchmaking.onLobbyCompositionChanged(matchId, {
      emptied: result.emptied,
      lobbyFillWaitMs: result.lobbyFillWaitMs,
    });
    this.releaseLeaseIfOwned(client, matchId, playerId);
    await client.leave(this.room(matchId));
    (client.data as SocketState) = {};
    if (result.snapshot) {
      this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
        commandId,
        correlationId,
        matchId,
        sequence: result.snapshot.sequence,
      });
    }
  }

  private async handleTrainingStart(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: {
      displayName: string;
      avatarColor: string;
      countryCode: string;
      playerId: string;
    },
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      return;
    }
    if (!this.ensureUnbound(client)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const started = await this.matches.startTraining(payload);
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      started.matchId,
      started.playerId,
      started.resumeToken,
    );
  }

  private async handleTrainingRetry(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const retried = await this.matches.retryTraining(matchId, state.playerId);
    await this.clearClientBinding(client);
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      retried.matchId,
      retried.playerId,
      retried.resumeToken,
    );
  }

  private async handleTrainingRestart(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const restarted = await this.matches.restartTraining(
      matchId,
      state.playerId,
    );
    await this.clearClientBinding(client);
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      restarted.matchId,
      restarted.playerId,
      restarted.resumeToken,
    );
  }

  private async handleRematch(
    client: Socket,
    commandId: string,
    correlationId: string,
    matchId: string,
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId || state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const rematched = await this.matches.rematch(matchId, state.playerId);
    if (rematched.lobbyFillWaitMs != null) {
      this.matchmaking.onLobbyCompositionChanged(rematched.matchId, {
        emptied: false,
        lobbyFillWaitMs: rematched.lobbyFillWaitMs,
      });
    }
    await this.clearClientBinding(client);
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      rematched.matchId,
      rematched.playerId,
      rematched.resumeToken,
    );
  }

  private async handlePowerUse(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { powerId: 'danger_pulse'; targetPlayerId: string },
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.usePower({
      matchId: state.matchId,
      playerId: state.playerId,
      powerId: payload.powerId,
      targetPlayerId: payload.targetPlayerId,
    });
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId: state.matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handlePowerDefend(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { attackId: string; choice: 'none' | 'shield' | 'reflect' },
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.defendPower({
      matchId: state.matchId,
      playerId: state.playerId,
      attackId: payload.attackId,
      choice: payload.choice,
    });
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId: state.matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handlePowerSkip(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { matchId: string },
  ): Promise<void> {
    const state = client.data as SocketState;
    if (
      !state.matchId ||
      !state.playerId ||
      state.matchId !== payload.matchId
    ) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.skipPower({
      matchId: state.matchId,
      playerId: state.playerId,
    });
    this.emitToClient(client, MessageTypes.MatchSnapshot, result.snapshot, {
      commandId,
      correlationId,
      matchId: state.matchId,
      sequence: result.snapshot.sequence,
    });
  }

  private async handleMatchmakingStatus(
    event: MatchmakingStatusEvent,
  ): Promise<void> {
    const client = await this.resolveMatchmakingClient(event);
    if (!client) {
      this.queueSockets.delete(event.ticketId);
      return;
    }
    if (event.state === 'assigned' && event.matchId && event.assignment) {
      const state = client.data as SocketState;
      if (
        state.matchId === event.matchId &&
        state.playerId === event.assignment.playerId
      ) {
        return;
      }
      this.emitMatchmakingStatus(client, event);
      await this.bindAssignedMatchmaking(client, undefined, undefined, event);
      return;
    }
    this.emitMatchmakingStatus(client, event);
    if (
      event.state === 'cancelled' ||
      event.state === 'timed_out' ||
      event.state === 'failed'
    ) {
      const state = client.data as SocketState;
      if (state.ticketId === event.ticketId) {
        state.ticketId = undefined;
      }
      this.queueSockets.delete(event.ticketId);
      // Solo lobby abort deletes the match — drop the seat binding so the
      // client can return to home and enqueue again.
      if (state.matchId || state.playerId) {
        await this.clearClientBinding(client);
      }
    }
  }

  private async resolveMatchmakingClient(
    event: MatchmakingStatusEvent,
  ): Promise<Socket | undefined> {
    const queuedSocketId = this.queueSockets.get(event.ticketId);
    if (queuedSocketId) {
      return this.server?.sockets?.sockets?.get(queuedSocketId);
    }
    const playerId = event.assignment?.playerId;
    if (!playerId) {
      return undefined;
    }
    for (const [key, socketId] of this.connectionLeases) {
      if (!key.endsWith(`:${playerId}`)) {
        continue;
      }
      return this.server?.sockets?.sockets?.get(socketId);
    }
    return undefined;
  }

  private async bindAssignedMatchmaking(
    client: Socket,
    commandId: string | undefined,
    correlationId: string | undefined,
    status: MatchmakingStatusEvent,
  ): Promise<void> {
    if (!status.matchId || !status.assignment) {
      return;
    }
    const matchId = status.matchId;
    const { playerId, resumeToken } = status.assignment;
    const state = client.data as SocketState;
    if (state.matchId === matchId && state.playerId === playerId) {
      // Keep queueSockets + ticketId until lobby starts or search times out
      // so solo-abort timed_out can still reach this socket.
      return;
    }
    // Keep ticketId/queueSockets for open-lobby fill abort.
    if (this.isSocketGone(client)) {
      await this.matches.abandonOrphanedJoin(matchId, playerId);
      return;
    }
    await this.finalizeSeatBind(
      client,
      commandId,
      correlationId,
      matchId,
      playerId,
      resumeToken,
    );
  }

  private async finalizeSeatBind(
    client: Socket,
    commandId: string | undefined,
    correlationId: string | undefined,
    matchId: string,
    playerId: string,
    resumeToken: string,
  ): Promise<void> {
    if (this.isSocketGone(client)) {
      await this.matches.abandonOrphanedJoin(matchId, playerId);
      return;
    }
    if (!this.tryBindSession(client, matchId, playerId)) {
      await this.matches.abandonOrphanedJoin(matchId, playerId);
      return;
    }
    await client.join(this.room(matchId));
    // Rematch party seats (and other concurrent joins) can change the lobby
    // while this socket was still unbound. Room broadcasts during that gap are
    // missed — re-read after join so the bind snapshot matches the live table.
    const { snapshot } = await this.matches.requestSnapshot(matchId, playerId);
    this.emitToClient(
      client,
      MessageTypes.SessionAccepted,
      { matchId, playerId, resumeToken },
      { commandId, correlationId, matchId },
    );
    this.emitToClient(client, MessageTypes.MatchSnapshot, snapshot, {
      commandId,
      correlationId,
      matchId,
      sequence: snapshot.sequence,
    });
    if (this.isSocketGone(client)) {
      this.releaseLeaseIfOwned(client, matchId, playerId);
      await this.matches.abandonOrphanedJoin(matchId, playerId);
      return;
    }
    const leaseKey = this.leaseKey(matchId, playerId);
    await this.matches.finalizeJoin(matchId, playerId, {
      stillOwnsLease: () => this.connectionLeases.get(leaseKey) === client.id,
    });
    if (this.connectionLeases.get(leaseKey) == null) {
      await this.matches.abandonOrphanedJoin(matchId, playerId);
    }
  }

  private emitMatchmakingStatus(
    client: Socket,
    status: MatchmakingStatusEvent,
    meta?: { commandId?: string; correlationId?: string },
  ): void {
    this.emitToClient(
      client,
      MessageTypes.MatchmakingStatus,
      {
        ticketId: status.ticketId,
        state: status.state,
        acceptedSeats: status.acceptedSeats,
        capacity: status.capacity,
        timeoutAtMs: status.timeoutAtMs,
        matchId: status.matchId,
        serverNowMs: status.serverNowMs,
      },
      {
        commandId: meta?.commandId,
        correlationId: meta?.correlationId,
        matchId: status.matchId ?? undefined,
      },
    );
  }

  private publishBroadcast(broadcast: MatchBroadcast): void {
    const room = this.room(broadcast.matchId);
    for (const event of broadcast.events) {
      if (event.kind === 'sequence') {
        continue;
      }
      if (event.kind === 'challenge_started') {
        // Always room-broadcast start so countdown clients leave "0" even if a
        // connection lease is stale. Personalized overlays follow per lease.
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.ChallengeStarted,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: toPublicChallengeView(event.challenge, event.serverNowMs),
        });
        if (broadcast.personalizeSeats) {
          this.emitPersonalizedChallengeStarted(broadcast.matchId, event);
        }
      } else if (event.kind === 'challenge_signal') {
        const payload = {
          challengeInstanceId: event.challengeInstanceId,
          signalToken: event.signalToken,
          signaledAtMs: event.signaledAtMs,
          signalEndsAtMs: event.signalEndsAtMs,
          serverNowMs: event.serverNowMs,
          ...(event.playerId ? { playerId: event.playerId } : {}),
        };
        if (event.playerId) {
          // Seat-private: room-broadcast (unsequenced) so delivery does not
          // depend on connectionLeases — clients filter by playerId. Also
          // unicast when a lease exists as a low-latency fast path.
          this.server.to(room).emit('event', {
            schemaVersion: REALTIME_SCHEMA_VERSION,
            type: MessageTypes.ChallengeSignal,
            messageId: randomUUID(),
            matchId: broadcast.matchId,
            serverTimestampMs: event.serverTimestampMs,
            payload,
          });
          this.emitToPlayer(broadcast.matchId, event.playerId, {
            schemaVersion: REALTIME_SCHEMA_VERSION,
            type: MessageTypes.ChallengeSignal,
            messageId: randomUUID(),
            matchId: broadcast.matchId,
            serverTimestampMs: event.serverTimestampMs,
            payload,
          });
        } else {
          this.server.to(room).emit('event', {
            schemaVersion: REALTIME_SCHEMA_VERSION,
            type: MessageTypes.ChallengeSignal,
            messageId: randomUUID(),
            matchId: broadcast.matchId,
            serverSequence: event.sequence,
            serverTimestampMs: event.serverTimestampMs,
            payload,
          });
        }
      } else if (event.kind === 'challenge_signal_ended') {
        const payload = {
          challengeInstanceId: event.challengeInstanceId,
          signalEndsAtMs: event.signalEndsAtMs,
          serverNowMs: event.serverNowMs,
          ...(event.playerId ? { playerId: event.playerId } : {}),
        };
        if (event.playerId) {
          this.server.to(room).emit('event', {
            schemaVersion: REALTIME_SCHEMA_VERSION,
            type: MessageTypes.ChallengeSignalEnded,
            messageId: randomUUID(),
            matchId: broadcast.matchId,
            serverTimestampMs: event.serverTimestampMs,
            payload,
          });
          this.emitToPlayer(broadcast.matchId, event.playerId, {
            schemaVersion: REALTIME_SCHEMA_VERSION,
            type: MessageTypes.ChallengeSignalEnded,
            messageId: randomUUID(),
            matchId: broadcast.matchId,
            serverTimestampMs: event.serverTimestampMs,
            payload,
          });
        } else {
          this.server.to(room).emit('event', {
            schemaVersion: REALTIME_SCHEMA_VERSION,
            type: MessageTypes.ChallengeSignalEnded,
            messageId: randomUUID(),
            matchId: broadcast.matchId,
            serverSequence: event.sequence,
            serverTimestampMs: event.serverTimestampMs,
            payload,
          });
        }
      } else if (event.kind === 'challenge_resolved') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.ChallengeResolved,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            challengeInstanceId: event.challengeInstanceId,
            resolutions: event.resolutions,
          },
        });
      } else if (event.kind === 'match_finished') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.MatchFinished,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: { winnerId: event.winnerId },
        });
      } else if (event.kind === 'match_drawn') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.MatchDrawn,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {},
        });
      } else if (event.kind === 'power_granted') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PowerGranted,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            playerId: event.playerId,
            powerId: event.powerId,
            energyAfter: event.energyAfter,
          },
        });
      } else if (event.kind === 'power_inventory_full') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PowerInventoryFull,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            playerId: event.playerId,
            energyAfter: event.energyAfter,
          },
        });
      } else if (event.kind === 'power_offered') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PowerOffered,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            actorsWithOffensiveCharge: event.actorsWithOffensiveCharge,
            actionDeadlineAtMs: event.actionDeadlineAtMs,
          },
        });
      } else if (event.kind === 'power_used') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PowerUsed,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            attackId: event.attackId,
            attackerId: event.attackerId,
            targetId: event.targetId,
            powerId: 'danger_pulse',
          },
        });
      } else if (event.kind === 'power_defense_required') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PowerDefenseRequired,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            attackId: event.attackId,
            attackerId: event.attackerId,
            targetId: event.targetId,
            reflected: event.reflected,
            defenseDeadlineAtMs: event.defenseDeadlineAtMs,
          },
        });
      } else if (event.kind === 'power_resolved') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PowerResolved,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            attackId: event.attackId,
            attackerId: event.attackerId,
            targetId: event.targetId,
            outcome: event.outcome,
            heartsDeltaTarget: event.heartsDeltaTarget,
            heartsAfterTarget: event.heartsAfterTarget,
            statusAfterTarget: event.statusAfterTarget,
          },
        });
      } else if (
        event.kind === 'player_joined' ||
        event.kind === 'presence_changed'
      ) {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.PlayerPresence,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload:
            event.kind === 'player_joined'
              ? {
                  playerId: event.playerId,
                  presence: 'connected',
                  joined: true,
                }
              : {
                  playerId: event.playerId,
                  presence: event.presence,
                  joined: false,
                },
        });
      } else if (event.kind === 'unsafe_zero_survivors') {
        this.server.to(room).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.MatchStateChanged,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            status: 'resolving',
            reasonKey: 'errors.match.unsafe_zero_survivors',
          },
        });
      }
    }

    if (broadcast.personalizeSeats) {
      this.emitPersonalizedSnapshots(broadcast);
    } else {
      this.server.to(room).emit('event', {
        schemaVersion: REALTIME_SCHEMA_VERSION,
        type: MessageTypes.MatchSnapshot,
        messageId: randomUUID(),
        matchId: broadcast.matchId,
        serverSequence: broadcast.snapshot.sequence,
        serverTimestampMs: Date.now(),
        payload: broadcast.snapshot,
      });
    }
  }

  private emitPersonalizedChallengeStarted(
    matchId: string,
    event: Extract<
      import('../domain/types').DomainEvent,
      { kind: 'challenge_started' }
    >,
  ): void {
    for (const [key, socketId] of this.connectionLeases) {
      if (!key.startsWith(`${matchId}:`)) continue;
      const playerId = key.slice(matchId.length + 1);
      this.emitSocketEvent(socketId, {
        schemaVersion: REALTIME_SCHEMA_VERSION,
        type: MessageTypes.ChallengeStarted,
        messageId: randomUUID(),
        matchId,
        // Unsequenced so the client applies the seat overlay after the
        // room-wide start (equal sequence would otherwise be ignored).
        serverTimestampMs: event.serverTimestampMs,
        payload: toPublicChallengeView(
          event.challenge,
          event.serverNowMs,
          playerId,
        ),
      });
    }
  }

  private emitPersonalizedSnapshots(broadcast: MatchBroadcast): void {
    const byPlayer = broadcast.snapshotsByPlayerId ?? {};
    for (const [key, socketId] of this.connectionLeases) {
      if (!key.startsWith(`${broadcast.matchId}:`)) continue;
      const playerId = key.slice(broadcast.matchId.length + 1);
      const snapshot = byPlayer[playerId] ?? broadcast.snapshot;
      this.emitSocketEvent(socketId, {
        schemaVersion: REALTIME_SCHEMA_VERSION,
        type: MessageTypes.MatchSnapshot,
        messageId: randomUUID(),
        matchId: broadcast.matchId,
        serverSequence: snapshot.sequence,
        serverTimestampMs: Date.now(),
        payload: snapshot,
      });
    }
  }

  private emitToPlayer(
    matchId: string,
    playerId: string,
    envelope: Record<string, unknown>,
  ): void {
    const socketId = this.connectionLeases.get(
      this.leaseKey(matchId, playerId),
    );
    if (!socketId) return;
    this.emitSocketEvent(socketId, envelope);
  }

  /** Prefer the live Socket map; fall back to the socket-id room. */
  private emitSocketEvent(
    socketId: string,
    envelope: Record<string, unknown>,
  ): void {
    const socket = this.server?.sockets?.sockets?.get(socketId);
    if (socket) {
      socket.emit('event', envelope);
      return;
    }
    this.server?.to(socketId)?.emit('event', envelope);
  }

  private emitToClient(
    client: Socket,
    type: string,
    payload: unknown,
    meta: {
      commandId?: string;
      correlationId?: string;
      matchId?: string;
      sequence?: number;
    },
  ): void {
    client.emit('event', {
      schemaVersion: REALTIME_SCHEMA_VERSION,
      type,
      messageId: randomUUID(),
      matchId: meta.matchId,
      commandId: meta.commandId,
      correlationId: meta.correlationId,
      serverSequence: meta.sequence,
      serverTimestampMs: Date.now(),
      payload,
    });
  }

  private emitDomainError(
    client: Socket,
    error: DomainError,
    commandId?: string,
  ): void {
    const map: Record<string, { code: string; key: string }> = {
      MATCH_FULL: { code: 'MATCH_FULL', key: 'errors.match.full' },
      MATCH_NOT_JOINABLE: {
        code: 'MATCH_NOT_JOINABLE',
        key: 'errors.match.not_joinable',
      },
      MATCH_NOT_FOUND: {
        code: 'MATCH_NOT_FOUND',
        key: 'errors.match.not_found',
      },
      CHALLENGE_NOT_ACTIVE: {
        code: 'CHALLENGE_NOT_ACTIVE',
        key: 'errors.match.challenge_not_active',
      },
      SPECTATOR_CANNOT_SUBMIT: {
        code: 'SPECTATOR_CANNOT_SUBMIT',
        key: 'errors.match.spectator_cannot_submit',
      },
      SUBMISSION_LATE: {
        code: 'SUBMISSION_LATE',
        key: 'errors.match.submission_late',
      },
      PLAYER_NOT_FOUND: {
        code: 'UNAUTHORIZED',
        key: 'errors.protocol.unauthorized',
      },
      INVALID_DEFINITION: {
        code: 'DEV_ONLY_FORBIDDEN',
        key: 'errors.protocol.dev_only_forbidden',
      },
      DEV_ONLY_FORBIDDEN: {
        code: 'DEV_ONLY_FORBIDDEN',
        key: 'errors.protocol.dev_only_forbidden',
      },
      ROOM_CODE_INVALID: {
        code: 'ROOM_CODE_INVALID',
        key: 'errors.room.code_invalid',
      },
      ROOM_CODE_EXPIRED: {
        code: 'ROOM_CODE_EXPIRED',
        key: 'errors.room.code_expired',
      },
      ROOM_FULL: { code: 'ROOM_FULL', key: 'errors.room.full' },
      QUEUE_CANCELLED: {
        code: 'QUEUE_CANCELLED',
        key: 'errors.queue.cancelled',
      },
      QUEUE_TIMEOUT: { code: 'QUEUE_TIMEOUT', key: 'errors.queue.timeout' },
      QUEUE_NOT_FOUND: {
        code: 'QUEUE_NOT_FOUND',
        key: 'errors.queue.not_found',
      },
      ALREADY_IN_QUEUE: {
        code: 'ALREADY_IN_QUEUE',
        key: 'errors.queue.already_in_queue',
      },
      ALREADY_IN_MATCH: {
        code: 'ALREADY_IN_MATCH',
        key: 'errors.match.already_in_match',
      },
      NOT_IN_MATCH: { code: 'NOT_IN_MATCH', key: 'errors.match.not_in_match' },
      NOT_HOST: { code: 'NOT_HOST', key: 'errors.match.not_host' },
      NOT_ENOUGH_PLAYERS: {
        code: 'NOT_ENOUGH_PLAYERS',
        key: 'errors.match.not_enough_players',
      },
      REMATCH_UNAVAILABLE: {
        code: 'REMATCH_UNAVAILABLE',
        key: 'errors.match.rematch_unavailable',
      },
      MATCHMAKING_PAUSED: {
        code: 'MATCHMAKING_PAUSED',
        key: 'errors.queue.paused',
      },
      TRAINING_UNAVAILABLE: {
        code: 'TRAINING_UNAVAILABLE',
        key: 'errors.training.unavailable',
      },
      NOT_LOBBY: { code: 'MATCH_NOT_JOINABLE', key: 'errors.match.not_lobby' },
      POWER_NOT_AVAILABLE: {
        code: 'POWER_NOT_AVAILABLE',
        key: 'errors.power.not_available',
      },
      POWER_PHASE_INVALID: {
        code: 'POWER_PHASE_INVALID',
        key: 'errors.power.phase_invalid',
      },
      ILLEGAL_POWER_TARGET: {
        code: 'ILLEGAL_POWER_TARGET',
        key: 'errors.power.illegal_target',
      },
      POWER_ATTACK_NOT_FOUND: {
        code: 'POWER_ATTACK_NOT_FOUND',
        key: 'errors.power.attack_not_found',
      },
      OFFENSIVE_POWERS_DISABLED: {
        code: 'OFFENSIVE_POWERS_DISABLED',
        key: 'errors.power.offensive_disabled',
      },
      DISPLAY_NAME_TAKEN: {
        code: 'DISPLAY_NAME_TAKEN',
        key: 'errors.identity.name_taken',
      },
      DISPLAY_NAME_PROHIBITED: {
        code: 'DISPLAY_NAME_PROHIBITED',
        key: 'errors.identity.name_prohibited',
      },
      DISPLAY_NAME_INVALID: {
        code: 'DISPLAY_NAME_INVALID',
        key: 'errors.identity.name_invalid',
      },
      APP_UPDATE_REQUIRED: {
        code: 'APP_UPDATE_REQUIRED',
        key: 'errors.app.update_required',
      },
      CLIENT_VERSION_MISSING: {
        code: 'CLIENT_VERSION_MISSING',
        key: 'errors.app.version_missing',
      },
      CLIENT_VERSION_INVALID: {
        code: 'CLIENT_VERSION_INVALID',
        key: 'errors.app.version_invalid',
      },
      PRIVATE_ROOM_VERSION_CLIENT_OLDER: {
        code: 'PRIVATE_ROOM_VERSION_CLIENT_OLDER',
        key: 'errors.room.version_client_older',
      },
      PRIVATE_ROOM_VERSION_CLIENT_NEWER: {
        code: 'PRIVATE_ROOM_VERSION_CLIENT_NEWER',
        key: 'errors.room.version_client_newer',
      },
      MATCH_RESUME_VERSION_MISMATCH: {
        code: 'MATCH_RESUME_VERSION_MISMATCH',
        key: 'errors.match.resume_version_mismatch',
      },
      NO_COMPATIBLE_CHALLENGES_FOR_APP_VERSION: {
        code: 'NO_COMPATIBLE_CHALLENGES_FOR_APP_VERSION',
        key: 'errors.match.no_compatible_challenges',
      },
      STALE_VERSION_POLICY: {
        code: 'INTERNAL_ERROR',
        key: 'errors.protocol.internal',
      },
    };
    const mapped = map[error.code] ?? {
      code: 'INTERNAL_ERROR',
      key: 'errors.protocol.internal',
    };
    this.emitError(client, mapped.code, mapped.key, {
      commandId,
      details: error.details,
    });
  }

  private emitError(
    client: Socket,
    code: string,
    messageKey: string,
    options?: {
      commandId?: string;
      details?: DomainError['details'];
    },
  ): void {
    client.emit('event', {
      schemaVersion: REALTIME_SCHEMA_VERSION,
      type: MessageTypes.ProtocolError,
      messageId: randomUUID(),
      serverTimestampMs: Date.now(),
      payload: {
        code,
        messageKey,
        ...(options?.commandId ? { commandId: options.commandId } : {}),
        ...(options?.details ? { details: options.details } : {}),
      },
    });
  }

  /**
   * Register immutable socket runtime metadata. Rejects mutation of an already
   * bound version and applies mandatory-update policy.
   */
  private async bindSocketRuntime(
    client: Socket,
    payload: {
      appVersion?: string;
      buildNumber?: string;
      platform?: ClientPlatform;
      playerId?: string;
    },
    commandId: string,
  ): Promise<boolean> {
    const state = client.data as SocketState;
    if (
      state.appVersion != null &&
      payload.appVersion != null &&
      state.appVersion !== payload.appVersion
    ) {
      this.emitError(
        client,
        'CLIENT_VERSION_INVALID',
        'errors.app.version_invalid',
        {
          commandId,
        },
      );
      return false;
    }
    const admission = await this.appVersions.admitRuntimeMetadata({
      appVersion: payload.appVersion ?? state.appVersion,
      buildNumber: payload.buildNumber ?? state.buildNumber,
      platform: payload.platform ?? state.platform,
    });
    if (!admission.ok) {
      this.emitDomainError(client, admission.error, commandId);
      return false;
    }
    if (state.appVersion == null) {
      this.appVersions.registerSessionVersion(admission.metadata.appVersion);
    }
    state.appVersion = admission.metadata.appVersion;
    state.buildNumber = admission.metadata.buildNumber;
    state.platform = admission.metadata.platform;
    if (payload.playerId) {
      void this.appVersions.recordPlayerLastSeen(
        payload.playerId,
        admission.metadata,
      );
    }
    return true;
  }

  /**
   * Serialize identity-changing commands per socket. Prior failures must not
   * block subsequent commands (catch-through).
   */
  private enqueueIdentity<T>(
    client: Socket,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.socketIdentityQueues.get(client.id) ?? Promise.resolve();
    const run = previous.then(
      () => task(),
      () => task(),
    );
    this.socketIdentityQueues.set(
      client.id,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  /** Join requires a fully unbound socket (one identity per socket). */
  private ensureUnbound(client: Socket): boolean {
    const state = client.data as SocketState;
    return !state.matchId && !state.playerId && !state.ticketId;
  }

  private isSocketGone(client: Socket): boolean {
    const state = client.data as SocketState;
    return Boolean(state.disconnected) || !client.connected;
  }

  /**
   * Tear down a prior player binding before create_dev (Play Again) or queue
   * abort. Quick-survival lobby seats are freed (not left as disconnected
   * ghosts); other modes mark disconnected so resume tokens remain valid.
   */
  private async clearClientBinding(client: Socket): Promise<void> {
    const state = client.data as SocketState;
    const matchId = state.matchId;
    const playerId = state.playerId;
    if (!matchId) {
      return;
    }

    if (playerId) {
      const key = this.leaseKey(matchId, playerId);
      if (this.connectionLeases.get(key) === client.id) {
        // Pause for race tests: another socket may resume before we disconnect.
        if (this.clearBindingBarrierForTests) {
          await this.clearBindingBarrierForTests();
        }
        // Re-check after barrier: resume may have taken the lease.
        if (this.connectionLeases.get(key) === client.id) {
          const canLeaveLobby = await this.matches.canLeaveLobbySeat(matchId);
          if (canLeaveLobby && this.connectionLeases.get(key) === client.id) {
            try {
              const left = await this.matches.leaveMatch(matchId, playerId);
              this.matchmaking.releaseTicketForPlayer(playerId);
              this.matchmaking.onLobbyCompositionChanged(matchId, {
                emptied: left.emptied,
                lobbyFillWaitMs: left.lobbyFillWaitMs,
              });
            } catch {
              if (this.connectionLeases.get(key) === client.id) {
                await this.matches.markDisconnected(matchId, playerId, {
                  stillOwnsLease: () =>
                    this.connectionLeases.get(key) === client.id,
                });
              }
            }
          } else if (this.connectionLeases.get(key) === client.id) {
            await this.matches.markDisconnected(matchId, playerId, {
              stillOwnsLease: () =>
                this.connectionLeases.get(key) === client.id,
            });
          }
          if (this.connectionLeases.get(key) === client.id) {
            this.connectionLeases.delete(key);
          }
        }
      }
    }

    await client.leave(this.room(matchId));
    const disconnected = state.disconnected;
    (client.data as SocketState) = disconnected ? { disconnected: true } : {};
  }

  private releaseLeaseIfOwned(
    client: Socket,
    matchId: string,
    playerId: string,
  ): void {
    const key = this.leaseKey(matchId, playerId);
    if (this.connectionLeases.get(key) === client.id) {
      this.connectionLeases.delete(key);
    }
  }

  /**
   * Bind identity only while the socket is still live. Returns false if the
   * socket disconnected (no lease left behind).
   */
  private tryBindSession(
    client: Socket,
    matchId: string,
    playerId: string,
  ): boolean {
    if (this.isSocketGone(client)) {
      return false;
    }

    const targetKey = this.leaseKey(matchId, playerId);
    const state = client.data as SocketState;

    // Release any prior lease this socket owned (never leave a ghost lease).
    for (const [key, socketId] of this.connectionLeases) {
      if (socketId === client.id && key !== targetKey) {
        this.connectionLeases.delete(key);
      }
    }
    if (
      state.matchId &&
      state.playerId &&
      (state.matchId !== matchId || state.playerId !== playerId)
    ) {
      const prevKey = this.leaseKey(state.matchId, state.playerId);
      if (this.connectionLeases.get(prevKey) === client.id) {
        this.connectionLeases.delete(prevKey);
      }
      void client.leave(this.room(state.matchId));
    }

    const previousSocketId = this.connectionLeases.get(targetKey);
    if (previousSocketId && previousSocketId !== client.id) {
      const previous = this.server.sockets.sockets.get(previousSocketId);
      if (previous) {
        (previous.data as SocketState) = {};
        void previous.leave(this.room(matchId));
      }
    }

    // Write client.data before lease so disconnect cleanup always sees identity.
    state.matchId = matchId;
    state.playerId = playerId;
    this.connectionLeases.set(targetKey, client.id);

    // Final race check: disconnect may have landed during the bind writes.
    if (this.isSocketGone(client)) {
      if (this.connectionLeases.get(targetKey) === client.id) {
        this.connectionLeases.delete(targetKey);
      }
      state.matchId = undefined;
      state.playerId = undefined;
      return false;
    }
    return true;
  }

  private ownsLease(
    client: Socket,
    matchId: string,
    playerId: string,
  ): boolean {
    return (
      this.connectionLeases.get(this.leaseKey(matchId, playerId)) === client.id
    );
  }

  /**
   * Rebind a live socket whose lease was dropped (reconnect / adapter miss)
   * so snapshot recovery can still leave ready_countdown.
   */
  private tryReclaimLease(
    client: Socket,
    matchId: string,
    playerId: string,
  ): boolean {
    if (this.isSocketGone(client)) {
      return false;
    }
    const key = this.leaseKey(matchId, playerId);
    const ownerId = this.connectionLeases.get(key);
    if (ownerId && ownerId !== client.id) {
      const ownerAlive = this.server?.sockets?.sockets?.has(ownerId) === true;
      if (ownerAlive) {
        return false;
      }
    }
    this.connectionLeases.set(key, client.id);
    return this.ownsLease(client, matchId, playerId);
  }

  private leaseKey(matchId: string, playerId: string): string {
    return `${matchId}:${playerId}`;
  }

  private room(matchId: string): string {
    return `match:${matchId}`;
  }

  /** Test helper: inspect lease ownership without exposing the map. */
  getLeaseOwnerForTests(matchId: string, playerId: string): string | undefined {
    return this.connectionLeases.get(this.leaseKey(matchId, playerId));
  }

  /** Test helper: drop a lease without disconnect (stale-finalize races). */
  forceReleaseLeaseForTests(matchId: string, playerId: string): void {
    this.connectionLeases.delete(this.leaseKey(matchId, playerId));
  }

  /** Test helper: true when any lease still points at this socket id. */
  hasLeaseForSocketForTests(socketId: string): boolean {
    for (const owner of this.connectionLeases.values()) {
      if (owner === socketId) {
        return true;
      }
    }
    return false;
  }

  /** Test helper: observe server-side disconnect without sleeps. */
  setDisconnectHookForTests(
    hook: ((socketId: string) => void) | undefined,
  ): void {
    this.disconnectHookForTests = hook;
  }

  /**
   * Test helper: pause clearClientBinding after confirming lease ownership and
   * before markDisconnected (deterministic create_dev vs resume races).
   */
  setClearBindingBarrierForTests(
    hook: (() => Promise<void>) | undefined,
  ): void {
    this.clearBindingBarrierForTests = hook;
  }

  /** Test helper: whether a socket is currently in a match room. */
  isSocketInMatchRoomForTests(socketId: string, matchId: string): boolean {
    const socket = this.server?.sockets?.sockets?.get(socketId);
    return socket?.rooms.has(this.room(matchId)) ?? false;
  }
}
