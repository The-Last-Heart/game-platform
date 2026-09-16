import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { Namespace, Socket } from 'socket.io';
import {
  PRESENCE_SCHEMA_VERSION,
  PresenceMessageTypes,
  ProtocolValidationError,
  parsePresenceHello,
} from '@thelastheart/contracts';
import { PresenceService } from './presence.service';

const MAX_INCOMING_COMMAND_BYTES = 4_096;
const MAX_SOCKET_PACKET_BYTES = 16_384;

@WebSocketGateway({
  namespace: '/presence',
  cors: {
    origin: false,
  },
  maxHttpBufferSize: MAX_SOCKET_PACKET_BYTES,
})
export class PresenceGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(PresenceGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(private readonly presence: PresenceService) {}

  handleDisconnect(client: Socket): void {
    const result = this.presence.goodbye(client.id);
    if (result.changed) {
      this.broadcastCount(result.count);
    }
  }

  @SubscribeMessage('command')
  onCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    try {
      const size = Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
      if (size > MAX_INCOMING_COMMAND_BYTES) {
        return;
      }
      const command = parsePresenceHello(body);
      const result = this.presence.hello(client.id, command.payload.clientId);
      if (result.changed) {
        this.broadcastCount(result.count);
      } else {
        this.emitCount(client, result.count);
      }
    } catch (error) {
      if (error instanceof ProtocolValidationError) {
        this.logger.debug({
          event: 'presence_hello_rejected',
          socketId: client.id,
          code: error.code,
        });
        return;
      }
      this.logger.warn({
        event: 'presence_hello_failed',
        socketId: client.id,
      });
    }
  }

  private broadcastCount(count: number): void {
    this.server.emit('event', this.countEnvelope(count));
  }

  private emitCount(client: Socket, count: number): void {
    client.emit('event', this.countEnvelope(count));
  }

  private countEnvelope(count: number) {
    return {
      schemaVersion: PRESENCE_SCHEMA_VERSION,
      type: PresenceMessageTypes.OnlineCount,
      messageId: randomUUID(),
      serverTimestampMs: Date.now(),
      payload: { count },
    };
  }
}
