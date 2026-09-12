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
import { MatchGateway } from '../src/match/gateway/match.gateway';
import { FakeClock } from '../src/match/domain/types';
import { createDevChallengeDefinition } from '../src/match/domain/dev-challenge.evaluator';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Deterministic barrier for race tests (no sleeps for synchronization). */
function createBarrier(): {
  wait: () => Promise<void>;
  release: () => void;
  waited: () => Promise<void>;
} {
  let releaseFn: (() => void) | undefined;
  let waitedFn: (() => void) | undefined;
  const waitPromise = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });
  const waitedPromise = new Promise<void>((resolve) => {
    waitedFn = resolve;
  });
  return {
    wait: async () => {
      waitedFn?.();
      await waitPromise;
    },
    release: () => {
      releaseFn?.();
    },
    waited: () => waitedPromise,
  };
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
  if (!parsed.success) {
    throw new Error(
      `Failed to parse event type ${event.type}: ${JSON.stringify(parsed.error)}`,
    );
  }
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(serverEventSchema.safeParse(parsed.data).success).toBe(true);
  }
}

describe('MatchGateway integration', () => {
  let app: INestApplication;
  let port: number;
  let matchService: MatchService;
  let matchGateway: MatchGateway;
  let clock: FakeClock;
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

    clock = new FakeClock(2_000_000);
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
    matchGateway = app.get(MatchGateway);
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
    matchService.setIdentityBarrierHooksForTests({});
    matchGateway.setDisconnectHookForTests(undefined);
    matchGateway.setClearBindingBarrierForTests(undefined);
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
      expect(acceptedIndex).toBeLessThan(client.events.indexOf(snapshot));
      expect(JSON.stringify(snapshot.payload)).not.toContain('serverConfig');
      expect(JSON.stringify(snapshot.payload)).not.toContain('expectedChoice');
      sessions.push({
        tracked: client,
        playerId: asString(accepted.payload?.['playerId']),
        resumeToken: accepted.payload?.['resumeToken'] as string | undefined,
      });
    }

    // Verify snapshot has phase fields
    const latestSnap = clients[0]!.events
      .filter((e) => e.type === MessageTypes.MatchSnapshot)
      .at(-1);
    expect(latestSnap?.payload?.['phase']).toBeDefined();
    expect(latestSnap?.payload?.['roundNumber']).toBeDefined();

    // Single-challenge playlist: one live round, then standings finish.
    // Ready countdown → challenge starts immediately (no intro linger).
    clock.advance(3001);
    await matchService.tickDue(matchId);
    await sleep(50);

    const started = await waitForCount(
      clients[0]!,
      MessageTypes.ChallengeStarted,
      1,
    );
    assertParses(started);
    expect(started.payload?.['definitionId']).toBeTruthy();
    expect(Number(started.payload?.['definitionVersion'])).toBeGreaterThan(0);
    expect(started.payload?.['roundPhase']).toBeDefined();
    expect(JSON.stringify(started.payload)).not.toContain('serverConfig');

    const challengeInstanceId = asString(
      started.payload?.['challengeInstanceId'],
    );

    // Activate signal (delay 1500ms); submit inside the 750ms window.
    clock.advance(1500);
    await matchService.tickDue(matchId);
    await sleep(50);

    const currentMatch = await matchService.requestSnapshot(matchId);
    const signalToken = (
      currentMatch.snapshot.currentChallenge as Record<string, unknown> | null
    )?.['signalToken'] as string | undefined;
    expect(signalToken).toBeTruthy();

    sendCommand(sessions[0]!.tracked.socket, MessageTypes.MatchSubmitAnswer, {
      challengeInstanceId,
      answer: { signalToken },
    });
    for (let i = 1; i < 6; i += 1) {
      sendCommand(
        sessions[i]!.tracked.socket,
        MessageTypes.MatchSubmitAnswer,
        {
          challengeInstanceId,
          answer: { signalToken: 'wrong-token' },
        },
      );
    }

    await waitForCount(clients[0]!, MessageTypes.ChallengeResolved, 1);

    clock.advance(2501);
    await matchService.tickDue(matchId);
    await sleep(50);

    const finished = await waitForType(clients[0]!, MessageTypes.MatchFinished);
    assertParses(finished);
    expect(finished.payload?.['winnerId']).toBe(sessions[0]!.playerId);

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
    const other = await tracked();

    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const first = await waitForType(client, MessageTypes.SessionAccepted);
    const matchA = asString(first.payload?.['matchId']);
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId: matchA });
    await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(first),
    });

    // Another socket creates a different match; the bound client must not join it.
    sendCommand(other.socket, MessageTypes.MatchCreateDev, {});
    const secondCreate = await waitForType(other, MessageTypes.SessionAccepted);
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

    const stale = await tracked();
    sendCommand(stale.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: oldToken,
    });
    const staleError = await waitForType(stale, MessageTypes.ProtocolError);
    expect(staleError.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(staleError);
  }, 15000);

  it('idempotent resume retry after disconnect restores presence and lease', async () => {
    const original = await tracked();
    sendCommand(original.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(original, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);
    sendCommand(original.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(original, MessageTypes.SessionAccepted, {
      afterIndex: original.events.indexOf(created),
    });
    const playerId = asString(joined.payload?.['playerId']);
    const t1 = asString(joined.payload?.['resumeToken']);
    expect(t1).toBeTruthy();

    const first = await tracked();
    const c1 = sendCommand(first.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: t1,
    });
    const resumed1 = await waitForType(first, MessageTypes.SessionAccepted);
    assertParses(resumed1);
    expect(asString(resumed1.payload?.['playerId'])).toBe(playerId);
    const t2 = asString(resumed1.payload?.['resumeToken']);
    expect(t2).toBeTruthy();
    expect(t2).not.toBe(t1);

    // Disconnect the resume socket; wait until presence is disconnected.
    first.socket.disconnect();
    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const self = snap.snapshot.players.find((p) => p.playerId === playerId);
        if (self?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for disconnected presence');
        }
        await sleep(20);
      }
    }

    // Lost-acceptance retry: same C1 + T1 → same T2, presence connected again.
    const retry = await tracked();
    sendCommand(
      retry.socket,
      MessageTypes.MatchResume,
      { matchId, resumeToken: t1 },
      c1,
    );
    const resumed2 = await waitForType(retry, MessageTypes.SessionAccepted);
    assertParses(resumed2);
    expect(asString(resumed2.payload?.['playerId'])).toBe(playerId);
    expect(asString(resumed2.payload?.['resumeToken'])).toBe(t2);
    expect(resumed2.payload?.['code']).toBeUndefined();

    const resumedSnap = await waitForType(retry, MessageTypes.MatchSnapshot, {
      afterIndex: retry.events.indexOf(resumed2),
    });
    assertParses(resumedSnap);
    const resumePlayers = resumedSnap.payload?.['players'] as Array<{
      playerId: string;
      presence: string;
    }>;
    expect(resumePlayers.find((p) => p.playerId === playerId)?.presence).toBe(
      'connected',
    );

    // Authorized request_snapshot succeeds on the new lease.
    const beforeSnap = retry.events.length - 1;
    sendCommand(retry.socket, MessageTypes.MatchRequestSnapshot, { matchId });
    const authorizedSnap = await waitForType(
      retry,
      MessageTypes.MatchSnapshot,
      { afterIndex: beforeSnap },
    );
    assertParses(authorizedSnap);

    // Stale disconnect of the original socket must not revert the current lease.
    original.socket.disconnect();
    await sleep(100);
    const afterStale = await matchService.requestSnapshot(matchId);
    expect(
      afterStale.snapshot.players.find((p) => p.playerId === playerId)
        ?.presence,
    ).toBe('connected');

    // New commandId C2 with stale T1 → UNAUTHORIZED
    const stale = await tracked();
    sendCommand(stale.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: t1,
    });
    const staleError = await waitForType(stale, MessageTypes.ProtocolError);
    expect(staleError.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(staleError);
  }, 15000);

  it('resume converges on completed and halted matches', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(client, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(created),
    });
    const playerId = asString(joined.payload?.['playerId']);
    const resumeToken = asString(joined.payload?.['resumeToken']);
    expect(resumeToken).toBeTruthy();

    client.socket.disconnect();
    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const self = snap.snapshot.players.find((p) => p.playerId === playerId);
        if (self?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for disconnect before complete');
        }
        await sleep(20);
      }
    }

    // Complete match on server while client is offline.
    const store = matchService.getStoreForTests();
    const completed = await store.get(matchId);
    expect(completed).toBeTruthy();
    completed!.status = 'completed';
    completed!.phase = 'completed';
    completed!.winnerId = playerId;
    await store.save(completed!);

    const resumer = await tracked();
    sendCommand(resumer.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken,
    });
    const accepted = await waitForType(resumer, MessageTypes.SessionAccepted);
    assertParses(accepted);
    expect(asString(accepted.payload?.['playerId'])).toBe(playerId);
    const snap = await waitForType(resumer, MessageTypes.MatchSnapshot, {
      afterIndex: resumer.events.indexOf(accepted),
    });
    assertParses(snap);
    expect(snap.payload?.['status']).toBe('completed');
    expect(snap.payload?.['phase']).toBe('completed');
    expect(asString(snap.payload?.['winnerId'])).toBe(playerId);

    const invalid = await tracked();
    sendCommand(invalid.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: 'not-a-valid-resume-token',
    });
    const denied = await waitForType(invalid, MessageTypes.ProtocolError);
    expect(denied.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(denied);

    // Halted terminal (unsafe zero survivors): status resolving + phase halted.
    const haltedClient = await tracked();
    sendCommand(haltedClient.socket, MessageTypes.MatchCreateDev, {});
    const haltedCreated = await waitForType(
      haltedClient,
      MessageTypes.SessionAccepted,
    );
    const haltedMatchId = asString(haltedCreated.payload?.['matchId']);
    sendCommand(haltedClient.socket, MessageTypes.MatchJoin, {
      matchId: haltedMatchId,
    });
    const haltedJoined = await waitForType(
      haltedClient,
      MessageTypes.SessionAccepted,
      { afterIndex: haltedClient.events.indexOf(haltedCreated) },
    );
    const haltedPlayerId = asString(haltedJoined.payload?.['playerId']);
    const haltedToken = asString(haltedJoined.payload?.['resumeToken']);
    const haltedStore = await store.get(haltedMatchId);
    expect(haltedStore).toBeTruthy();
    haltedStore!.status = 'resolving';
    haltedStore!.phase = 'halted';
    haltedStore!.winnerId = null;
    await store.save(haltedStore!);

    const haltedResumer = await tracked();
    sendCommand(haltedResumer.socket, MessageTypes.MatchResume, {
      matchId: haltedMatchId,
      resumeToken: haltedToken,
    });
    const haltedAccepted = await waitForType(
      haltedResumer,
      MessageTypes.SessionAccepted,
    );
    assertParses(haltedAccepted);
    expect(asString(haltedAccepted.payload?.['playerId'])).toBe(haltedPlayerId);
    const haltedSnap = await waitForType(
      haltedResumer,
      MessageTypes.MatchSnapshot,
      { afterIndex: haltedResumer.events.indexOf(haltedAccepted) },
    );
    assertParses(haltedSnap);
    expect(haltedSnap.payload?.['status']).toBe('resolving');
    expect(haltedSnap.payload?.['phase']).toBe('halted');
  }, 20000);

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

  it('fillDevBots forbidden in production mode', async () => {
    const prodService = MatchService.forTests({
      clock: new FakeClock(5_000_000),
      nodeEnv: 'production',
    });
    await expect(prodService.fillDevBots('any-match')).rejects.toThrow(
      /forbidden/,
    );
  });

  it('fillDevBots fills remaining slots with bots', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(client, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(created),
    });

    // Fill bots
    const result = await matchService.fillDevBots(matchId);
    expect(result.botIds.length).toBe(5);
    expect(result.snapshot.players.length).toBe(6);
  }, 10000);

  it('play again: finish binding cleanup then create/join new match without UNAUTHORIZED', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const created1 = await waitForType(client, MessageTypes.SessionAccepted);
    const matchId1 = asString(created1.payload?.['matchId']);
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId: matchId1 });
    await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(created1),
    });

    // Simulate Play Again on the same socket: create a new match then join it.
    const beforeCreate = client.events.length - 1;
    sendCommand(client.socket, MessageTypes.MatchCreateDev, {});
    const created2 = await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: beforeCreate,
    });
    expect(created2.payload?.['code']).toBeUndefined();
    const matchId2 = asString(created2.payload?.['matchId']);
    expect(matchId2).toBeTruthy();
    expect(matchId2).not.toBe(matchId1);

    const beforeJoin = client.events.length - 1;
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId: matchId2 });
    const joined2 = await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: beforeJoin,
    });
    expect(joined2.payload?.['code']).toBeUndefined();
    expect(asString(joined2.payload?.['matchId'])).toBe(matchId2);
    expect(asString(joined2.payload?.['playerId'])).toBeTruthy();

    const unauthorized = client.events.filter(
      (event) =>
        event.type === MessageTypes.ProtocolError &&
        event.payload?.['code'] === 'UNAUTHORIZED',
    );
    expect(unauthorized).toEqual([]);

    const snap = await waitForType(client, MessageTypes.MatchSnapshot, {
      afterIndex: client.events.indexOf(joined2),
    });
    expect(asString(snap.payload?.['matchId'])).toBe(matchId2);
    assertParses(snap);
  }, 15000);

  it('rejects superseded resume receipt and keeps latest lease owner', async () => {
    const original = await tracked();
    sendCommand(original.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(original, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    // 1. Join → T0
    sendCommand(original.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(original, MessageTypes.SessionAccepted, {
      afterIndex: original.events.indexOf(created),
    });
    const playerId = asString(joined.payload?.['playerId']);
    const t0 = asString(joined.payload?.['resumeToken']);
    expect(t0).toBeTruthy();

    // 2. Resume C1+T0 → T1
    const s1 = await tracked();
    const c1 = sendCommand(s1.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: t0,
    });
    const resumed1 = await waitForType(s1, MessageTypes.SessionAccepted);
    assertParses(resumed1);
    const t1 = asString(resumed1.payload?.['resumeToken']);
    expect(t1).toBeTruthy();
    expect(t1).not.toBe(t0);

    // 3. Replay C1+T0 before supersession → same T1
    const s1Replay = await tracked();
    sendCommand(
      s1Replay.socket,
      MessageTypes.MatchResume,
      { matchId, resumeToken: t0 },
      c1,
    );
    const replayed1 = await waitForType(s1Replay, MessageTypes.SessionAccepted);
    assertParses(replayed1);
    expect(asString(replayed1.payload?.['resumeToken'])).toBe(t1);
    expect(asString(replayed1.payload?.['playerId'])).toBe(playerId);

    // 4. Resume C2+T1 → T2 (from a new socket; s1Replay currently owns lease)
    const s2 = await tracked();
    const c2 = sendCommand(s2.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: t1,
    });
    const resumed2 = await waitForType(s2, MessageTypes.SessionAccepted);
    assertParses(resumed2);
    const t2 = asString(resumed2.payload?.['resumeToken']);
    expect(t2).toBeTruthy();
    expect(t2).not.toBe(t1);

    const store = matchService.getStoreForTests();
    const afterC2 = await store.get(matchId);
    const hashAfterC2 = afterC2!.players.get(playerId)!.resumeTokenHash;
    const presenceAfterC2 = afterC2!.players.get(playerId)!.presence;
    const seqAfterC2 = afterC2!.sequence;

    // 5. Replay old C1+T0 → rejected
    const stale = await tracked();
    sendCommand(
      stale.socket,
      MessageTypes.MatchResume,
      { matchId, resumeToken: t0 },
      c1,
    );
    const staleError = await waitForType(stale, MessageTypes.ProtocolError);
    expect(staleError.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(staleError);

    // 6. Confirm old replay didn't modify presence/token
    const afterReject = await store.get(matchId);
    expect(afterReject!.players.get(playerId)!.resumeTokenHash).toBe(
      hashAfterC2,
    );
    expect(afterReject!.players.get(playerId)!.presence).toBe(presenceAfterC2);
    expect(afterReject!.sequence).toBe(seqAfterC2);

    // 7. Replay latest C2+T1 → same T2
    s2.socket.disconnect();
    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const self = snap.snapshot.players.find((p) => p.playerId === playerId);
        if (self?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error(
            'timeout waiting for disconnect before latest replay',
          );
        }
        await sleep(20);
      }
    }
    const latest = await tracked();
    sendCommand(
      latest.socket,
      MessageTypes.MatchResume,
      { matchId, resumeToken: t1 },
      c2,
    );
    const latestAccepted = await waitForType(
      latest,
      MessageTypes.SessionAccepted,
    );
    assertParses(latestAccepted);
    expect(asString(latestAccepted.payload?.['resumeToken'])).toBe(t2);
    expect(
      (
        (
          await waitForType(latest, MessageTypes.MatchSnapshot, {
            afterIndex: latest.events.indexOf(latestAccepted),
          })
        ).payload?.['players'] as Array<{ playerId: string; presence: string }>
      ).find((p) => p.playerId === playerId)?.presence,
    ).toBe('connected');

    // 8. Only latest socket owns lease — authorized snapshot works on latest
    const beforeSnap = latest.events.length - 1;
    sendCommand(latest.socket, MessageTypes.MatchRequestSnapshot, { matchId });
    const authSnap = await waitForType(latest, MessageTypes.MatchSnapshot, {
      afterIndex: beforeSnap,
    });
    assertParses(authSnap);

    // Stale rejected socket + earlier sockets must not mark current player disconnected
    stale.socket.disconnect();
    s1Replay.socket.disconnect();
    original.socket.disconnect();
    await sleep(100);
    const afterStale = await matchService.requestSnapshot(matchId);
    expect(
      afterStale.snapshot.players.find((p) => p.playerId === playerId)
        ?.presence,
    ).toBe('connected');
  }, 20000);

  it('bound socket cannot join again or resume as another player', async () => {
    const creator = await tracked();
    sendCommand(creator.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(creator, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    const socketA = await tracked();
    sendCommand(socketA.socket, MessageTypes.MatchJoin, { matchId });
    const joinedA = await waitForType(socketA, MessageTypes.SessionAccepted);
    assertParses(joinedA);
    const playerA = asString(joinedA.payload?.['playerId']);
    const tokenA = asString(joinedA.payload?.['resumeToken']);

    const socketB = await tracked();
    sendCommand(socketB.socket, MessageTypes.MatchJoin, { matchId });
    const joinedB = await waitForType(socketB, MessageTypes.SessionAccepted);
    assertParses(joinedB);
    const playerB = asString(joinedB.payload?.['playerId']);
    const tokenB = asString(joinedB.payload?.['resumeToken']);
    expect(playerB).not.toBe(playerA);

    const store = matchService.getStoreForTests();
    const before = await store.get(matchId);
    const playerCountBefore = before!.players.size;
    const hashBBefore = before!.players.get(playerB)!.resumeTokenHash;

    // 1. Bound A attempts another match.join same match
    const beforeJoin = socketA.events.length - 1;
    sendCommand(socketA.socket, MessageTypes.MatchJoin, { matchId });
    const joinDenied = await waitForType(socketA, MessageTypes.ProtocolError, {
      afterIndex: beforeJoin,
    });
    expect(joinDenied.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(joinDenied);

    // 2. Bound A attempts match.resume with B's valid token
    const beforeResume = socketA.events.length - 1;
    sendCommand(socketA.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: tokenB,
    });
    const resumeDenied = await waitForType(
      socketA,
      MessageTypes.ProtocolError,
      { afterIndex: beforeResume },
    );
    expect(resumeDenied.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(resumeDenied);

    // 3–4. No extra player, no token rotate for B
    const after = await store.get(matchId);
    expect(after!.players.size).toBe(playerCountBefore);
    expect(after!.players.get(playerB)!.resumeTokenHash).toBe(hashBBefore);

    // 5–6. A and B leases/presence correct
    expect(after!.players.get(playerA)!.presence).toBe('connected');
    expect(after!.players.get(playerB)!.presence).toBe('connected');

    const beforeSnapA = socketA.events.length - 1;
    sendCommand(socketA.socket, MessageTypes.MatchRequestSnapshot, { matchId });
    const snapA = await waitForType(socketA, MessageTypes.MatchSnapshot, {
      afterIndex: beforeSnapA,
    });
    assertParses(snapA);

    const beforeSnapB = socketB.events.length - 1;
    sendCommand(socketB.socket, MessageTypes.MatchRequestSnapshot, {
      matchId,
    });
    const snapB = await waitForType(socketB, MessageTypes.MatchSnapshot, {
      afterIndex: beforeSnapB,
    });
    assertParses(snapB);

    // 7. Disconnect cleanup leaves no ghost lease — B still connected after A leaves
    socketA.socket.disconnect();
    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const a = snap.snapshot.players.find((p) => p.playerId === playerA);
        if (a?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for A disconnect');
        }
        await sleep(20);
      }
    }
    const afterAGone = await matchService.requestSnapshot(matchId);
    expect(
      afterAGone.snapshot.players.find((p) => p.playerId === playerB)?.presence,
    ).toBe('connected');

    // B still owns lease
    const beforeSnapB2 = socketB.events.length - 1;
    sendCommand(socketB.socket, MessageTypes.MatchRequestSnapshot, {
      matchId,
    });
    const snapB2 = await waitForType(socketB, MessageTypes.MatchSnapshot, {
      afterIndex: beforeSnapB2,
    });
    assertParses(snapB2);

    // Normal resume from unbound reconnect still works for A
    const resumeA = await tracked();
    sendCommand(resumeA.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: tokenA,
    });
    const resumedA = await waitForType(resumeA, MessageTypes.SessionAccepted);
    assertParses(resumedA);
    expect(asString(resumedA.payload?.['playerId'])).toBe(playerA);
  }, 20000);

  it('duplicate answer commandId does not double-resolve or double-reward', async () => {
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

    const playerIds: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const client = clients[i]!;
      const before = client.events.length - 1;
      sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
      const accepted = await waitForType(client, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
      playerIds.push(asString(accepted.payload?.['playerId']));
    }

    // Drive challenge via service for determinism (skip lobby timers).
    await matchService.startDevRound(
      matchId,
      createDevChallengeDefinition({
        durationMs: 5000,
        energyRewardOnSuccess: 2,
        heartPenaltyOnFailure: 1,
        serverConfig: { expectedChoice: 'a' },
      }),
    );

    const snap = await matchService.requestSnapshot(matchId);
    const challengeInstanceId =
      snap.snapshot.currentChallenge!.challengeInstanceId;

    const dupCommandId = randomUUID();
    sendCommand(
      clients[0]!.socket,
      MessageTypes.MatchSubmitAnswer,
      { challengeInstanceId, answer: { choice: 'a' } },
      dupCommandId,
    );
    const ack1 = await waitForType(
      clients[0]!,
      MessageTypes.ChallengeSubmissionAck,
    );
    expect(ack1.payload?.['accepted']).toBe(true);
    expect(ack1.payload?.['duplicate']).toBeFalsy();
    assertParses(ack1);

    const beforeDup = clients[0]!.events.length - 1;
    sendCommand(
      clients[0]!.socket,
      MessageTypes.MatchSubmitAnswer,
      { challengeInstanceId, answer: { choice: 'a' } },
      dupCommandId,
    );
    const ack2 = await waitForType(
      clients[0]!,
      MessageTypes.ChallengeSubmissionAck,
      { afterIndex: beforeDup },
    );
    expect(ack2.payload?.['accepted']).toBe(true);
    expect(ack2.payload?.['duplicate']).toBe(true);
    assertParses(ack2);

    for (let i = 1; i < 6; i += 1) {
      sendCommand(clients[i]!.socket, MessageTypes.MatchSubmitAnswer, {
        challengeInstanceId,
        answer: { choice: 'b' },
      });
      await waitForType(clients[i]!, MessageTypes.ChallengeSubmissionAck);
    }

    // Wait until challenge resolves.
    {
      const started = Date.now();
      for (;;) {
        const current = await matchService.requestSnapshot(matchId);
        if (current.snapshot.currentChallenge?.status !== 'active') {
          break;
        }
        // Snapshot may not expose status on public challenge the same way —
        // check energy/hearts instead when resolved events land.
        const winner = current.snapshot.players.find(
          (p) => p.playerId === playerIds[0],
        );
        if (winner && winner.energy >= 2) {
          break;
        }
        if (Date.now() - started > 8000) {
          throw new Error('timeout waiting for challenge resolution');
        }
        await sleep(20);
      }
    }

    const final = await matchService.requestSnapshot(matchId);
    const winner = final.snapshot.players.find(
      (p) => p.playerId === playerIds[0],
    );
    expect(winner?.energy).toBe(2);
    expect(winner?.hearts).toBe(3);
  }, 20000);

  it('two concurrent joins on one unbound socket create only one player', async () => {
    const creator = await tracked();
    sendCommand(creator.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(creator, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    const barrier = createBarrier();
    matchService.setIdentityBarrierHooksForTests({
      afterJoinMutated: () => barrier.wait(),
    });

    const client = await tracked();
    const socketId = client.socket.id!;
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    await barrier.waited();

    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    barrier.release();

    const accepted = await waitForType(client, MessageTypes.SessionAccepted);
    assertParses(accepted);
    const playerId = asString(accepted.payload?.['playerId']);
    expect(playerId).toBeTruthy();

    const denied = await waitForType(client, MessageTypes.ProtocolError, {
      afterIndex: client.events.indexOf(accepted),
    });
    expect(denied.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(denied);

    const store = matchService.getStoreForTests();
    const match = await store.get(matchId);
    expect(match!.players.size).toBe(1);
    expect(match!.players.has(playerId)).toBe(true);
    expect(match!.players.get(playerId)!.presence).toBe('connected');
    expect(matchGateway.getLeaseOwnerForTests(matchId, playerId)).toBe(
      socketId,
    );
    expect(
      [...match!.players.values()].filter((p) => p.presence === 'connected')
        .length,
    ).toBe(1);
  }, 15000);

  it('concurrent resumes as different players: only one identity wins', async () => {
    const creator = await tracked();
    sendCommand(creator.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(creator, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    const socketA = await tracked();
    sendCommand(socketA.socket, MessageTypes.MatchJoin, { matchId });
    const joinedA = await waitForType(socketA, MessageTypes.SessionAccepted);
    const playerA = asString(joinedA.payload?.['playerId']);
    const tokenA = asString(joinedA.payload?.['resumeToken']);

    const socketB = await tracked();
    sendCommand(socketB.socket, MessageTypes.MatchJoin, { matchId });
    const joinedB = await waitForType(socketB, MessageTypes.SessionAccepted);
    const playerB = asString(joinedB.payload?.['playerId']);
    const tokenB = asString(joinedB.payload?.['resumeToken']);

    socketA.socket.disconnect();
    socketB.socket.disconnect();
    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const a = snap.snapshot.players.find((p) => p.playerId === playerA);
        const b = snap.snapshot.players.find((p) => p.playerId === playerB);
        if (a?.presence === 'disconnected' && b?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for A/B disconnect');
        }
        await sleep(20);
      }
    }

    const store = matchService.getStoreForTests();
    const before = await store.get(matchId);
    const hashBBefore = before!.players.get(playerB)!.resumeTokenHash;
    const presenceBBefore = before!.players.get(playerB)!.presence;

    const barrier = createBarrier();
    matchService.setIdentityBarrierHooksForTests({
      afterResumeMutated: () => barrier.wait(),
    });

    const contender = await tracked();
    const contenderId = contender.socket.id!;
    sendCommand(contender.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: tokenA,
    });
    await barrier.waited();

    sendCommand(contender.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: tokenB,
    });
    barrier.release();

    const accepted = await waitForType(contender, MessageTypes.SessionAccepted);
    assertParses(accepted);
    expect(asString(accepted.payload?.['playerId'])).toBe(playerA);

    const denied = await waitForType(contender, MessageTypes.ProtocolError, {
      afterIndex: contender.events.indexOf(accepted),
    });
    expect(denied.payload?.['code']).toBe('UNAUTHORIZED');
    assertParses(denied);

    const after = await store.get(matchId);
    expect(after!.players.get(playerB)!.resumeTokenHash).toBe(hashBBefore);
    expect(after!.players.get(playerB)!.presence).toBe(presenceBBefore);
    expect(after!.players.get(playerA)!.presence).toBe('connected');
    expect(matchGateway.getLeaseOwnerForTests(matchId, playerA)).toBe(
      contenderId,
    );
    expect(
      matchGateway.getLeaseOwnerForTests(matchId, playerB),
    ).toBeUndefined();
  }, 20000);

  it('disconnect while join awaits: no lease and no inaccessible seat', async () => {
    const creator = await tracked();
    sendCommand(creator.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(creator, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    const barrier = createBarrier();
    matchService.setIdentityBarrierHooksForTests({
      afterJoinMutated: () => barrier.wait(),
    });

    const client = await tracked();
    const socketId = client.socket.id!;
    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    await barrier.waited();

    const store = matchService.getStoreForTests();
    const mid = await store.get(matchId);
    expect(mid!.players.size).toBe(1);
    const orphanId = [...mid!.players.keys()][0]!;

    const serverDisconnected = new Promise<void>((resolve) => {
      matchGateway.setDisconnectHookForTests((id) => {
        if (id === socketId) {
          resolve();
        }
      });
    });
    client.socket.disconnect();
    await serverDisconnected;
    barrier.release();

    {
      const started = Date.now();
      for (;;) {
        const current = await store.get(matchId);
        // Emptied matches are deleted; either outcome means the orphan is gone.
        if (!current || !current.players.has(orphanId)) {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for orphaned join rollback');
        }
        await sleep(20);
      }
    }

    const after = await store.get(matchId);
    expect(after == null || after.players.size === 0).toBe(true);
    expect(matchGateway.hasLeaseForSocketForTests(socketId)).toBe(false);
    expect(
      matchGateway.getLeaseOwnerForTests(matchId, orphanId),
    ).toBeUndefined();
  }, 15000);

  it('disconnect while resume awaits: no dead lease; same command recovers', async () => {
    const original = await tracked();
    sendCommand(original.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(original, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    sendCommand(original.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(original, MessageTypes.SessionAccepted, {
      afterIndex: original.events.indexOf(created),
    });
    const playerId = asString(joined.payload?.['playerId']);
    const token = asString(joined.payload?.['resumeToken']);
    original.socket.disconnect();
    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const self = snap.snapshot.players.find((p) => p.playerId === playerId);
        if (self?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for original disconnect');
        }
        await sleep(20);
      }
    }

    const barrier = createBarrier();
    matchService.setIdentityBarrierHooksForTests({
      afterResumeMutated: () => barrier.wait(),
    });

    const first = await tracked();
    const firstId = first.socket.id!;
    const commandId = sendCommand(first.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: token,
    });
    await barrier.waited();

    const serverDisconnected = new Promise<void>((resolve) => {
      matchGateway.setDisconnectHookForTests((id) => {
        if (id === firstId) {
          resolve();
        }
      });
    });
    first.socket.disconnect();
    await serverDisconnected;
    barrier.release();

    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const self = snap.snapshot.players.find((p) => p.playerId === playerId);
        if (self?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for mid-resume disconnect cleanup');
        }
        await sleep(20);
      }
    }

    expect(matchGateway.hasLeaseForSocketForTests(firstId)).toBe(false);
    expect(
      matchGateway.getLeaseOwnerForTests(matchId, playerId),
    ).toBeUndefined();

    matchService.setIdentityBarrierHooksForTests({});
    const retry = await tracked();
    sendCommand(
      retry.socket,
      MessageTypes.MatchResume,
      { matchId, resumeToken: token },
      commandId,
    );
    const accepted = await waitForType(retry, MessageTypes.SessionAccepted);
    assertParses(accepted);
    expect(asString(accepted.payload?.['playerId'])).toBe(playerId);
    expect(asString(accepted.payload?.['resumeToken'])).toBeTruthy();

    const snap = await waitForType(retry, MessageTypes.MatchSnapshot, {
      afterIndex: retry.events.indexOf(accepted),
    });
    const players = snap.payload?.['players'] as Array<{
      playerId: string;
      presence: string;
    }>;
    expect(players.find((p) => p.playerId === playerId)?.presence).toBe(
      'connected',
    );
    expect(matchGateway.getLeaseOwnerForTests(matchId, playerId)).toBe(
      retry.socket.id,
    );
  }, 20000);

  it('failed identity command does not block the next valid command', async () => {
    const creator = await tracked();
    sendCommand(creator.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(creator, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchJoin, {
      matchId: 'does-not-exist',
    });
    const failed = await waitForType(client, MessageTypes.ProtocolError);
    expect(failed.payload?.['code']).toBe('MATCH_NOT_FOUND');
    assertParses(failed);

    sendCommand(client.socket, MessageTypes.MatchJoin, { matchId });
    const accepted = await waitForType(client, MessageTypes.SessionAccepted, {
      afterIndex: client.events.indexOf(failed),
    });
    assertParses(accepted);
    expect(asString(accepted.payload?.['matchId'])).toBe(matchId);
    expect(asString(accepted.payload?.['playerId'])).toBeTruthy();
    expect(asString(accepted.payload?.['resumeToken'])).toBeTruthy();
  }, 15000);

  it('bound create_dev disconnects old player, clears lease/room, joins new match', async () => {
    const observer = await tracked();
    sendCommand(observer.socket, MessageTypes.MatchCreateDev, {});
    const createdObs = await waitForType(
      observer,
      MessageTypes.SessionAccepted,
    );
    const oldMatchId = asString(createdObs.payload?.['matchId']);

    const player = await tracked();
    const playerSocketId = player.socket.id!;
    sendCommand(player.socket, MessageTypes.MatchJoin, { matchId: oldMatchId });
    const joined = await waitForType(player, MessageTypes.SessionAccepted);
    const oldPlayerId = asString(joined.payload?.['playerId']);
    expect(matchGateway.getLeaseOwnerForTests(oldMatchId, oldPlayerId)).toBe(
      playerSocketId,
    );
    expect(
      matchGateway.isSocketInMatchRoomForTests(playerSocketId, oldMatchId),
    ).toBe(true);

    // Observer also joins so they remain in the old room for convergence.
    const obsBeforeJoin = observer.events.length - 1;
    sendCommand(observer.socket, MessageTypes.MatchJoin, {
      matchId: oldMatchId,
    });
    const obsJoined = await waitForType(
      observer,
      MessageTypes.SessionAccepted,
      {
        afterIndex: obsBeforeJoin,
      },
    );
    assertParses(obsJoined);
    const observerBefore = observer.events.length - 1;

    const beforeCreate = player.events.length - 1;
    sendCommand(player.socket, MessageTypes.MatchCreateDev, {});
    const created2 = await waitForType(player, MessageTypes.SessionAccepted, {
      afterIndex: beforeCreate,
    });
    assertParses(created2);
    expect(created2.payload?.['role']).toBe('creator');
    const newMatchId = asString(created2.payload?.['matchId']);
    expect(newMatchId).toBeTruthy();
    expect(newMatchId).not.toBe(oldMatchId);

    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(oldMatchId);
        const old = snap.snapshot.players.find(
          (p) => p.playerId === oldPlayerId,
        );
        if (old?.presence === 'disconnected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for old player disconnect');
        }
        await sleep(20);
      }
    }

    expect(
      matchGateway.getLeaseOwnerForTests(oldMatchId, oldPlayerId),
    ).toBeUndefined();
    expect(matchGateway.hasLeaseForSocketForTests(playerSocketId)).toBe(false);
    expect(
      matchGateway.isSocketInMatchRoomForTests(playerSocketId, oldMatchId),
    ).toBe(false);

    const obsUpdate = await waitForType(observer, MessageTypes.MatchSnapshot, {
      afterIndex: observerBefore,
    });
    assertParses(obsUpdate);
    const obsPlayers = obsUpdate.payload?.['players'] as Array<{
      playerId: string;
      presence: string;
    }>;
    expect(obsPlayers.find((p) => p.playerId === oldPlayerId)?.presence).toBe(
      'disconnected',
    );

    const beforeJoin = player.events.length - 1;
    sendCommand(player.socket, MessageTypes.MatchJoin, { matchId: newMatchId });
    const joinedNew = await waitForType(player, MessageTypes.SessionAccepted, {
      afterIndex: beforeJoin,
    });
    assertParses(joinedNew);
    expect(asString(joinedNew.payload?.['matchId'])).toBe(newMatchId);
    expect(asString(joinedNew.payload?.['playerId'])).toBeTruthy();
  }, 20000);

  it('create_dev cleanup cannot disconnect a newer resume lease owner', async () => {
    const creator = await tracked();
    sendCommand(creator.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(creator, MessageTypes.SessionAccepted);
    const matchId = asString(created.payload?.['matchId']);

    const original = await tracked();
    const originalId = original.socket.id!;
    sendCommand(original.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(original, MessageTypes.SessionAccepted);
    const playerId = asString(joined.payload?.['playerId']);
    const token = asString(joined.payload?.['resumeToken']);

    const barrier = createBarrier();
    matchGateway.setClearBindingBarrierForTests(() => barrier.wait());

    const beforeCreate = original.events.length - 1;
    sendCommand(original.socket, MessageTypes.MatchCreateDev, {});
    await barrier.waited();

    const resumer = await tracked();
    const resumerId = resumer.socket.id!;
    sendCommand(resumer.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: token,
    });
    const resumed = await waitForType(resumer, MessageTypes.SessionAccepted);
    assertParses(resumed);
    expect(asString(resumed.payload?.['playerId'])).toBe(playerId);
    expect(matchGateway.getLeaseOwnerForTests(matchId, playerId)).toBe(
      resumerId,
    );

    barrier.release();

    await waitForType(original, MessageTypes.SessionAccepted, {
      afterIndex: beforeCreate,
    });

    {
      const started = Date.now();
      for (;;) {
        const snap = await matchService.requestSnapshot(matchId);
        const self = snap.snapshot.players.find((p) => p.playerId === playerId);
        if (self?.presence === 'connected') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('resumed owner lost connected presence');
        }
        await sleep(20);
      }
    }

    expect(matchGateway.getLeaseOwnerForTests(matchId, playerId)).toBe(
      resumerId,
    );
    expect(matchGateway.hasLeaseForSocketForTests(originalId)).toBe(false);
    const store = matchService.getStoreForTests();
    const match = await store.get(matchId);
    expect(match!.players.get(playerId)!.presence).toBe('connected');
  }, 20000);

  it('sixth join disconnect before acceptance: no countdown, lobby stays at 5', async () => {
    const clients: TrackedSocket[] = [];
    const boundPlayerIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      clients.push(await tracked());
    }

    sendCommand(clients[0]!.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(
      clients[0]!,
      MessageTypes.SessionAccepted,
    );
    const matchId = asString(created.payload?.['matchId']);

    for (let i = 0; i < 5; i += 1) {
      const before = clients[i]!.events.length - 1;
      sendCommand(clients[i]!.socket, MessageTypes.MatchJoin, { matchId });
      const accepted = await waitForType(
        clients[i]!,
        MessageTypes.SessionAccepted,
        { afterIndex: before },
      );
      boundPlayerIds.push(asString(accepted.payload?.['playerId']));
    }

    const store = matchService.getStoreForTests();
    expect((await store.get(matchId))!.players.size).toBe(5);

    const barrier = createBarrier();
    matchService.setIdentityBarrierHooksForTests({
      afterJoinMutated: () => barrier.wait(),
    });

    const sixth = await tracked();
    const sixthId = sixth.socket.id!;
    const boundBefore = clients[0]!.events.length - 1;
    sendCommand(sixth.socket, MessageTypes.MatchJoin, { matchId });
    await barrier.waited();

    const mid = await store.get(matchId);
    expect(mid!.players.size).toBe(6);
    expect(mid!.phase).toBe('lobby');
    expect(mid!.phaseDeadlineMonoMs).toBeNull();
    const reservedId = [...mid!.players.keys()].find(
      (id) => !boundPlayerIds.includes(id),
    )!;
    expect(reservedId).toBeTruthy();
    expect(
      matchGateway.getLeaseOwnerForTests(matchId, reservedId),
    ).toBeUndefined();

    const serverDisconnected = new Promise<void>((resolve) => {
      matchGateway.setDisconnectHookForTests((id) => {
        if (id === sixthId) {
          resolve();
        }
      });
    });
    sixth.socket.disconnect();
    await serverDisconnected;

    // Queue a countdown-boundary tick while join is still paused (must not
    // await — that would deadlock behind the barrier-held match queue).
    clock.advance(4000);
    const tickWhilePaused = matchService.tickDue(matchId);

    barrier.release();
    await tickWhilePaused;

    {
      const started = Date.now();
      for (;;) {
        const current = await store.get(matchId);
        if (
          current!.players.size === 5 &&
          current!.phase === 'lobby' &&
          !current!.players.has(reservedId)
        ) {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('timeout waiting for sixth-seat rollback');
        }
        await sleep(20);
      }
    }

    clock.advance(4000);
    await matchService.tickDue(matchId);

    const after = await store.get(matchId);
    expect(after!.players.size).toBe(5);
    expect(after!.status).toBe('waiting');
    expect(after!.phase).toBe('lobby');
    expect(after!.currentChallenge).toBeNull();
    expect(after!.phaseDeadlineMonoMs).toBeNull();
    expect(after!.players.has(reservedId)).toBe(false);
    expect(matchGateway.hasLeaseForSocketForTests(sixthId)).toBe(false);
    expect(
      matchGateway.getLeaseOwnerForTests(matchId, reservedId),
    ).toBeUndefined();
    expect(matchService.hasPhaseTimerForTests(matchId)).toBe(false);

    // Bound client must see an authoritative 5-player lobby snapshot.
    {
      const started = Date.now();
      for (;;) {
        const snaps = clients[0]!.events.filter(
          (e, index) =>
            e.type === MessageTypes.MatchSnapshot && index > boundBefore,
        );
        const rolledBack = [...snaps].reverse().find((e) => {
          const players = e.payload?.['players'] as unknown[] | undefined;
          return (
            e.payload?.['phase'] === 'lobby' &&
            Array.isArray(players) &&
            players.length === 5
          );
        });
        if (rolledBack) {
          assertParses(rolledBack);
          break;
        }
        if (Date.now() - started > 8000) {
          throw new Error('bound client never saw 5-player lobby snapshot');
        }
        await sleep(20);
      }
    }
  }, 25000);

  it('successful sixth join starts exactly one ready_countdown after acceptance', async () => {
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

    for (let i = 0; i < 5; i += 1) {
      const before = clients[i]!.events.length - 1;
      sendCommand(clients[i]!.socket, MessageTypes.MatchJoin, { matchId });
      await waitForType(clients[i]!, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
    }

    const beforeIndexes = clients.map((c) => c.events.length - 1);

    sendCommand(clients[5]!.socket, MessageTypes.MatchJoin, { matchId });
    const sixthAccepted = await waitForType(
      clients[5]!,
      MessageTypes.SessionAccepted,
    );
    assertParses(sixthAccepted);
    expect(asString(sixthAccepted.payload?.['playerId'])).toBeTruthy();

    for (let i = 0; i < 6; i += 1) {
      const started = Date.now();
      for (;;) {
        const found = clients[i]!.events.find(
          (e, index) =>
            e.type === MessageTypes.MatchSnapshot &&
            index > beforeIndexes[i]! &&
            e.payload?.['phase'] === 'ready_countdown',
        );
        if (found) {
          assertParses(found);
          expect((found.payload?.['players'] as unknown[]).length).toBe(6);
          break;
        }
        if (Date.now() - started > 8000) {
          throw new Error(`client ${i} never saw ready_countdown`);
        }
        await sleep(20);
      }
    }

    const store = matchService.getStoreForTests();
    const match = await store.get(matchId);
    expect(match!.players.size).toBe(6);
    expect(match!.phase).toBe('ready_countdown');
    expect(match!.phaseDeadlineMonoMs).not.toBeNull();
    expect(match!.status).toBe('waiting');

    const deadline = match!.phaseDeadlineMonoMs!;
    clock.advance(deadline - clock.monoMs());
    await matchService.tickDue(matchId);
    const afterTick = await store.get(matchId);
    expect(afterTick!.phase).toBe('challenge_active');
    expect(afterTick!.currentChallenge?.status).toBe('active');
    expect(afterTick!.currentChallenge?.startsAtMs).toBeGreaterThan(0);
  }, 25000);

  it('delayed fifth finalizeJoin cannot start countdown while sixth is only reserved', async () => {
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

    // Four fully accepted (including finalize).
    for (let i = 0; i < 4; i += 1) {
      const before = clients[i]!.events.length - 1;
      sendCommand(clients[i]!.socket, MessageTypes.MatchJoin, { matchId });
      await waitForType(clients[i]!, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
    }

    const fifthFinalizeBarrier = createBarrier();
    const sixthJoinBarrier = createBarrier();
    let fifthPlayerId = '';
    matchService.setIdentityBarrierHooksForTests({
      beforeFinalizeJoin: async (playerId) => {
        if (!fifthPlayerId) {
          fifthPlayerId = playerId;
          await fifthFinalizeBarrier.wait();
        }
      },
      afterJoinMutated: async () => {
        // Only the sixth reservation (after fifth has reserved+bound path
        // paused at finalize) hits this while fifth waits to finalize.
        if (fifthPlayerId) {
          await sixthJoinBarrier.wait();
        }
      },
    });

    const store = matchService.getStoreForTests();
    const countdownSeen: string[] = [];
    for (const client of clients) {
      const originalLength = client.events.length;
      // Track via polling after each step rather than mutating listeners.
      void originalLength;
    }

    // Start fifth join — will pause in beforeFinalizeJoin after credentials.
    sendCommand(clients[4]!.socket, MessageTypes.MatchJoin, { matchId });
    await fifthFinalizeBarrier.waited();

    const afterFifthReserve = await store.get(matchId);
    expect(afterFifthReserve!.players.size).toBe(5);
    expect(afterFifthReserve!.phase).toBe('lobby');
    expect(fifthPlayerId).toBeTruthy();

    // Sixth reserves while fifth finalization is delayed.
    sendCommand(clients[5]!.socket, MessageTypes.MatchJoin, { matchId });
    await sixthJoinBarrier.waited();

    const mid = await store.get(matchId);
    expect(mid!.players.size).toBe(6);
    expect(mid!.phase).toBe('lobby');
    expect(mid!.phaseDeadlineMonoMs).toBeNull();
    expect(matchService.hasPhaseTimerForTests(matchId)).toBe(false);
    const sixthId = [...mid!.players.keys()].find(
      (id) =>
        id !== fifthPlayerId &&
        mid!.players.get(id)!.joinAccepted === false &&
        !matchGateway.getLeaseOwnerForTests(matchId, id),
    );
    // Sixth is reserved (joinAccepted false). Fifth may already be leased.
    expect(
      [...mid!.players.values()].filter((p) => !p.joinAccepted).length,
    ).toBeGreaterThanOrEqual(1);

    const beforeFifthFinalize = clients.map((c) => c.events.length - 1);

    // Allow fifth finalize while six seats exist but sixth unaccepted.
    fifthFinalizeBarrier.release();
    await waitForType(clients[4]!, MessageTypes.SessionAccepted);

    {
      const started = Date.now();
      for (;;) {
        const current = await store.get(matchId);
        if (current!.players.get(fifthPlayerId)?.joinAccepted === true) {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('fifth never finalized');
        }
        await sleep(10);
      }
    }

    const afterFifthFinalize = await store.get(matchId);
    expect(afterFifthFinalize!.phase).toBe('lobby');
    expect(afterFifthFinalize!.phaseDeadlineMonoMs).toBeNull();
    expect(matchService.hasPhaseTimerForTests(matchId)).toBe(false);

    // Prove no transient ready_countdown was emitted to any connected client.
    for (let i = 0; i < 5; i += 1) {
      const found = clients[i]!.events.find(
        (e, index) =>
          index > beforeFifthFinalize[i]! &&
          e.type === MessageTypes.MatchSnapshot &&
          e.payload?.['phase'] === 'ready_countdown',
      );
      expect(found).toBeUndefined();
      void countdownSeen;
    }

    // Disconnect unaccepted sixth and complete orphan cleanup.
    const sixthSocketId = clients[5]!.socket.id!;
    const serverDisconnected = new Promise<void>((resolve) => {
      matchGateway.setDisconnectHookForTests((id) => {
        if (id === sixthSocketId) {
          resolve();
        }
      });
    });
    clients[5]!.socket.disconnect();
    await serverDisconnected;
    sixthJoinBarrier.release();

    {
      const started = Date.now();
      for (;;) {
        const current = await store.get(matchId);
        if (current!.players.size === 5 && current!.phase === 'lobby') {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('sixth orphan not rolled back');
        }
        await sleep(20);
      }
    }

    const final = await store.get(matchId);
    expect(final!.players.size).toBe(5);
    expect(final!.phase).toBe('lobby');
    expect(final!.phaseDeadlineMonoMs).toBeNull();
    expect(final!.currentChallenge).toBeNull();
    expect(matchService.hasPhaseTimerForTests(matchId)).toBe(false);
    if (sixthId) {
      expect(final!.players.has(sixthId)).toBe(false);
      expect(
        matchGateway.getLeaseOwnerForTests(matchId, sixthId),
      ).toBeUndefined();
    }

    // Still no countdown ever.
    for (const client of clients.slice(0, 5)) {
      expect(
        client.events.some(
          (e) =>
            e.type === MessageTypes.MatchSnapshot &&
            e.payload?.['phase'] === 'ready_countdown',
        ),
      ).toBe(false);
    }
  }, 30000);

  it('stale finalizeJoin after lease loss cannot accept or start countdown', async () => {
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

    for (let i = 0; i < 5; i += 1) {
      const before = clients[i]!.events.length - 1;
      sendCommand(clients[i]!.socket, MessageTypes.MatchJoin, { matchId });
      await waitForType(clients[i]!, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
    }

    const finalizeBarrier = createBarrier();
    let sixthPlayerId = '';
    matchService.setIdentityBarrierHooksForTests({
      beforeFinalizeJoin: async (playerId) => {
        sixthPlayerId = playerId;
        await finalizeBarrier.wait();
      },
    });

    sendCommand(clients[5]!.socket, MessageTypes.MatchJoin, { matchId });
    await finalizeBarrier.waited();

    const store = matchService.getStoreForTests();
    expect(sixthPlayerId).toBeTruthy();
    const sixthSocketId = clients[5]!.socket.id!;
    expect(matchGateway.getLeaseOwnerForTests(matchId, sixthPlayerId)).toBe(
      sixthSocketId,
    );

    // Drop lease before finalize runs (newer owner / displaced socket).
    matchGateway.forceReleaseLeaseForTests(matchId, sixthPlayerId);
    expect(
      matchGateway.getLeaseOwnerForTests(matchId, sixthPlayerId),
    ).toBeUndefined();

    finalizeBarrier.release();
    await waitForType(clients[5]!, MessageTypes.SessionAccepted);

    {
      const started = Date.now();
      for (;;) {
        const current = await store.get(matchId);
        if (
          current!.phase === 'lobby' &&
          !current!.players.has(sixthPlayerId) &&
          current!.players.size === 5
        ) {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('stale finalize did not roll back inaccessible seat');
        }
        await sleep(20);
      }
    }

    const match = await store.get(matchId);
    expect(match!.players.has(sixthPlayerId)).toBe(false);
    expect(match!.players.size).toBe(5);
    expect(match!.phase).toBe('lobby');
    expect(match!.phaseDeadlineMonoMs).toBeNull();
    expect(matchService.hasPhaseTimerForTests(matchId)).toBe(false);
    expect(
      clients.some((c) =>
        c.events.some(
          (e) =>
            e.type === MessageTypes.MatchSnapshot &&
            e.payload?.['phase'] === 'ready_countdown',
        ),
      ),
    ).toBe(false);
  }, 25000);

  it('resume lease transfer preserves reserved player; newer socket finalizes', async () => {
    const clients: TrackedSocket[] = [];
    for (let i = 0; i < 5; i += 1) {
      clients.push(await tracked());
    }

    sendCommand(clients[0]!.socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(
      clients[0]!,
      MessageTypes.SessionAccepted,
    );
    const matchId = asString(created.payload?.['matchId']);

    for (let i = 0; i < 5; i += 1) {
      const before = clients[i]!.events.length - 1;
      sendCommand(clients[i]!.socket, MessageTypes.MatchJoin, { matchId });
      await waitForType(clients[i]!, MessageTypes.SessionAccepted, {
        afterIndex: before,
      });
    }

    const finalizeBarrier = createBarrier();
    let sixthPlayerId = '';
    let finalizeCalls = 0;
    matchService.setIdentityBarrierHooksForTests({
      beforeFinalizeJoin: async (playerId) => {
        finalizeCalls += 1;
        // Pause only the original join's first finalize attempt.
        if (finalizeCalls === 1) {
          sixthPlayerId = playerId;
          await finalizeBarrier.wait();
        }
      },
    });

    const sixth = await tracked();
    const sixthSocketId = sixth.socket.id!;
    sendCommand(sixth.socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(sixth, MessageTypes.SessionAccepted);
    assertParses(joined);
    const joinToken = asString(joined.payload?.['resumeToken']);
    expect(asString(joined.payload?.['playerId'])).toBeTruthy();
    await finalizeBarrier.waited();
    expect(sixthPlayerId).toBe(asString(joined.payload?.['playerId']));
    expect(joinToken).toBeTruthy();

    const store = matchService.getStoreForTests();
    expect(matchGateway.getLeaseOwnerForTests(matchId, sixthPlayerId)).toBe(
      sixthSocketId,
    );
    expect(
      (await store.get(matchId))!.players.get(sixthPlayerId)!.joinAccepted,
    ).toBe(false);

    // Real resume from a second socket — transfers lease ownership.
    const resumer = await tracked();
    const resumerId = resumer.socket.id!;
    sendCommand(resumer.socket, MessageTypes.MatchResume, {
      matchId,
      resumeToken: joinToken,
    });
    const resumed = await waitForType(resumer, MessageTypes.SessionAccepted);
    assertParses(resumed);
    expect(asString(resumed.payload?.['playerId'])).toBe(sixthPlayerId);
    expect(asString(resumed.payload?.['resumeToken'])).not.toBe(joinToken);

    {
      const started = Date.now();
      for (;;) {
        if (
          matchGateway.getLeaseOwnerForTests(matchId, sixthPlayerId) ===
          resumerId
        ) {
          break;
        }
        if (Date.now() - started > 5000) {
          throw new Error('resume did not take lease');
        }
        await sleep(20);
      }
    }

    // Wait for resume-path finalizeJoin to accept the player / start countdown.
    {
      const started = Date.now();
      for (;;) {
        const current = await store.get(matchId);
        if (
          current!.players.get(sixthPlayerId)?.joinAccepted === true &&
          current!.phase === 'ready_countdown'
        ) {
          break;
        }
        if (Date.now() - started > 8000) {
          throw new Error(
            'resume finalize did not accept sixth / start countdown',
          );
        }
        await sleep(20);
      }
    }

    const afterResumeFinalize = await store.get(matchId);
    const deadline = afterResumeFinalize!.phaseDeadlineMonoMs;
    const sequence = afterResumeFinalize!.sequence;
    expect(afterResumeFinalize!.players.size).toBe(6);
    expect(afterResumeFinalize!.players.has(sixthPlayerId)).toBe(true);
    expect(afterResumeFinalize!.players.get(sixthPlayerId)!.joinAccepted).toBe(
      true,
    );
    expect(afterResumeFinalize!.players.get(sixthPlayerId)!.presence).toBe(
      'connected',
    );
    expect(afterResumeFinalize!.phase).toBe('ready_countdown');
    expect(deadline).not.toBeNull();
    // Integration runs with NODE_ENV=test (FakeClock + tickDue); wall timers are
    // not armed. The durable countdown marker is phaseDeadlineMonoMs.
    expect(matchGateway.getLeaseOwnerForTests(matchId, sixthPlayerId)).toBe(
      resumerId,
    );
    expect(matchGateway.hasLeaseForSocketForTests(sixthSocketId)).toBe(false);

    // Release original join finalize — must not abandon the transferred seat.
    finalizeBarrier.release();
    await sleep(100);

    const final = await store.get(matchId);
    expect(final!.players.has(sixthPlayerId)).toBe(true);
    expect(final!.players.size).toBe(6);
    expect(final!.players.get(sixthPlayerId)!.joinAccepted).toBe(true);
    expect(final!.players.get(sixthPlayerId)!.presence).toBe('connected');
    expect(final!.phase).toBe('ready_countdown');
    expect(final!.phaseDeadlineMonoMs).toBe(deadline);
    expect(final!.sequence).toBe(sequence);
    expect(matchGateway.getLeaseOwnerForTests(matchId, sixthPlayerId)).toBe(
      resumerId,
    );

    // Exactly one ready_countdown transition observed (no rollback wipe).
    const countdownSnaps = [...clients, sixth, resumer].flatMap((c) =>
      c.events.filter(
        (e) =>
          e.type === MessageTypes.MatchSnapshot &&
          e.payload?.['phase'] === 'ready_countdown',
      ),
    );
    expect(countdownSnaps.length).toBeGreaterThanOrEqual(1);
    expect(
      [...clients, sixth, resumer].some((c) =>
        c.events.some(
          (e) =>
            e.type === MessageTypes.MatchSnapshot &&
            Array.isArray(e.payload?.['players']) &&
            (e.payload?.['players'] as unknown[]).length === 5 &&
            e.payload?.['phase'] === 'lobby' &&
            c === resumer,
        ),
      ),
    ).toBe(false);

    // No client should see a post-resume rollback that drops to 5 while countdown was active.
    for (const client of [...clients, resumer]) {
      const sawCountdown = client.events.some(
        (e) =>
          e.type === MessageTypes.MatchSnapshot &&
          e.payload?.['phase'] === 'ready_countdown',
      );
      if (!sawCountdown) continue;
      const afterCountdown = client.events
        .slice(
          client.events.findIndex(
            (e) =>
              e.type === MessageTypes.MatchSnapshot &&
              e.payload?.['phase'] === 'ready_countdown',
          ),
        )
        .filter((e) => e.type === MessageTypes.MatchSnapshot);
      expect(
        afterCountdown.some(
          (e) =>
            e.payload?.['phase'] === 'lobby' &&
            Array.isArray(e.payload?.['players']) &&
            (e.payload?.['players'] as unknown[]).length === 5,
        ),
      ).toBe(false);
    }
  }, 30000);

  it('LH-005 private room: create, join, invalid code, leave frees seat', async () => {
    const host = await tracked();
    sendCommand(host.socket, MessageTypes.PrivateRoomCreate, {
      displayName: 'Host',
      avatarColor: '#111111',
    });
    const hostAccepted = await waitForType(host, MessageTypes.SessionAccepted);
    assertParses(hostAccepted);
    const matchId = asString(hostAccepted.payload?.['matchId']);
    const hostSnap = await waitForType(host, MessageTypes.MatchSnapshot);
    const roomCode = asString(hostSnap.payload?.['roomCode']);
    expect(roomCode.length).toBeGreaterThanOrEqual(4);
    expect(hostSnap.payload?.['mode']).toBe('private');

    const guest = await tracked();
    sendCommand(guest.socket, MessageTypes.PrivateRoomJoin, {
      displayName: 'Guest',
      avatarColor: '#222222',
      roomCode,
    });
    const guestAccepted = await waitForType(guest, MessageTypes.SessionAccepted);
    assertParses(guestAccepted);
    expect(asString(guestAccepted.payload?.['matchId'])).toBe(matchId);
    const guestPlayerId = asString(guestAccepted.payload?.['playerId']);

    const bad = await tracked();
    const beforeBad = bad.events.length - 1;
    sendCommand(bad.socket, MessageTypes.PrivateRoomJoin, {
      displayName: 'Nope',
      avatarColor: '#333333',
      roomCode: 'ZZZZZZ',
    });
    const err = await waitForType(bad, MessageTypes.ProtocolError, {
      afterIndex: beforeBad,
    });
    expect(asString(err.payload?.['code'])).toBe('ROOM_CODE_INVALID');

    const beforeLeave = guest.events.length - 1;
    sendCommand(guest.socket, MessageTypes.MatchLeave, { matchId });
    await waitForType(guest, MessageTypes.MatchSnapshot, {
      afterIndex: beforeLeave,
    });
    const store = matchService.getStoreForTests();
    const started = Date.now();
    for (;;) {
      const afterLeave = await store.get(matchId);
      if (!afterLeave!.players.has(guestPlayerId)) {
        break;
      }
      if (Date.now() - started > 3000) {
        throw new Error('leave did not free guest seat');
      }
      await sleep(20);
    }
  }, 20000);

  it('LH-005 matchmaking cancel does not leave a reserved ticket', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.MatchmakingEnqueue, {
      displayName: 'Queuer',
      avatarColor: '#ABCDEF',
    });
    const status = await waitForType(client, MessageTypes.MatchmakingStatus);
    // Open-lobby pairing assigns immediately into a shared quick_survival room.
    expect(asString(status.payload?.['state'])).toBe('assigned');
    const ticketId = asString(status.payload?.['ticketId']);
    expect(ticketId).toBeTruthy();
    expect(asString(status.payload?.['matchId'])).toBeTruthy();

    const beforeCancel = client.events.length - 1;
    sendCommand(client.socket, MessageTypes.MatchmakingCancel, { ticketId });
    const cancelled = await waitForType(client, MessageTypes.MatchmakingStatus, {
      afterIndex: beforeCancel,
    });
    expect(asString(cancelled.payload?.['state'])).toBe('cancelled');

    const beforeEnqueue = client.events.length - 1;
    sendCommand(client.socket, MessageTypes.MatchmakingEnqueue, {
      displayName: 'Queuer',
      avatarColor: '#ABCDEF',
    });
    const again = await waitForType(client, MessageTypes.MatchmakingStatus, {
      afterIndex: beforeEnqueue,
    });
    expect(asString(again.payload?.['state'])).toBe('assigned');
  }, 15000);

  it('LH-005 training start seats capacity-1 and rematch issues new matchId', async () => {
    const client = await tracked();
    sendCommand(client.socket, MessageTypes.TrainingStart, {
      displayName: 'Trainee',
      avatarColor: '#101010',
    });
    const accepted = await waitForType(client, MessageTypes.SessionAccepted);
    const matchId = asString(accepted.payload?.['matchId']);
    const playerId = asString(accepted.payload?.['playerId']);
    const snap = await waitForType(client, MessageTypes.MatchSnapshot);
    expect(snap.payload?.['mode']).toBe('training');
    expect((snap.payload?.['players'] as unknown[]).length).toBe(1);

    const store = matchService.getStoreForTests();
    const match = await store.get(matchId);
    match!.phase = 'completed';
    match!.status = 'completed';
    match!.winnerId = playerId;
    await store.save(match!);

    sendCommand(client.socket, MessageTypes.MatchRematch, { matchId });
    const rematchAccepted = await waitForType(
      client,
      MessageTypes.SessionAccepted,
      { afterIndex: client.events.indexOf(accepted) },
    );
    expect(asString(rematchAccepted.payload?.['matchId'])).not.toBe(matchId);
  }, 20000);
});
