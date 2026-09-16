import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PRESENCE_SCHEMA_VERSION,
  PresenceMessageTypes,
  safeParsePresenceOnlineCount,
} from '@thelastheart/contracts';
import { AppModule } from '../src/app.module';
import { PresenceService } from '../src/presence/presence.service';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

type ServerEvent = {
  type: string;
  payload?: Record<string, unknown>;
};

type TrackedSocket = {
  socket: Socket;
  events: ServerEvent[];
};

function sendHello(socket: Socket, clientId: string): void {
  socket.emit('command', {
    schemaVersion: PRESENCE_SCHEMA_VERSION,
    type: PresenceMessageTypes.Hello,
    messageId: randomUUID(),
    commandId: randomUUID(),
    payload: { clientId },
  });
}

async function connectPresence(port: number): Promise<TrackedSocket> {
  const socket = io(`http://127.0.0.1:${port}/presence`, {
    transports: ['websocket'],
    forceNew: true,
  });
  const events: ServerEvent[] = [];
  socket.on('event', (event: ServerEvent) => {
    events.push(event);
  });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (error) => reject(error));
  });
  return { socket, events };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCount(
  tracked: TrackedSocket,
  expected: number,
  timeoutMs = 4000,
): Promise<ServerEvent> {
  const started = Date.now();
  for (;;) {
    const found = [...tracked.events]
      .reverse()
      .find((event) => event.type === PresenceMessageTypes.OnlineCount);
    if (found && found.payload?.['count'] === expected) {
      return found;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for count=${expected}; saw=${JSON.stringify(tracked.events)}`,
      );
    }
    await sleep(20);
  }
}

describe('PresenceGateway integration', () => {
  let app: INestApplication;
  let port: number;
  let presence: PresenceService;
  const openSockets: Socket[] = [];
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.LOG_LEVEL = 'error';
    process.env.DATABASE_URL =
      'postgres://lh_local:x@127.0.0.1:5432/the_last_heart';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.HEALTH_CHECK_DEPENDENCIES = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0);
    presence = app.get(PresenceService);
    const httpServer = app.getHttpServer() as {
      address: () => unknown;
    };
    const rawAddress = httpServer.address();
    port =
      typeof rawAddress === 'object' &&
      rawAddress !== null &&
      'port' in rawAddress &&
      typeof (rawAddress as { port: unknown }).port === 'number'
        ? (rawAddress as { port: number }).port
        : 0;
  });

  afterEach(() => {
    for (const socket of openSockets) {
      socket.removeAllListeners();
      if (socket.connected) {
        socket.disconnect();
      }
      socket.close();
    }
    openSockets.length = 0;
    presence.resetForTests();
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.removeAllListeners();
      if (socket.connected) {
        socket.disconnect();
      }
      socket.close();
    }
    openSockets.length = 0;
    await app.close();
    process.env = previousEnv;
  });

  async function tracked(): Promise<TrackedSocket> {
    const client = await connectPresence(port);
    openSockets.push(client.socket);
    return client;
  }

  it('counts only hello’d foreground sockets and drops them on disconnect', async () => {
    const a = await tracked();
    const b = await tracked();

    sendHello(a.socket, 'client-aaaaaa');
    await waitForCount(a, 1);

    sendHello(b.socket, 'client-bbbbbb');
    const bEvent = await waitForCount(b, 2);
    const parsed = safeParsePresenceOnlineCount(bEvent);
    expect(parsed.success).toBe(true);
    await waitForCount(a, 2);

    a.socket.disconnect();
    await waitForCount(b, 1);

    const aAgain = await tracked();
    sendHello(aAgain.socket, 'client-aaaaaa');
    await waitForCount(aAgain, 2);
    await waitForCount(b, 2);
  });

  it('does not count a connected socket until hello', async () => {
    const silent = await tracked();
    const counted = await tracked();
    sendHello(counted.socket, 'client-counted');
    await waitForCount(counted, 1);
    const silentCounts = silent.events
      .filter((event) => event.type === PresenceMessageTypes.OnlineCount)
      .map((event) => event.payload?.['count']);
    expect(silentCounts.every((count) => count === 1)).toBe(true);
    expect(silentCounts).not.toContain(2);
  });

  it('keeps a unique client at count 1 across reconnect', async () => {
    const first = await tracked();
    sendHello(first.socket, 'client-unique1');
    await waitForCount(first, 1);

    const second = await tracked();
    sendHello(second.socket, 'client-unique1');
    await waitForCount(second, 1);

    first.socket.disconnect();
    await sleep(50);
    expect(
      second.events
        .filter((event) => event.type === PresenceMessageTypes.OnlineCount)
        .map((event) => event.payload?.['count']),
    ).not.toContain(0);
    await waitForCount(second, 1);
  });
});
