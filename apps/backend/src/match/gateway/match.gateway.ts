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
} from '@thelastheart/contracts';
import { DomainError } from '../domain/types';
import { toPublicChallengeView } from '../domain/match.engine';
import { MatchService, type MatchBroadcast } from '../services/match.service';

type SocketState = {
  playerId?: string;
  matchId?: string;
  /** Set synchronously on disconnect so pending binds cannot race. */
  disconnected?: boolean;
};

const MAX_MESSAGE_BYTES = 16_384;

@WebSocketGateway({
  cors: {
    origin: false,
  },
  maxHttpBufferSize: MAX_MESSAGE_BYTES,
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
  /** `${matchId}:${playerId}` -> current owning socket id */
  private readonly connectionLeases = new Map<string, string>();
  /**
   * Per-socket serialization for identity-changing commands
   * (create_dev / join / resume). Errors must not poison the chain.
   */
  private readonly socketIdentityQueues = new Map<string, Promise<unknown>>();
  private disconnectHookForTests: ((socketId: string) => void) | undefined;
  /** Test-only: pause clearClientBinding after ownership check, before disconnect. */
  private clearBindingBarrierForTests: (() => Promise<void>) | undefined;

  constructor(private readonly matches: MatchService) {}

  afterInit(): void {
    this.unsubscribe = this.matches.onBroadcast((broadcast) => {
      this.publishBroadcast(broadcast);
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

    const matchId = state.matchId;
    const playerId = state.playerId;
    if (matchId && playerId) {
      const key = this.leaseKey(matchId, playerId);
      // Lease-owner-aware: only disconnect while this socket still owns the lease.
      // Holding the lease until after the presence write prevents a concurrent
      // resume from being overwritten by a stale disconnect.
      if (this.connectionLeases.get(key) === client.id) {
        await this.matches.markDisconnected(matchId, playerId, {
          stillOwnsLease: () => this.connectionLeases.get(key) === client.id,
        });
        if (this.connectionLeases.get(key) === client.id) {
          this.connectionLeases.delete(key);
        }
      }
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
    this.connectionLeases.clear();
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
      if (size > MAX_MESSAGE_BYTES) {
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
    payload: { matchId: string; resumeToken: string },
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

    const resumed = await this.matches.resumeMatch({
      matchId: payload.matchId,
      resumeToken: payload.resumeToken,
      commandId,
      expectedPlayerId: state.playerId,
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
    const result = await this.matches.submitAnswer({
      matchId: state.matchId,
      playerId: state.playerId,
      challengeInstanceId: payload.challengeInstanceId,
      commandId,
      answer: payload.answer,
    });

    this.emitToClient(
      client,
      MessageTypes.ChallengeSubmissionAck,
      {
        accepted: result.ack.accepted,
        reasonKey: result.ack.reason
          ? `errors.match.submission_${result.ack.reason}`
          : undefined,
        duplicate: result.duplicate,
      },
      {
        commandId,
        correlationId,
        matchId: state.matchId,
      },
    );
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
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized', {
        commandId,
      });
      return;
    }
    const result = await this.matches.requestSnapshot(matchId);
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

  private publishBroadcast(broadcast: MatchBroadcast): void {
    for (const event of broadcast.events) {
      if (event.kind === 'sequence') {
        continue;
      }
      if (event.kind === 'challenge_started') {
        this.server.to(this.room(broadcast.matchId)).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.ChallengeStarted,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: toPublicChallengeView(event.challenge, event.serverNowMs),
        });
      } else if (event.kind === 'challenge_signal') {
        this.server.to(this.room(broadcast.matchId)).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.ChallengeSignal,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: {
            challengeInstanceId: event.challengeInstanceId,
            signalToken: event.signalToken,
            signaledAtMs: event.signaledAtMs,
            serverNowMs: event.serverNowMs,
          },
        });
      } else if (event.kind === 'challenge_resolved') {
        this.server.to(this.room(broadcast.matchId)).emit('event', {
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
        this.server.to(this.room(broadcast.matchId)).emit('event', {
          schemaVersion: REALTIME_SCHEMA_VERSION,
          type: MessageTypes.MatchFinished,
          messageId: randomUUID(),
          matchId: broadcast.matchId,
          serverSequence: event.sequence,
          serverTimestampMs: event.serverTimestampMs,
          payload: { winnerId: event.winnerId },
        });
      } else if (
        event.kind === 'player_joined' ||
        event.kind === 'presence_changed'
      ) {
        this.server.to(this.room(broadcast.matchId)).emit('event', {
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
        this.server.to(this.room(broadcast.matchId)).emit('event', {
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

    this.server.to(this.room(broadcast.matchId)).emit('event', {
      schemaVersion: REALTIME_SCHEMA_VERSION,
      type: MessageTypes.MatchSnapshot,
      messageId: randomUUID(),
      matchId: broadcast.matchId,
      serverSequence: broadcast.snapshot.sequence,
      serverTimestampMs: Date.now(),
      payload: broadcast.snapshot,
    });
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
    };
    const mapped = map[error.code] ?? {
      code: 'INTERNAL_ERROR',
      key: 'errors.protocol.internal',
    };
    this.emitError(client, mapped.code, mapped.key, { commandId });
  }

  private emitError(
    client: Socket,
    code: string,
    messageKey: string,
    options?: { commandId?: string },
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
      },
    });
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
    return !state.matchId && !state.playerId;
  }

  private isSocketGone(client: Socket): boolean {
    const state = client.data as SocketState;
    return Boolean(state.disconnected) || !client.connected;
  }

  /**
   * Tear down a prior player binding before create_dev (Play Again).
   * Marks the previous player disconnected only while this socket remains the
   * lease owner, then releases lease/room and clears socket identity.
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
          await this.matches.markDisconnected(matchId, playerId, {
            stillOwnsLease: () => this.connectionLeases.get(key) === client.id,
          });
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
