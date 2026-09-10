import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MessageTypes,
  REALTIME_SCHEMA_VERSION,
  matchSnapshotPayloadSchema,
  safeParseServerEvent,
  serverEventSchema,
} from '@thelastheart/contracts';
import { AppModule } from '../src/app.module';
import { MatchService } from '../src/match/services/match.service';
import { FakeClock } from '../src/match/domain/types';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type ServerEvent = {
  schemaVersion?: string;
  type: string;
  messageId?: string;
  matchId?: string;
  commandId?: string;
  correlationId?: string;
  serverSequence?: number;
  serverTimestampMs?: number;
  payload?: Record<string, unknown>;
};

type TrackedSocket = {
  socket: Socket;
  events: ServerEvent[];
};

async function connectTracked(port: number): Promise<TrackedSocket> {
  const socket = io(`http://127.0.0.1:${port}`, {
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

function sendCommand(
  socket: Socket,
  type: string,
  payload: unknown,
  commandId = randomUUID(),
) {
  socket.emit('command', {
    schemaVersion: REALTIME_SCHEMA_VERSION,
    type,
    messageId: randomUUID(),
    commandId,
    payload,
  });
  return commandId;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForType(
  tracked: TrackedSocket,
  type: string,
  options?: { afterIndex?: number; timeoutMs?: number },
): Promise<ServerEvent> {
  const afterIndex = options?.afterIndex ?? -1;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const started = Date.now();
  for (;;) {
    const found = tracked.events.find(
      (event, index) => event.type === type && index > afterIndex,
    );
    if (found) {
      return found;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for ${type}; saw=${tracked.events.map((e) => e.type).join(',')}`,
      );
    }
    await sleep(20);
  }
}

async function waitForCount(
  tracked: TrackedSocket,
  type: string,
  count: number,
  timeoutMs = 8000,
): Promise<ServerEvent> {
  const started = Date.now();
  for (;;) {
    const matches = tracked.events.filter((event) => event.type === type);
    if (matches.length >= count) {
      return matches[count - 1]!;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for ${count}x ${type}; have=${matches.length}; saw=${tracked.events.map((e) => e.type).join(',')}`,
      );
    }
    await sleep(20);
  }
}

function assertParses(event: ServerEvent): void {
  const parsed = safeParseServerEvent(event);
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(serverEventSchema.safeParse(parsed.data).success).toBe(true);
  }
}

describe('MatchGateway integration', () => {
  let app: INestApplication;
  let port: number;
  let matchService: MatchService;
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

    const clock = new FakeClock(2_000_000);
    matchService = MatchService.forTests({ clock, nodeEnv: 'test' });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MatchService)
      .useValue(matchService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0);
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

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.removeAllListeners();
      if (socket.connected) {
        socket.disconnect();
      }
      socket.close();
    }
    openSockets.length = 0;
    matchService.onModuleDestroy();
    await app.close();
    process.env = previousEnv;
  });

  async function tracked(): Promise<TrackedSocket> {
    const client = await connectTracked(port);
    openSockets.push(client.socket);
    return client;
  }

  it('runs six clients through ordered challenge lifecycle with convergence', async () => {
    const clients: TrackedSocket[] = [];
    for (let i = 0; i < 6; i += 1) {
      clients.push(await tracked());
    }

    sendCommand(clients[0]!.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(
      clients[0]!,
      MessageTypes.SessionAccepted,
    );
    assertParses(created);
    const matchId = asString(created.payload?.['matchId']);
    expect(matchId).toBeTruthy();

    const sessions: Array<{
      tracked: TrackedSocket;
      playerId: string;
      resumeToken?: string;
    }> = [];

    for (let i = 0; i < 6; i += 1) {
      const client = clients[i]!;
      const before = client.events.length - 1;
      sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
      const accepted = await waitForType(client, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
      assertParses(accepted);
      const acceptedIndex = client.events.indexOf(accepted);
      const snapshot = await waitForType(client, MessageTypes.MatchSnapshot, {
        afterIndex: acceptedIndex,
      });
      assertParses(snapshot);
      expect(
        matchSnapshotPayloadSchema.safeParse(snapshot.payload).success,
      ).toBe(true);
      // session.accepted must precede the joiner's authoritative snapshot.
      expect(acceptedIndex).toBeLessThan(client.events.indexOf(snapshot));
      expect(JSON.stringify(snapshot.payload)).not.toContain('serverConfig');
      expect(JSON.stringify(snapshot.payload)).not.toContain('expectedChoice');
      sessions.push({
        tracked: client,
        playerId: asString(accepted.payload?.['playerId']),
        resumeToken: accepted.payload?.['resumeToken'] as string | undefined,
      });
    }

    for (let round = 0; round < 3; round += 1) {
      const started = await waitForCount(
        clients[0]!,
        MessageTypes.ChallengeStarted,
        round + 1,
      );
      assertParses(started);
      expect(started.payload?.['definitionId']).toBeTruthy();
      expect(Number(started.payload?.['definitionVersion'])).toBeGreaterThan(0);
      expect(started.payload?.['clientConfig']).toEqual({ fixtureMode: true });
      expect(JSON.stringify(started.payload)).not.toContain('serverConfig');
      expect(JSON.stringify(started.payload)).not.toContain('expectedChoice');

      const challengeInstanceId = asString(
        started.payload?.['challengeInstanceId'],
      );
      expect(
        Number(started.payload?.['deadlineAtMs']) -
          Number(started.payload?.['startsAtMs']),
      ).toBe(3000);

      sendCommand(sessions[0]!.tracked.socket, MessageTypes.MatchSubmitAnswer, {
        challengeInstanceId,
        answer: { choice: 'a' },
      });
      for (let i = 1; i < 6; i += 1) {
        sendCommand(
          sessions[i]!.tracked.socket,
          MessageTypes.MatchSubmitAnswer,
          {
            challengeInstanceId,
            answer: { choice: 'b' },
          },
        );
      }

      await waitForCount(
        clients[0]!,
        MessageTypes.ChallengeResolved,
        round + 1,
      );
    }

    const finished = await waitForType(clients[0]!, MessageTypes.MatchFinished);
    assertParses(finished);
    expect(finished.payload?.['winnerId']).toBe(sessions[0]!.playerId);

    // Every collected server event from the winner socket must parse.
    for (const event of clients[0]!.events) {
      assertParses(event);
    }

    const snapshots: unknown[] = [];
    for (const session of sessions) {
      const before = session.tracked.events.length - 1;
      sendCommand(session.tracked.socket, MessageTypes.MatchRequestSnapshot, {
        matchId,
      });
      const snap = await waitForType(
        session.tracked,
        MessageTypes.MatchSnapshot,
        { afterIndex: before },
      );
      assertParses(snap);
      expect(matchSnapshotPayloadSchema.safeParse(snap.payload).success).toBe(
        true,
      );
      snapshots.push(snap.payload);
    }
    const first = JSON.stringify(snapshots[0]);
    for (const snap of snapshots) {
      expect(JSON.stringify(snap)).toBe(first);
    }

    const errBefore = clients[1]!.events.length - 1;
    clients[1]!.socket.emit('command', { nope: true });
    const protocolError = await waitForType(
      clients[1]!,
      MessageTypes.ProtocolError,
      {
        afterIndex: errBefore,
      },
    );
    assertParses(protocolError);
    expect(clients[0]!.socket.connected).toBe(true);
  }, 30000);

  it('does not regress serverSequence for the final submitter across resolve and continue', async () => {
    const clients: TrackedSocket[] = [];
    for (let i = 0; i < 6; i += 1) {
      clients.push(await tracked());
    }
    sendCommand(clients[0]!.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(
      clients[0]!,
      MessageTypes.SessionAccepted,
    );
    const matchId = asString(created.payload?.['matchId']);

    for (const client of clients) {
      const before = client.events.length - 1;
      sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
      await waitForType(client, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
    }

    // Challenge broadcast reaches already-joined room members (not necessarily the 6th).
    const started = await waitForType(
      clients[0]!,
      MessageTypes.ChallengeStarted,
    );
    const challengeInstanceId = asString(
      started.payload?.['challengeInstanceId'],
    );
    const finalClient = clients[5]!;
    const mark = finalClient.events.length - 1;

    for (let i = 0; i < 5; i += 1) {
      sendCommand(clients[i]!.socket, MessageTypes.MatchSubmitAnswer, {
        challengeInstanceId,
        answer: { choice: 'b' },
      });
    }
    sendCommand(finalClient.socket, MessageTypes.MatchSubmitAnswer, {
      challengeInstanceId,
      answer: { choice: 'a' },
    });

    const resolved = await waitForType(
      finalClient,
      MessageTypes.ChallengeResolved,
      { afterIndex: mark },
    );
    const continued = await waitForType(
      finalClient,
      MessageTypes.ChallengeStarted,
      { afterIndex: finalClient.events.indexOf(resolved) },
    );
    const ack = await waitForType(
      finalClient,
      MessageTypes.ChallengeSubmissionAck,
      { afterIndex: mark },
    );

    assertParses(resolved);
    assertParses(continued);
    assertParses(ack);
    expect(typeof resolved.serverSequence).toBe('number');
    expect(typeof continued.serverSequence).toBe('number');
    expect(continued.serverSequence!).toBeGreaterThan(resolved.serverSequence!);
    // ACK is command-only — must omit sequence (or would need latest).
    expect(ack.serverSequence).toBeUndefined();

    const sequenced = finalClient.events
      .slice(mark + 1)
      .filter((event) => typeof event.serverSequence === 'number');
    let last = -1;
    for (const event of sequenced) {
      expect(event.serverSequence!).toBeGreaterThanOrEqual(last);
      last = event.serverSequence!;
    }
  }, 20000);

  it('rejects unbound and cross-match snapshot requests', async () => {
    const unbound = await tracked();
    sendCommand(unbound.socket, MessageTypes.MatchRequestSnapshot, {
      matchId: randomUUID(),
    });
    const unboundError = await waitForType(unbound, MessageTypes.ProtocolError);
    expect(unboundError.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(unboundError);

    const a = await tracked();
    const b = await tracked();
    sendCommand(a.socket, MessageTypes.MatchCreateDev, {});
    const createdA = await waitForType(a, MessageTypes.SessionAccepted);
    const matchA = asString(createdA.payload?.['matchId']);
    sendCommand(a.socket, MessageTypes.MatchJoin, { matchId: matchA });
    await waitForType(a, MessageTypes.SessionAccepted, {
      afterIndex: a.events.indexOf(createdA),
    });

    sendCommand(b.socket, MessageTypes.MatchCreateDev, {});
    const createdB = await waitForType(b, MessageTypes.SessionAccepted);
    const matchB = asString(createdB.payload?.['matchId']);
    sendCommand(b.socket, MessageTypes.MatchJoin, { matchId: matchB });
    await waitForType(b, MessageTypes.SessionAccepted, {
      afterIndex: b.events.indexOf(createdB),
    });

    const before = a.events.length - 1;
    sendCommand(a.socket, MessageTypes.MatchRequestSnapshot, {
      matchId: matchB,
    });
    const cross = await waitForType(a, MessageTypes.ProtocolError, {
      afterIndex: before,
    });
    expect(cross.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(cross);
  }, 15000);

  it('prevents one socket from binding multiple match sessions', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const first = await waitForType(client, MessageTypes.SessionAccepted);
    const matchA = asString(first.payload?.['matchId']);
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId: matchA });
    await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(first),
    });

    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const secondCreate = await waitForType(
      client,
      MessageTypes.SessionAccepted,
      {
        afterIndex: client.events.length - 2,
      },
    );
    const matchB = asString(secondCreate.payload?.['matchId']);
    const before = client.events.length - 1;
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId: matchB });
    const denied = await waitForType(client, MessageTypes.ProtocolError, {
      afterIndex: before,
    });
    expect(denied.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(denied);
  }, 15000);

  it('resume replaces the old connection and ignores stale disconnect', async () => {
    const original = await tracked();
    sendCommand(original.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(original, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);
    sendCommand(original.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(original, MessageTypes.SessionAccepted, {
      afterIndex: original.events.indexOf(created),
    });
    const playerId = asString(joined.payload?.['playerId']);
    const oldToken = asString(joined.payload?.['resumeToken']);
    expect(oldToken).toBeTruthy();

    const replacement = await tracked();
    sendCommand(replacement.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: oldToken,
    });
    const resumed = await waitForType(
      replacement,
      MessageTypes.SessionAccepted,
    );
    assertParses(resumed);
    expect(asString(resumed.payload?.['playerId'])).toBe(playerId);
    const newToken = asString(resumed.payload?.['resumeToken']);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    // Stale disconnect of the superseded socket must not mark player disconnected.
    original.socket.disconnect();
    await sleep(100);

    const beforeSnap = replacement.events.length - 1;
    sendCommand(replacement.socket, MessageTypes.MatchRequestSnapshot, {
      matchId,
    });
    const snap = await waitForType(replacement, MessageTypes.MatchSnapshot, {
      afterIndex: beforeSnap,
    });
    assertParses(snap);
    const players = snap.payload?.['players'] as Array<{
      playerId: string;
      presence: string;
    }>;
    const self = players.find((p) => p.playerId === playerId);
    expect(self?.presence).toBe('connected');

    // Old token is invalid after rotation.
    const stale = await tracked();
    sendCommand(stale.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: oldToken,
    });
    const staleError = await waitForType(stale, MessageTypes.ProtocolError);
    expect(staleError.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(staleError);
  }, 15000);

  it('maps challenge-not-active without INTERNAL_ERROR', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(client, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(created),
    });

    const before = client.events.length - 1;
    sendCommand(client.socket, MessageTypes.MatchSubmitAnswer, {
      challengeInstanceId: randomUUID(),
      answer: { choice: 'a' },
    });
    const error = await waitForType(client, MessageTypes.ProtocolError, {
      afterIndex: before,
    });
    expect(error.payload?.['code']).toBe('CHALLENGE_NOT_ACTIVE');
    expect(error.payload?.['code']).not.toBe('INTERNAL_ERROR');
    assertParses(error);
  }, 10000);
});
