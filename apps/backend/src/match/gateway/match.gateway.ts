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
    if (state.matchId && state.playerId) {
      const leaseKey = this.leaseKey(state.matchId, state.playerId);
      // Only the socket that currently owns the lease may mark disconnected.
      if (this.connectionLeases.get(leaseKey) === client.id) {
        this.connectionLeases.delete(leaseKey);
        await this.matches.markDisconnected(state.matchId, state.playerId);
      }
    }
    this.logger.log({
      event: 'socket_disconnected',
      socketId: client.id,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.connectionLeases.clear();
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
      const commandId = command.commandId;
      switch (command.type) {
        case MessageTypes.MatchCreateDev:
          await this.handleCreateDev(client, commandId, command.messageId);
          break;
        case MessageTypes.MatchJoin:
          await this.handleJoin(
            client,
            commandId,
            command.messageId,
            (command.payload as { matchId: string }).matchId,
          );
          break;
        case MessageTypes.MatchResume:
          await this.handleResume(
            client,
            commandId,
            command.messageId,
            command.payload as { matchId: string; resumeToken: string },
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
        default:
          this.emitError(
            client,
            'UNKNOWN_MESSAGE_TYPE',
            'errors.protocol.unknown_message_type',
          );
      }
    } catch (error) {
      if (error instanceof ProtocolValidationError) {
        this.emitError(client, error.code, error.messageKey);
        return;
      }
      if (error instanceof DomainError) {
        this.emitDomainError(client, error);
        return;
      }
      this.logger.error({
        event: 'command_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      this.emitError(client, 'INTERNAL_ERROR', 'errors.protocol.internal');
    }
  }

  private async handleCreateDev(
    client: Socket,
    commandId: string,
    correlationId: string,
  ): Promise<void> {
    const created = await this.matches.createDevMatch();
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
    if (!this.ensureUnboundOrSameMatch(client, matchId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
      return;
    }

    // Domain join first so lobby-fill broadcasts go only to already-bound
    // room members. Joiner receives session.accepted then an authoritative
    // snapshot (may miss earlier room events).
    const joined = await this.matches.joinMatch(matchId);
    this.bindSession(client, matchId, joined.playerId);
    await client.join(this.room(matchId));

    this.emitToClient(
      client,
      MessageTypes.SessionAccepted,
      {
        matchId,
        playerId: joined.playerId,
        // Resume token only to the owning socket — never broadcast.
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
  }

  private async handleResume(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { matchId: string; resumeToken: string },
  ): Promise<void> {
    if (!this.ensureUnboundOrSameMatch(client, payload.matchId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
      return;
    }

    const resumed = await this.matches.resumeMatch(
      payload.matchId,
      payload.resumeToken,
    );
    this.bindSession(client, payload.matchId, resumed.playerId);
    await client.join(this.room(payload.matchId));

    this.emitToClient(
      client,
      MessageTypes.SessionAccepted,
      {
        matchId: payload.matchId,
        playerId: resumed.playerId,
        // Rotated token — private to this socket only.
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
  }

  private async handleSubmit(
    client: Socket,
    commandId: string,
    correlationId: string,
    payload: { challengeInstanceId: string; answer: Record<string, unknown> },
  ): Promise<void> {
    const state = client.data as SocketState;
    if (!state.matchId || !state.playerId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
      return;
    }
    // Never log answer payloads.
    const result = await this.matches.submitAnswer({
      matchId: state.matchId,
      playerId: state.playerId,
      challengeInstanceId: payload.challengeInstanceId,
      commandId,
      answer: payload.answer,
    });

    // Command-only ACK: omit serverSequence so it cannot regress after
    // resolution / auto-continue state events already delivered.
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
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
      return;
    }
    if (state.matchId !== matchId) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
      return;
    }
    if (!this.ownsLease(client, state.matchId, state.playerId)) {
      this.emitError(client, 'UNAUTHORIZED', 'errors.protocol.unauthorized');
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

  private emitDomainError(client: Socket, error: DomainError): void {
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
    };
    const mapped = map[error.code] ?? {
      code: 'INTERNAL_ERROR',
      key: 'errors.protocol.internal',
    };
    this.emitError(client, mapped.code, mapped.key);
  }

  private emitError(client: Socket, code: string, messageKey: string): void {
    client.emit('event', {
      schemaVersion: REALTIME_SCHEMA_VERSION,
      type: MessageTypes.ProtocolError,
      messageId: randomUUID(),
      serverTimestampMs: Date.now(),
      payload: { code, messageKey },
    });
  }

  private ensureUnboundOrSameMatch(client: Socket, matchId: string): boolean {
    const state = client.data as SocketState;
    if (!state.matchId) {
      return true;
    }
    return state.matchId === matchId;
  }

  private bindSession(client: Socket, matchId: string, playerId: string): void {
    const key = this.leaseKey(matchId, playerId);
    const previousSocketId = this.connectionLeases.get(key);
    if (previousSocketId && previousSocketId !== client.id) {
      const previous = this.server.sockets.sockets.get(previousSocketId);
      if (previous) {
        // Clear binding so a delayed disconnect cannot override the new lease.
        (previous.data as SocketState) = {};
        void previous.leave(this.room(matchId));
      }
    }
    this.connectionLeases.set(key, client.id);
    const state = client.data as SocketState;
    state.matchId = matchId;
    state.playerId = playerId;
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
}
