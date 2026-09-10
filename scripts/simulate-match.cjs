#!/usr/bin/env node
/**
 * Development-only deterministic match simulation (LH-002).
 * Fails clearly when NODE_ENV=production.
 */
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { createRequire } = require('node:module');

if (process.env.NODE_ENV === 'production') {
  console.error('simulate:match is forbidden when NODE_ENV=production');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'apps/backend');
const PORT = Number(process.env.SIM_PORT || 3011);
const { io } = createRequire(path.join(BACKEND, 'package.json'))(
  'socket.io-client',
);

const REALTIME_SCHEMA_VERSION = '1';
const MessageTypes = {
  MatchCreateDev: 'match.create_dev',
  MatchJoin: 'match.join',
  MatchSubmitAnswer: 'match.submit_answer',
  MatchRequestSnapshot: 'match.request_snapshot',
  SessionAccepted: 'session.accepted',
  ChallengeStarted: 'challenge.started',
  ChallengeResolved: 'challenge.resolved',
  MatchFinished: 'match.finished',
  MatchSnapshot: 'match.snapshot',
};

function send(socket, type, payload) {
  socket.emit('command', {
    schemaVersion: REALTIME_SCHEMA_VERSION,
    type,
    messageId: randomUUID(),
    commandId: randomUUID(),
    payload,
  });
}

function track(socket) {
  const events = [];
  socket.on('event', (event) => {
    events.push(event);
  });
  return { socket, events };
}

async function waitForCount(tracked, type, count, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    const matches = tracked.events.filter((event) => event.type === type);
    if (matches.length >= count) {
      return matches[count - 1];
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for ${count}x ${type}; have=${matches.length}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function waitForType(tracked, type, afterIndex = -1, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    const found = tracked.events.find(
      (event, index) => event.type === type && index > afterIndex,
    );
    if (found) {
      return found;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timeout waiting for ${type}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function connect() {
  const socket = io(`http://127.0.0.1:${PORT}`, {
    transports: ['websocket'],
    forceNew: true,
  });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  return track(socket);
}

async function main() {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    LOG_LEVEL: 'log',
    HEALTH_CHECK_DEPENDENCIES: 'false',
    DATABASE_URL:
      process.env.DATABASE_URL ||
      'postgres://lh_local:lh_local_dev_only@127.0.0.1:5432/the_last_heart',
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  };

  const build = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['run', 'build'],
    { cwd: BACKEND, encoding: 'utf8', shell: false },
  );
  if (build.status !== 0) {
    throw new Error(`backend build failed: ${build.stderr || build.stdout}`);
  }

  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: BACKEND,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootLog = '';
  child.stdout.on('data', (d) => {
    bootLog += d.toString();
  });
  child.stderr.on('data', (d) => {
    bootLog += d.toString();
  });

  try {
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const socket = net.connect({ port: PORT, host: '127.0.0.1' }, () => {
          socket.end();
          clearInterval(timer);
          resolve(undefined);
        });
        socket.on('error', () => {
          socket.destroy();
          if (Date.now() - started > 20000) {
            clearInterval(timer);
            reject(
              new Error(
                `backend failed to start: ${bootLog || '(no output)'}`,
              ),
            );
          }
        });
      }, 200);
    });

    const clients = [];
    for (let i = 0; i < 6; i += 1) {
      clients.push(await connect());
    }

    send(clients[0].socket, MessageTypes.MatchCreateDev, {});
    const created = await waitForType(clients[0], MessageTypes.SessionAccepted);
    const matchId = created.payload.matchId;

    const players = [];
    for (let i = 0; i < 6; i += 1) {
      const before = clients[i].events.length - 1;
      send(clients[i].socket, MessageTypes.MatchJoin, { matchId });
      const accepted = await waitForType(
        clients[i],
        MessageTypes.SessionAccepted,
        before,
      );
      players.push({
        tracked: clients[i],
        playerId: accepted.payload.playerId,
        resumeToken: accepted.payload.resumeToken,
      });
    }

    for (let round = 0; round < 3; round += 1) {
      const started = await waitForCount(
        clients[0],
        MessageTypes.ChallengeStarted,
        round + 1,
      );
      const challengeInstanceId = started.payload.challengeInstanceId;
      send(players[0].tracked.socket, MessageTypes.MatchSubmitAnswer, {
        challengeInstanceId,
        answer: { choice: 'a' },
      });
      for (let i = 1; i < 6; i += 1) {
        send(players[i].tracked.socket, MessageTypes.MatchSubmitAnswer, {
          challengeInstanceId,
          answer: { choice: 'b' },
        });
      }
      await waitForCount(clients[0], MessageTypes.ChallengeResolved, round + 1);
    }

    const finished = await waitForType(clients[0], MessageTypes.MatchFinished);
    if (finished.payload.winnerId !== players[0].playerId) {
      throw new Error('unexpected winner');
    }

    const snapshots = [];
    for (const player of players) {
      const before = player.tracked.events.length - 1;
      send(player.tracked.socket, MessageTypes.MatchRequestSnapshot, {
        matchId,
      });
      const snap = await waitForType(
        player.tracked,
        MessageTypes.MatchSnapshot,
        before,
      );
      snapshots.push(snap.payload);
    }

    const canonical = JSON.stringify(snapshots[0]);
    for (const snap of snapshots) {
      if (JSON.stringify(snap) !== canonical) {
        throw new Error('client snapshots diverged');
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          matchId,
          winnerId: finished.payload.winnerId,
          sequence: snapshots[0].sequence,
          revision: snapshots[0].revision,
        },
        null,
        2,
      ),
    );

    for (const client of clients) {
      client.socket.disconnect();
    }
    process.exitCode = 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

main();
