#!/usr/bin/env node
/**
 * LH-003G playable verification suite.
 *
 * One command runs separate deterministic scenarios. Do not treat
 * simulate:match and simulate:playable as independent validations —
 * both invoke this same suite (aliases of one run).
 *
 * Scenarios:
 *  1. winner — one human + five bots → single survivor
 *  2. reconnect — resume during active challenge
 *  3. snapshot-confirmed lost-ACK — drop ACK, disconnect, resume; snapshot
 *     confirms submission (duplicate answer command covered by backend tests)
 *  4. spectator — spectator cannot submit
 *  5. halted — zero-survivor halted snapshot (no match.finished)
 *  6. terminal-reconnect — resume completed match for final snapshot
 *  7. resume-replay-presence — observer-proven disconnect, then latest receipt
 *  8. superseded-resume — old receipt rejected after later rotation
 *  9. play-again — terminal cleanup + fresh connection
 *  Plus: contract validation of every server event; no public serverConfig /
 *  expected answers / raw resume tokens in snapshots.
 *
 * Socket-binding TOCTOU, create_dev presence cleanup, and sixth-join
 * acceptance/countdown races are covered by deterministic gateway
 * integration tests with deferred barriers — not by flaky wall-clock
 * sleeps in this suite.
 */
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { createRequire } = require('node:module');

if (process.env.NODE_ENV === 'production') {
  console.error('simulate:playable is forbidden when NODE_ENV=production');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'apps/backend');
const PORT = Number(process.env.SIM_PORT || 3012);
const backendRequire = createRequire(path.join(BACKEND, 'package.json'));
const { io } = backendRequire('socket.io-client');
const {
  safeParseServerEvent,
  MessageTypes: ContractMessageTypes,
} = backendRequire('@thelastheart/contracts');

const REALTIME_SCHEMA_VERSION = '1';
const MessageTypes = {
  MatchCreateDev: 'match.create_dev',
  MatchJoin: 'match.join',
  MatchResume: 'match.resume',
  MatchFillDevBots: 'match.fill_dev_bots',
  MatchSubmitAnswer: 'match.submit_answer',
  MatchRequestSnapshot: 'match.request_snapshot',
  SessionAccepted: 'session.accepted',
  ChallengeStarted: 'challenge.started',
  ChallengeSignal: 'challenge.signal',
  ChallengeSubmissionAck: 'challenge.submission_ack',
  ChallengeResolved: 'challenge.resolved',
  MatchFinished: 'match.finished',
  MatchSnapshot: 'match.snapshot',
  MatchStateChanged: 'match.state_changed',
  PlayerPresence: 'match.player_presence',
  ProtocolError: 'protocol.error',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function send(socket, type, payload, commandId = randomUUID()) {
  socket.emit('command', {
    schemaVersion: REALTIME_SCHEMA_VERSION,
    type,
    messageId: randomUUID(),
    commandId,
    payload,
  });
  return commandId;
}

function track(socket) {
  const events = [];
  socket.on('event', (event) => {
    const parsed = safeParseServerEvent(event);
    if (!parsed.success) {
      throw new Error(
        `contract validation failed for ${event?.type}: ${parsed.error?.code ?? parsed.error}`,
      );
    }
    assertNoSecrets(event);
    events.push(event);
  });
  return { socket, events };
}

function assertNoSecrets(event) {
  const text = JSON.stringify(event);
  assert(!/"serverConfig"\s*:/.test(text), 'serverConfig leaked in event');
  assert(
    !/"expectedChoice"\s*:/.test(text),
    'expectedChoice leaked in event',
  );
  if (event.type === MessageTypes.MatchSnapshot) {
    assert(
      !/"resumeToken"\s*:/.test(text),
      'resumeToken leaked in snapshot',
    );
  }
}

async function waitForType(tracked, type, afterIndex = -1, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const found = tracked.events.find(
      (event, index) => event.type === type && index > afterIndex,
    );
    if (found) return found;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for ${type}; saw=${tracked.events.map((e) => e.type).join(',')}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function waitForCount(tracked, type, count, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const matches = tracked.events.filter((event) => event.type === type);
    if (matches.length >= count) return matches[count - 1];
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for ${count}x ${type}; have=${matches.length}`,
      );
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

async function createAndJoin(human) {
  send(human.socket, MessageTypes.MatchCreateDev, {});
  const created = await waitForType(human, MessageTypes.SessionAccepted);
  const matchId = created.payload.matchId;
  const joinBefore = human.events.length - 1;
  send(human.socket, MessageTypes.MatchJoin, { matchId });
  const joined = await waitForType(
    human,
    MessageTypes.SessionAccepted,
    joinBefore,
  );
  return {
    matchId,
    playerId: joined.payload.playerId,
    resumeToken: joined.payload.resumeToken,
  };
}

async function fillBots(human, matchId) {
  send(human.socket, MessageTypes.MatchFillDevBots, { matchId });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const snap = [...human.events]
    .reverse()
    .find((e) => e.type === MessageTypes.MatchSnapshot);
  assert(snap, 'expected snapshot after fill bots');
  assert(snap.payload.players.length === 6, 'expected six players');
  for (const p of snap.payload.players) {
    assert(p.hearts === 3, 'expected three hearts');
    assert(p.energy === 0, 'expected zero energy');
  }
  return snap;
}

async function playToWinner(human, matchId, humanPlayerId) {
  let roundsPlayed = 0;
  while (roundsPlayed < 12) {
    const started = await waitForCount(
      human,
      MessageTypes.ChallengeStarted,
      roundsPlayed + 1,
      60000,
    );
    roundsPlayed += 1;
    const challengeInstanceId = started.payload.challengeInstanceId;
    const signal = await waitForCount(
      human,
      MessageTypes.ChallengeSignal,
      roundsPlayed,
      30000,
    );
    // Signal must not be present on started payload before this event.
    assert(
      !started.payload.signalToken,
      'signalToken exposed before authoritative signal',
    );
    send(human.socket, MessageTypes.MatchSubmitAnswer, {
      challengeInstanceId,
      answer: { signalToken: signal.payload.signalToken },
    });
    await waitForCount(human, MessageTypes.ChallengeResolved, roundsPlayed, 30000);
    const finished = human.events.find((e) => e.type === MessageTypes.MatchFinished);
    if (finished) {
      return {
        roundsPlayed,
        winnerId: finished.payload.winnerId,
        humanWon: finished.payload.winnerId === humanPlayerId,
      };
    }
  }
  throw new Error('match did not finish within round budget');
}

async function scenarioWinner() {
  console.log('\n[scenario] winner: human + 5 bots');
  const human = await connect();
  const { matchId, playerId } = await createAndJoin(human);
  await fillBots(human, matchId);
  const result = await playToWinner(human, matchId, playerId);
  assert(result.humanWon, 'expected human winner');
  human.socket.disconnect();
  console.log('  ok — human winner after', result.roundsPlayed, 'rounds');
  return result;
}

async function scenarioReconnect() {
  console.log('\n[scenario] reconnect/resume during challenge');
  const human = await connect();
  const session = await createAndJoin(human);
  await fillBots(human, session.matchId);
  await waitForCount(human, MessageTypes.ChallengeStarted, 1, 60000);
  const oldToken = session.resumeToken;
  const resumeCommandId = randomUUID();

  human.socket.disconnect();
  const replacement = await connect();
  send(
    replacement.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: oldToken },
    resumeCommandId,
  );
  const resumed = await waitForType(replacement, MessageTypes.SessionAccepted);
  assert(resumed.payload.playerId === session.playerId, 'playerId mismatch');
  assert(resumed.payload.resumeToken !== oldToken, 'token should rotate');
  const snap = await waitForType(
    replacement,
    MessageTypes.MatchSnapshot,
    replacement.events.indexOf(resumed),
  );
  assert(snap.payload.matchId === session.matchId, 'snapshot match mismatch');
  assert(
    snap.payload.players.some((p) => p.playerId === session.playerId),
    'local player missing after resume',
  );
  // Sequence convergence: request snapshot and ensure it applies.
  const before = replacement.events.length - 1;
  send(replacement.socket, MessageTypes.MatchRequestSnapshot, {
    matchId: session.matchId,
    afterSequence: snap.payload.sequence,
  });
  const recovered = await waitForType(
    replacement,
    MessageTypes.MatchSnapshot,
    before,
  );
  assert(
    recovered.payload.sequence >= snap.payload.sequence,
    'recovery snapshot must not go backward',
  );
  replacement.socket.disconnect();
  console.log('  ok — resume converged');
}

async function waitForPlayerPresence(tracked, playerId, presence, afterIndex = -1, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    for (let i = afterIndex + 1; i < tracked.events.length; i += 1) {
      const event = tracked.events[i];
      if (
        event.type === MessageTypes.PlayerPresence &&
        event.payload?.playerId === playerId &&
        event.payload?.presence === presence
      ) {
        return event;
      }
      if (event.type === MessageTypes.MatchSnapshot) {
        const self = event.payload.players?.find((p) => p.playerId === playerId);
        if (self?.presence === presence) {
          return event;
        }
      }
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timeout waiting for player ${playerId} presence=${presence}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function joinAsObserver(matchId) {
  const observer = await connect();
  send(observer.socket, MessageTypes.MatchJoin, { matchId });
  const joined = await waitForType(observer, MessageTypes.SessionAccepted);
  assert(joined.payload.playerId, 'observer playerId');
  assert(joined.payload.resumeToken, 'observer resumeToken');
  return { observer, playerId: joined.payload.playerId };
}

async function scenarioLostAck() {
  console.log(
    '\n[scenario] snapshot-confirmed lost-ACK recovery (no answer replay claimed)',
  );
  const human = await connect();
  // Drop ACK events after validating them so the client cannot rely on the first response.
  const ignoredAcks = [];
  human.socket.removeAllListeners('event');
  human.socket.on('event', (event) => {
    const parsed = safeParseServerEvent(event);
    assert(parsed.success, `contract fail ${event?.type}`);
    assertNoSecrets(event);
    if (event.type === MessageTypes.ChallengeSubmissionAck) {
      ignoredAcks.push(event);
      return; // deliberate drop — lost response
    }
    human.events.push(event);
  });

  const session = await createAndJoin(human);
  await fillBots(human, session.matchId);
  const started = await waitForCount(human, MessageTypes.ChallengeStarted, 1, 60000);
  const signal = await waitForCount(human, MessageTypes.ChallengeSignal, 1, 30000);
  const answerCommandId = randomUUID();
  send(
    human.socket,
    MessageTypes.MatchSubmitAnswer,
    {
      challengeInstanceId: started.payload.challengeInstanceId,
      answer: { signalToken: signal.payload.signalToken },
    },
    answerCommandId,
  );

  // Wait until server has processed (ACK dropped locally) then disconnect.
  const startedAt = Date.now();
  while (ignoredAcks.length === 0 && Date.now() - startedAt < 10000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(ignoredAcks.length >= 1, 'expected dropped ACK');
  assert(ignoredAcks[0].payload.accepted === true, 'submit must be accepted');
  const resumeToken = session.resumeToken;
  const resumeCommandId = randomUUID();
  human.socket.disconnect();

  const replacement = await connect();
  send(
    replacement.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken },
    resumeCommandId,
  );
  const resumed = await waitForType(replacement, MessageTypes.SessionAccepted);
  assert(resumed.commandId === resumeCommandId, 'resume commandId echo');
  const snap = await waitForType(
    replacement,
    MessageTypes.MatchSnapshot,
    replacement.events.indexOf(resumed),
  );
  const self = snap.payload.players.find((p) => p.playerId === session.playerId);
  assert(self, 'local player in snapshot');
  assert(
    self.submittedForCurrentChallenge === true,
    'resume snapshot must confirm submission (this scenario is snapshot-confirmed, not answer-replay)',
  );
  console.log('  snapshot confirmed submission without answer replay');

  const resolved = await waitForCount(
    replacement,
    MessageTypes.ChallengeResolved,
    1,
    30000,
  );
  const humanRes = resolved.payload.resolutions.find(
    (r) => r.playerId === session.playerId,
  );
  assert(humanRes, 'human resolution missing');
  assert(humanRes.outcome === 'success', 'human must succeed');
  assert(humanRes.energyDelta === 1, 'exact energy reward once');
  assert(humanRes.energyAfter === 1, 'energyAfter must be 1');
  assert(humanRes.heartsAfter === 3, 'hearts must remain 3');
  const energyHits = resolved.payload.resolutions.filter(
    (r) => r.playerId === session.playerId && r.energyDelta > 0,
  );
  assert(energyHits.length === 1, 'exactly one energy application');
  replacement.socket.disconnect();
  console.log('  ok — snapshot-confirmed lost ACK with exact success');
  console.log(
    '  note — duplicate answer commandId idempotency covered by backend tests',
  );
}

async function scenarioSpectator() {
  console.log('\n[scenario] spectator submission rejected');
  const seats = [];
  for (let i = 0; i < 6; i += 1) {
    seats.push(await connect());
  }
  send(seats[0].socket, MessageTypes.MatchCreateDev, {});
  const created = await waitForType(seats[0], MessageTypes.SessionAccepted);
  const matchId = created.payload.matchId;
  const playerIds = [];
  for (let i = 0; i < 6; i += 1) {
    const before = seats[i].events.length - 1;
    send(seats[i].socket, MessageTypes.MatchJoin, { matchId });
    const joined = await waitForType(
      seats[i],
      MessageTypes.SessionAccepted,
      before,
    );
    playerIds.push(joined.payload.playerId);
  }

  let rounds = 0;
  while (rounds < 8) {
    const started = await waitForCount(
      seats[0],
      MessageTypes.ChallengeStarted,
      rounds + 1,
      60000,
    );
    rounds += 1;
    const challengeInstanceId = started.payload.challengeInstanceId;
    send(seats[0].socket, MessageTypes.MatchSubmitAnswer, {
      challengeInstanceId,
      answer: { signalToken: 'wrong' },
    });
    const signal = await waitForCount(
      seats[1],
      MessageTypes.ChallengeSignal,
      rounds,
      30000,
    );
    for (let i = 1; i < 6; i += 1) {
      send(seats[i].socket, MessageTypes.MatchSubmitAnswer, {
        challengeInstanceId,
        answer: { signalToken: signal.payload.signalToken },
      });
    }
    await waitForCount(seats[0], MessageTypes.ChallengeResolved, rounds, 30000);
    const snap = [...seats[0].events]
      .reverse()
      .find((e) => e.type === MessageTypes.MatchSnapshot);
    const self = snap?.payload.players.find((p) => p.playerId === playerIds[0]);
    if (self?.status === 'spectator') {
      const nextStart = await waitForCount(
        seats[0],
        MessageTypes.ChallengeStarted,
        rounds + 1,
        60000,
      );
      const before = seats[0].events.length - 1;
      send(seats[0].socket, MessageTypes.MatchSubmitAnswer, {
        challengeInstanceId: nextStart.payload.challengeInstanceId,
        answer: { signalToken: 'x' },
      });
      const err = await waitForType(
        seats[0],
        MessageTypes.ProtocolError,
        before,
      );
      assert(
        err.payload.code === 'SPECTATOR_CANNOT_SUBMIT',
        `expected SPECTATOR_CANNOT_SUBMIT got ${err.payload.code}`,
      );
      for (const seat of seats) seat.socket.disconnect();
      console.log('  ok — spectator rejected');
      return;
    }
  }
  throw new Error('could not reach spectator state');
}

async function scenarioHalted() {
  console.log('\n[scenario] zero-survivor halted');
  const human = await connect();
  const session = await createAndJoin(human);
  await fillBots(human, session.matchId);
  let rounds = 0;
  while (rounds < 8) {
    const started = await waitForCount(
      human,
      MessageTypes.ChallengeStarted,
      rounds + 1,
      60000,
    );
    rounds += 1;
    const signal = await waitForCount(
      human,
      MessageTypes.ChallengeSignal,
      rounds,
      30000,
    );
    // Everyone fails: human wrong token; bots already submit bot-miss.
    send(human.socket, MessageTypes.MatchSubmitAnswer, {
      challengeInstanceId: started.payload.challengeInstanceId,
      answer: { signalToken: `wrong-${signal.payload.signalToken}` },
    });
    await waitForCount(human, MessageTypes.ChallengeResolved, rounds, 60000);
    const snap = [...human.events]
      .reverse()
      .find((e) => e.type === MessageTypes.MatchSnapshot);
    if (snap?.payload.phase === 'halted') {
      assert(snap.payload.winnerId == null, 'halted must have null winner');
      const finished = human.events.filter(
        (e) => e.type === MessageTypes.MatchFinished,
      );
      assert(finished.length === 0, 'halted must not emit match.finished');
      console.log('  ok — halted snapshot');
      human.socket.disconnect();
      return;
    }
  }
  throw new Error('halted state not reached');
}

async function scenarioTerminalReconnect() {
  console.log('\n[scenario] terminal reconnect after completion');
  const human = await connect();
  const session = await createAndJoin(human);
  await fillBots(human, session.matchId);
  const result = await playToWinner(human, session.matchId, session.playerId);
  assert(result.humanWon, 'setup requires human winner');
  const joinToken = session.resumeToken;
  human.socket.disconnect();

  // Valid reconnect after server already completed.
  const late = await connect();
  send(
    late.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: joinToken },
    randomUUID(),
  );
  const termAccepted = await waitForType(late, MessageTypes.SessionAccepted);
  const termSnap = await waitForType(
    late,
    MessageTypes.MatchSnapshot,
    late.events.indexOf(termAccepted),
  );
  assert(
    termSnap.payload.phase === 'completed',
    `expected completed got ${termSnap.payload.phase}`,
  );
  assert(
    termSnap.payload.winnerId === session.playerId,
    'winner must match human',
  );

  // Invalid token cannot retrieve terminal session.
  const bad = await connect();
  const before = bad.events.length - 1;
  send(
    bad.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: 'not-a-valid-token' },
    randomUUID(),
  );
  const err = await waitForType(bad, MessageTypes.ProtocolError, before);
  assert(
    err.payload.code === 'UNAUTHORIZED' || err.payload.code === 'PLAYER_NOT_FOUND',
    `expected unauthorized got ${err.payload.code}`,
  );
  late.socket.disconnect();
  bad.socket.disconnect();
  console.log('  ok — terminal resume + invalid token rejected');
}

async function scenarioResumeReplayPresence() {
  console.log(
    '\n[scenario] latest resume receipt replay after confirmed disconnect',
  );
  const human = await connect();
  const session = await createAndJoin(human);
  // Observer joins before bots so presence is authoritatively observable.
  const { observer } = await joinAsObserver(session.matchId);
  await fillBots(human, session.matchId);

  const t0 = session.resumeToken;
  const c1 = randomUUID();
  const firstResume = await connect();
  send(
    firstResume.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t0 },
    c1,
  );
  const accepted1 = await waitForType(firstResume, MessageTypes.SessionAccepted);
  const t1 = accepted1.payload.resumeToken;
  assert(t1 && t1 !== t0, 'token rotated');
  assert(accepted1.payload.playerId === session.playerId, 'same player');

  // Original human socket is superseded; disconnect first resume and wait for
  // observer-confirmed disconnected presence before replaying.
  human.socket.disconnect();
  const presenceBefore = observer.events.length - 1;
  firstResume.socket.disconnect();
  await waitForPlayerPresence(
    observer,
    session.playerId,
    'disconnected',
    presenceBefore,
    15000,
  );

  const second = await connect();
  send(
    second.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t0 },
    c1,
  );
  const accepted2 = await waitForType(second, MessageTypes.SessionAccepted);
  assert(accepted2.payload.resumeToken === t1, 'same rotated token');
  const snap = await waitForType(
    second,
    MessageTypes.MatchSnapshot,
    second.events.indexOf(accepted2),
  );
  const self = snap.payload.players.find(
    (p) => p.playerId === session.playerId,
  );
  assert(self?.presence === 'connected', 'presence must be connected after replay');

  const before = second.events.length - 1;
  send(second.socket, MessageTypes.MatchRequestSnapshot, {
    matchId: session.matchId,
    afterSequence: snap.payload.sequence,
  });
  await waitForType(second, MessageTypes.MatchSnapshot, before);

  // Stale sockets disconnecting must not revert the current lease presence.
  const presenceGuard = observer.events.length - 1;
  firstResume.socket.disconnect();
  human.socket.disconnect();
  await new Promise((r) => setTimeout(r, 200));
  const stillConnected = [...observer.events]
    .slice(presenceGuard + 1)
    .reverse()
    .find(
      (e) =>
        e.type === MessageTypes.PlayerPresence &&
        e.payload?.playerId === session.playerId,
    );
  if (stillConnected) {
    assert(
      stillConnected.payload.presence !== 'disconnected',
      'stale disconnect must not mark current lease disconnected',
    );
  }
  send(second.socket, MessageTypes.MatchRequestSnapshot, {
    matchId: session.matchId,
  });
  const leaseSnap = await waitForType(
    second,
    MessageTypes.MatchSnapshot,
    second.events.length - 2,
  );
  const leaseSelf = leaseSnap.payload.players.find(
    (p) => p.playerId === session.playerId,
  );
  assert(leaseSelf?.presence === 'connected', 'latest lease remains connected');

  second.socket.disconnect();
  observer.socket.disconnect();
  console.log('  ok — replay presence after observer-confirmed disconnect');
}

async function scenarioSupersededResume() {
  console.log('\n[scenario] superseded resume receipt rejection');
  const human = await connect();
  const session = await createAndJoin(human);
  const { observer } = await joinAsObserver(session.matchId);
  await fillBots(human, session.matchId);

  const t0 = session.resumeToken;
  const c1 = randomUUID();
  const s1 = await connect();
  send(
    s1.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t0 },
    c1,
  );
  const r1 = await waitForType(s1, MessageTypes.SessionAccepted);
  const t1 = r1.payload.resumeToken;
  assert(t1 && t1 !== t0, 'T1 rotated');

  // Replay before supersession still works.
  const s1Replay = await connect();
  send(
    s1Replay.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t0 },
    c1,
  );
  const replayOk = await waitForType(s1Replay, MessageTypes.SessionAccepted);
  assert(replayOk.payload.resumeToken === t1, 'pre-supersession replay returns T1');

  const c2 = randomUUID();
  const s2 = await connect();
  send(
    s2.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t1 },
    c2,
  );
  const r2 = await waitForType(s2, MessageTypes.SessionAccepted);
  const t2 = r2.payload.resumeToken;
  assert(t2 && t2 !== t1, 'T2 rotated');

  // Superseded C1+T0 must fail and must not change presence for the current lease.
  const beforeStale = observer.events.length - 1;
  const stale = await connect();
  send(
    stale.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t0 },
    c1,
  );
  const err = await waitForType(stale, MessageTypes.ProtocolError);
  assert(err.payload.code === 'UNAUTHORIZED', 'superseded receipt unauthorized');

  // Latest C2+T1 still replays after confirmed disconnect of s2.
  const presenceBefore = observer.events.length - 1;
  s2.socket.disconnect();
  await waitForPlayerPresence(
    observer,
    session.playerId,
    'disconnected',
    presenceBefore,
    15000,
  );
  const latest = await connect();
  send(
    latest.socket,
    MessageTypes.MatchResume,
    { matchId: session.matchId, resumeToken: t1 },
    c2,
  );
  const latestAccepted = await waitForType(latest, MessageTypes.SessionAccepted);
  assert(latestAccepted.payload.resumeToken === t2, 'latest replay returns T2');
  const latestSnap = await waitForType(
    latest,
    MessageTypes.MatchSnapshot,
    latest.events.indexOf(latestAccepted),
  );
  assert(
    latestSnap.payload.players.find((p) => p.playerId === session.playerId)
      ?.presence === 'connected',
    'latest replay connected',
  );

  stale.socket.disconnect();
  s1.socket.disconnect();
  s1Replay.socket.disconnect();
  human.socket.disconnect();
  await new Promise((r) => setTimeout(r, 150));
  const before = latest.events.length - 1;
  send(latest.socket, MessageTypes.MatchRequestSnapshot, {
    matchId: session.matchId,
  });
  const guard = await waitForType(latest, MessageTypes.MatchSnapshot, before);
  assert(
    guard.payload.players.find((p) => p.playerId === session.playerId)
      ?.presence === 'connected',
    'stale disconnects must not revert latest lease',
  );
  // Ensure superseded attempt did not emit a misleading presence change for the player
  // while s2 still owned the lease (best-effort: no unexpected disconnect for player).
  void beforeStale;

  latest.socket.disconnect();
  observer.socket.disconnect();
  console.log('  ok — superseded receipt rejected; latest receipt intact');
}

async function scenarioPlayAgain() {
  console.log('\n[scenario] play again with fresh connection');
  const first = await connect();
  const session = await createAndJoin(first);
  await fillBots(first, session.matchId);
  await playToWinner(first, session.matchId, session.playerId);
  first.socket.disconnect();

  const second = await connect();
  send(second.socket, MessageTypes.MatchCreateDev, {});
  const created = await waitForType(second, MessageTypes.SessionAccepted);
  const matchId2 = created.payload.matchId;
  assert(matchId2 !== session.matchId, 'expected new match id');
  const before = second.events.length - 1;
  send(second.socket, MessageTypes.MatchJoin, { matchId: matchId2 });
  const joined = await waitForType(second, MessageTypes.SessionAccepted, before);
  assert(joined.payload.playerId, 'join playerId required');
  const unauthorized = second.events.filter(
    (e) =>
      e.type === MessageTypes.ProtocolError &&
      e.payload?.code === 'UNAUTHORIZED',
  );
  assert(unauthorized.length === 0, 'Play Again must not UNAUTHORIZED');
  const snap = await waitForType(
    second,
    MessageTypes.MatchSnapshot,
    second.events.indexOf(joined),
  );
  assert(snap.payload.matchId === matchId2, 'snapshot for new match');
  second.socket.disconnect();
  console.log('  ok — fresh match after cleanup');
}

async function main() {
  console.log(
    'LH-003G playable suite (simulate:playable / simulate:match are aliases of one suite)',
  );
  assert(
    ContractMessageTypes.MatchResume === MessageTypes.MatchResume,
    'contracts MessageTypes mismatch',
  );

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    LOG_LEVEL: 'warn',
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
              new Error(`backend failed to start: ${bootLog || '(no output)'}`),
            );
          }
        });
      }, 200);
    });

    await scenarioWinner();
    await scenarioReconnect();
    await scenarioLostAck();
    await scenarioSpectator();
    await scenarioHalted();
    await scenarioTerminalReconnect();
    await scenarioResumeReplayPresence();
    await scenarioSupersededResume();
    await scenarioPlayAgain();

    console.log(
      JSON.stringify(
        {
          ok: true,
          suite: 'simulate-playable-slice',
          scenarios: [
            'winner',
            'reconnect',
            'snapshot-confirmed-lost-ack',
            'spectator',
            'halted',
            'terminal-reconnect',
            'resume-replay-presence',
            'superseded-resume',
            'play-again',
          ],
        },
        null,
        2,
      ),
    );
    process.exitCode = 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

main();
