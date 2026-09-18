import { matchSnapshotPayloadSchema } from '@thelastheart/contracts';
import { createDevChallengeDefinition } from '../domain/dev-challenge.evaluator';
import {
  isDifficultySorted,
  MAX_PLAYLIST_RECYCLES,
} from '../domain/playlist-difficulty';
import { DomainError, FakeClock } from '../domain/types';
import { MatchService } from './match.service';
import { MatchmakingService } from './matchmaking.service';

function assertUniqueDifficultyOrder(
  playlist: { definitionId: string; difficulty?: string }[],
) {
  expect(new Set(playlist.map((d) => d.definitionId)).size).toBe(
    playlist.length,
  );
  expect(isDifficultySorted(playlist as never)).toBe(true);
}

describe('MatchService', () => {
  it('reschedules timeout when forceTimeout runs at inclusive deadline equality', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const { matchId } = await service.createDevMatch();
    // Join six via engine so the service does not schedule lobby phase timers.
    const engine = service.getEngineForTests();
    const store = service.getStoreForTests();
    let match = await store.get(matchId);
    for (let i = 0; i < 6; i += 1) {
      match = engine.joinPlayer(match!, {
        playerId: `p${i}`,
        resumeTokenHash: `h${i}`,
      }).match;
    }
    await store.save(match!);

    await service.startDevRound(
      matchId,
      createDevChallengeDefinition({
        durationMs: 3000,
        serverConfig: { expectedChoice: 'a' },
      }),
    );

    match = await store.get(matchId);
    expect(match?.status).toBe('challenge_active');
    const deadline = match!.currentChallenge!.deadlineMonoMs;

    // Clear the initial wall timer; drive timeout via forceTimeout at equality.
    service['clearTimer'](matchId);
    clock.advance(deadline - clock.monoMs());
    expect(clock.monoMs()).toBe(deadline);

    await service.forceTimeout(matchId);
    match = await store.get(matchId);
    expect(match?.status).toBe('challenge_active');
    expect(match?.currentChallenge?.status).toBe('active');
    // Inclusive deadline boundary: timer must be rescheduled so timeout cannot vanish.
    expect(service['timers'].has(matchId)).toBe(true);

    clock.advance(1);
    await service.forceTimeout(matchId);
    match = await store.get(matchId);
    // Timeout applied (challenge resolved and advanced out of challenge_active).
    expect(match?.status).not.toBe('challenge_active');
    expect(match?.currentChallenge?.status).not.toBe('active');

    service.onModuleDestroy();
  });

  it('resume receipt replay restores connected presence without rotating token', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const { matchId } = await service.createDevMatch();
    const joined = await service.joinMatch(matchId);
    const commandId = 'resume-cmd-1';

    const first = await service.resumeMatch({
      matchId,
      resumeToken: joined.resumeToken,
      commandId,
    });
    expect(first.resumeToken).not.toBe(joined.resumeToken);

    await service.markDisconnected(matchId, first.playerId);
    const snap = await service.requestSnapshot(matchId);
    expect(
      snap.snapshot.players.find((p) => p.playerId === first.playerId)
        ?.presence,
    ).toBe('disconnected');

    const replay = await service.resumeMatch({
      matchId,
      resumeToken: joined.resumeToken,
      commandId,
    });
    expect(replay.resumeToken).toBe(first.resumeToken);
    expect(replay.playerId).toBe(first.playerId);
    expect(
      replay.snapshot.players.find((p) => p.playerId === first.playerId)
        ?.presence,
    ).toBe('connected');
  });

  it('rejects superseded resume receipts after a later rotation', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const { matchId } = await service.createDevMatch();

    // 1. Join → T0
    const joined = await service.joinMatch(matchId);
    const t0 = joined.resumeToken;
    const playerId = joined.playerId;
    const seqAfterJoin = joined.snapshot.sequence;

    // 2. Resume C1+T0 → T1
    const c1 = 'resume-c1';
    const first = await service.resumeMatch({
      matchId,
      resumeToken: t0,
      commandId: c1,
    });
    const t1 = first.resumeToken;
    expect(t1).not.toBe(t0);
    expect(first.playerId).toBe(playerId);

    // 3. Replay C1+T0 before supersession → same T1
    const replayBefore = await service.resumeMatch({
      matchId,
      resumeToken: t0,
      commandId: c1,
    });
    expect(replayBefore.resumeToken).toBe(t1);
    expect(replayBefore.playerId).toBe(playerId);

    // 4. Resume C2+T1 → T2
    const c2 = 'resume-c2';
    const second = await service.resumeMatch({
      matchId,
      resumeToken: t1,
      commandId: c2,
    });
    const t2 = second.resumeToken;
    expect(t2).not.toBe(t1);
    const store = service.getStoreForTests();
    const afterC2 = await store.get(matchId);
    const hashAfterC2 = afterC2!.players.get(playerId)!.resumeTokenHash;
    const presenceAfterC2 = afterC2!.players.get(playerId)!.presence;
    const seqAfterC2 = afterC2!.sequence;

    // 5. Replay old C1+T0 → rejected
    await expect(
      service.resumeMatch({
        matchId,
        resumeToken: t0,
        commandId: c1,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      service.resumeMatch({
        matchId,
        resumeToken: t0,
        commandId: c1,
      }),
    ).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND' });

    // 6. Confirm old replay didn't modify presence/token/sequence
    const afterReject = await store.get(matchId);
    expect(afterReject!.players.get(playerId)!.resumeTokenHash).toBe(
      hashAfterC2,
    );
    expect(afterReject!.players.get(playerId)!.presence).toBe(presenceAfterC2);
    expect(afterReject!.sequence).toBe(seqAfterC2);
    expect(seqAfterC2).toBeGreaterThanOrEqual(seqAfterJoin);

    // 7. Replay latest C2+T1 → same T2 (no re-rotate)
    await service.markDisconnected(matchId, playerId);
    const latestReplay = await service.resumeMatch({
      matchId,
      resumeToken: t1,
      commandId: c2,
    });
    expect(latestReplay.resumeToken).toBe(t2);
    expect(latestReplay.playerId).toBe(playerId);
    expect(
      latestReplay.snapshot.players.find((p) => p.playerId === playerId)
        ?.presence,
    ).toBe('connected');

    service.onModuleDestroy();
  });

  it('duplicate answer commandId replay does not double-resolve or double-reward', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const { matchId } = await service.createDevMatch();
    const players: Array<{ playerId: string; resumeToken: string }> = [];
    for (let i = 0; i < 6; i += 1) {
      players.push(await service.joinMatch(matchId));
    }

    await service.startDevRound(
      matchId,
      createDevChallengeDefinition({
        durationMs: 5000,
        energyRewardOnSuccess: 2,
        heartPenaltyOnFailure: 1,
        serverConfig: { expectedChoice: 'a' },
      }),
    );

    const snap = await service.requestSnapshot(matchId);
    const challengeInstanceId =
      snap.snapshot.currentChallenge!.challengeInstanceId;
    const commandId = 'dup-answer-cmd';

    const first = await service.submitAnswer({
      matchId,
      playerId: players[0]!.playerId,
      challengeInstanceId,
      commandId,
      answer: { choice: 'a' },
    });
    expect(first.duplicate).toBe(false);
    expect(first.ack.accepted).toBe(true);

    const second = await service.submitAnswer({
      matchId,
      playerId: players[0]!.playerId,
      challengeInstanceId,
      commandId,
      answer: { choice: 'a' },
    });
    expect(second.duplicate).toBe(true);
    expect(second.ack.accepted).toBe(true);
    expect(second.snapshot.sequence).toBe(first.snapshot.sequence);

    // Finish the round with unique commandIds for remaining players.
    for (let i = 1; i < 6; i += 1) {
      await service.submitAnswer({
        matchId,
        playerId: players[i]!.playerId,
        challengeInstanceId,
        commandId: `other-${i}`,
        answer: { choice: 'b' },
      });
    }

    const final = await service.requestSnapshot(matchId);
    const winner = final.snapshot.players.find(
      (p) => p.playerId === players[0]!.playerId,
    );
    expect(winner?.energy).toBe(2);
    expect(winner?.hearts).toBe(3);

    service.onModuleDestroy();
  });

  it('requestSnapshot is linearized through the per-match queue', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const { matchId } = await service.createDevMatch();
    await service.joinMatch(matchId);

    const order: string[] = [];
    let blockerStarted = false;
    const blocker = service['enqueue'](matchId, async () => {
      blockerStarted = true;
      order.push('blocker-start');
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push('blocker-end');
    });

    while (!blockerStarted) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const snapPromise = service.requestSnapshot(matchId).then(() => {
      order.push('snapshot');
    });

    await blocker;
    await snapPromise;
    expect(order).toEqual(['blocker-start', 'blocker-end', 'snapshot']);

    service.onModuleDestroy();
  });

  it('finalizeJoin is player-specific: countdown only after all six accepted', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const { matchId } = await service.createDevMatch();
    const store = service.getStoreForTests();
    const engine = service.getEngineForTests();

    const countdownPhases: string[] = [];
    const unsubscribe = service.onBroadcast((broadcast) => {
      if (broadcast.snapshot.phase === 'ready_countdown') {
        countdownPhases.push(broadcast.snapshot.phase);
      }
    });

    const reserved = [];
    for (let i = 0; i < 6; i += 1) {
      reserved.push(await service.joinMatch(matchId));
    }

    let match = await store.get(matchId);
    expect(match!.players.size).toBe(6);
    expect(match!.phase).toBe('lobby');
    expect(
      [...match!.players.values()].every((p) => p.joinAccepted === false),
    ).toBe(true);

    // Finalize first five — must not start countdown despite size === 6.
    for (let i = 0; i < 5; i += 1) {
      await service.finalizeJoin(matchId, reserved[i]!.playerId);
    }
    match = await store.get(matchId);
    expect(match!.phase).toBe('lobby');
    expect(match!.phaseDeadlineMonoMs).toBeNull();
    expect(service.hasPhaseTimerForTests(matchId)).toBe(false);
    expect(countdownPhases).toEqual([]);
    expect(engine.allJoinsAccepted(match!)).toBe(false);

    const seqBefore = match!.sequence;
    await service.finalizeJoin(matchId, reserved[5]!.playerId);
    match = await store.get(matchId);
    expect(match!.phase).toBe('ready_countdown');
    expect(match!.phaseDeadlineMonoMs).not.toBeNull();
    expect(service.hasPhaseTimerForTests(matchId)).toBe(true);
    expect(countdownPhases).toEqual(['ready_countdown']);
    expect(engine.allJoinsAccepted(match!)).toBe(true);

    const deadline = match!.phaseDeadlineMonoMs;
    const seqAfter = match!.sequence;

    // Duplicate finalizeJoin is idempotent — no second countdown/timer/deadline.
    await service.finalizeJoin(matchId, reserved[2]!.playerId);
    await service.finalizeJoin(matchId, reserved[5]!.playerId);
    match = await store.get(matchId);
    expect(match!.phase).toBe('ready_countdown');
    expect(match!.phaseDeadlineMonoMs).toBe(deadline);
    expect(match!.sequence).toBe(seqAfter);
    expect(match!.sequence).toBeGreaterThan(seqBefore);
    expect(countdownPhases).toEqual(['ready_countdown']);
    expect(service.hasPhaseTimerForTests(matchId)).toBe(true);

    unsubscribe();
    service.onModuleDestroy();
  });

  it('finalizeJoin without lease ownership does not accept or start countdown', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const { matchId } = await service.createDevMatch();
    const store = service.getStoreForTests();

    const reserved = [];
    for (let i = 0; i < 6; i += 1) {
      reserved.push(await service.joinMatch(matchId));
    }
    for (let i = 0; i < 5; i += 1) {
      await service.finalizeJoin(matchId, reserved[i]!.playerId);
    }

    const result = await service.finalizeJoin(matchId, reserved[5]!.playerId, {
      stillOwnsLease: () => false,
    });
    expect(result.outcome).toBe('leaseLost');
    expect(result.countdownStarted).toBe(false);
    const match = await store.get(matchId);
    expect(match!.players.get(reserved[5]!.playerId)!.joinAccepted).toBe(false);
    expect(match!.phase).toBe('lobby');
    expect(match!.phaseDeadlineMonoMs).toBeNull();
    expect(service.hasPhaseTimerForTests(matchId)).toBe(false);

    service.onModuleDestroy();
  });

  it('leaveMatch frees a lobby seat and cancels countdown', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const room = await service.createPrivateRoom({
      displayName: 'Host',
      avatarColor: '#112233',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(room.matchId, room.playerId);
    const guest = await service.joinPrivateRoom({
      roomCode: room.roomCode,
      displayName: 'Guest',
      avatarColor: '#445566',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(room.matchId, guest.playerId);

    const left = await service.leaveMatch(room.matchId, guest.playerId);
    expect(left.left).toBe(true);
    expect(left.emptied).toBe(false);
    expect(left.snapshot?.players).toHaveLength(1);
    expect(
      left.snapshot?.players.some((p) => p.playerId === guest.playerId),
    ).toBe(false);

    service.onModuleDestroy();
  });

  it('quick leave reopens fill wait so the seat is joinable again', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const guestId = created.assignments[1]!.playerId;

    clock.advance(30_000);
    const left = await service.leaveMatch(created.matchId, guestId);
    expect(left.left).toBe(true);
    expect(left.emptied).toBe(false);
    expect(left.lobbyFillWaitMs).toBe(60_000);
    expect(left.snapshot?.players).toHaveLength(1);
    expect(left.snapshot?.lobbyFillDeadlineAtMs).toBe(
      clock.nowMs() + 60_000,
    );
    expect(left.snapshot?.hostPlayerId).toBe(created.assignments[0]!.playerId);

    const openId = await service.findOpenQuickSurvivalLobby();
    expect(openId).toBe(created.matchId);

    // Even after the original fill window would have elapsed, the refreshed
    // deadline keeps this room open for packing.
    clock.advance(45_000);
    expect(await service.findOpenQuickSurvivalLobby()).toBe(created.matchId);

    service.onModuleDestroy();
  });

  it('findOpenQuickSurvivalLobby still returns a solo lobby past fill deadline', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'SoloHost', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    clock.advance(60_000);
    expect(await service.findOpenQuickSurvivalLobby()).toBe(created.matchId);
    service.onModuleDestroy();
  });

  it('exposes lobbyFillDeadlineAtMs and sets first seat as host', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    expect(created.snapshot.lobbyFillDeadlineAtMs).toBe(
      clock.nowMs() + 60_000,
    );
    expect(created.snapshot.hostPlayerId).toBe(
      created.assignments[0]!.playerId,
    );
    service.onModuleDestroy();
  });

  it('host can extend fill wait; non-host cannot', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;

    clock.advance(40_000);
    await expect(
      service.extendLobbyFill(created.matchId, guestId),
    ).rejects.toMatchObject({ code: 'NOT_HOST' });

    const extended = await service.extendLobbyFill(created.matchId, hostId);
    // Remaining was 20s + 30s = 50s (under 120s cap).
    expect(extended.lobbyFillWaitMs).toBe(50_000);
    expect(extended.snapshot.lobbyFillDeadlineAtMs).toBe(
      clock.nowMs() + 50_000,
    );

    clock.advance(50_000);
    const resolved = await service.resolveQuickLobbyFill(created.matchId);
    expect(resolved.outcome).toBe('started');

    service.onModuleDestroy();
  });

  it('host can start lobby early with two players; non-host and solo cannot', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const solo = await service.createQuickSurvivalMatch([
      { displayName: 'Alone', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    await expect(
      service.startLobbyNow(solo.matchId, solo.assignments[0]!.playerId),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });

    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;

    await expect(
      service.startLobbyNow(created.matchId, guestId),
    ).rejects.toMatchObject({ code: 'NOT_HOST' });

    const started = await service.startLobbyNow(created.matchId, hostId);
    expect(started.snapshot.phase).toBe('ready_countdown');
    expect(started.snapshot.players).toHaveLength(2);

    service.onModuleDestroy();
  });

  it('three-player host start advances past ready_countdown into the playlist', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Third', avatarColor: '#333333', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }
    const hostId = created.assignments[0]!.playerId;
    const started = await service.startLobbyNow(created.matchId, hostId);
    expect(started.snapshot.phase).toBe('ready_countdown');
    expect(started.snapshot.players).toHaveLength(3);

    clock.advance(3001);
    await service.tickDue(created.matchId);
    const after = await service.getStoreForTests().get(created.matchId);
    expect(after?.phase).toBe('challenge_active');
    expect(after?.players.size).toBe(3);
    expect(after?.currentChallenge?.status).toBe('active');

    const snap = service.getEngineForTests().toPublicSnapshot(after!);
    const parsed = matchSnapshotPayloadSchema.safeParse(snap);
    expect(parsed.success).toBe(true);
    const bytes = Buffer.byteLength(JSON.stringify(snap), 'utf8');
    expect(bytes).toBeLessThan(1_048_576);

    service.onModuleDestroy();
  });

  it('extend rejects full lobby and ready_countdown', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const seats = Array.from({ length: 6 }, (_, i) => ({
      displayName: `N${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))}${String.fromCharCode(97 + Math.floor(i / 676))}`,
      avatarColor: '#112233',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    }));
    const created = await service.createQuickSurvivalMatch(seats);
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }
    const match = await service.getStoreForTests().get(created.matchId);
    expect(match?.phase).toBe('ready_countdown');
    await expect(
      service.extendLobbyFill(
        created.matchId,
        created.assignments[0]!.playerId,
      ),
    ).rejects.toMatchObject({ code: 'NOT_LOBBY' });
    service.onModuleDestroy();
  });

  it('transfers host when the host leaves a quick lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    const left = await service.leaveMatch(created.matchId, hostId);
    expect(left.snapshot?.hostPlayerId).toBe(guestId);
    service.onModuleDestroy();
  });

  it('private room rejects invalid room codes', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    await expect(
      service.joinPrivateRoom({
        roomCode: 'ZZZZZZ',
        displayName: 'Guest',
        avatarColor: '#445566',
        countryCode: 'SA',
      playerId: 'install-test-player-01',
      }),
    ).rejects.toMatchObject({ code: 'ROOM_CODE_INVALID' });
    service.onModuleDestroy();
  });

  it('private room rejects a duplicate display name', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const host = await service.createPrivateRoom({
      displayName: 'وجدي',
      avatarColor: '#111111',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await expect(
      service.joinPrivateRoom({
        roomCode: host.roomCode,
        displayName: 'وجدي',
        avatarColor: '#222222',
        countryCode: 'SA',
      playerId: 'install-test-player-01',
      }),
    ).rejects.toMatchObject({ code: 'DISPLAY_NAME_TAKEN' });
    service.onModuleDestroy();
  });

  it('private six accepted+ready starts one countdown', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const host = await service.createPrivateRoom({
      displayName: 'Host',
      avatarColor: '#111111',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(host.matchId, host.playerId);

    const seats = [host];
    for (let i = 1; i < 6; i += 1) {
      const joined = await service.joinPrivateRoom({
        roomCode: host.roomCode,
        displayName: `N${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))}${String.fromCharCode(97 + Math.floor(i / 676))}`,
        avatarColor: '#222222',
        countryCode: 'SA',
      playerId: 'install-test-player-01',
      });
      await service.finalizeJoin(host.matchId, joined.playerId);
      seats.push(joined);
    }

    const store = service.getStoreForTests();
    let match = await store.get(host.matchId);
    expect(match!.phase).toBe('lobby');

    for (let i = 0; i < 5; i += 1) {
      await service.setReady(host.matchId, seats[i]!.playerId);
      match = await store.get(host.matchId);
      expect(match!.phase).toBe('lobby');
    }
    const ready = await service.setReady(host.matchId, seats[5]!.playerId);
    expect(ready.countdownStarted).toBe(true);
    match = await store.get(host.matchId);
    expect(match!.phase).toBe('ready_countdown');

    // Second ready wave must not restart countdown.
    const deadline = match!.phaseDeadlineMonoMs;
    await service.setReady(host.matchId, seats[0]!.playerId);
    match = await store.get(host.matchId);
    expect(match!.phaseDeadlineMonoMs).toBe(deadline);

    service.onModuleDestroy();
  });

  it('private two accepted+ready starts countdown without full table', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const host = await service.createPrivateRoom({
      displayName: 'Host',
      avatarColor: '#111111',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(host.matchId, host.playerId);

    const guest = await service.joinPrivateRoom({
      roomCode: host.roomCode,
      displayName: 'Guest',
      avatarColor: '#222222',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    expect(guest.lobbyFillWaitMs).toBe(60_000);
    expect(guest.snapshot.lobbyFillDeadlineAtMs).toBe(clock.nowMs() + 60_000);
    await service.finalizeJoin(host.matchId, guest.playerId);

    const store = service.getStoreForTests();
    let match = await store.get(host.matchId);
    expect(match!.phase).toBe('lobby');

    await service.setReady(host.matchId, host.playerId);
    match = await store.get(host.matchId);
    expect(match!.phase).toBe('lobby');

    const ready = await service.setReady(host.matchId, guest.playerId);
    expect(ready.countdownStarted).toBe(true);
    match = await store.get(host.matchId);
    expect(match!.phase).toBe('ready_countdown');
    expect(match!.lobbyFillDeadlineAtMs).toBeNull();

    service.onModuleDestroy();
  });

  it('private host can start now and extend fill wait', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const host = await service.createPrivateRoom({
      displayName: 'Host',
      avatarColor: '#111111',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(host.matchId, host.playerId);

    const guest = await service.joinPrivateRoom({
      roomCode: host.roomCode,
      displayName: 'Guest',
      avatarColor: '#222222',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(host.matchId, guest.playerId);

    await expect(
      service.extendLobbyFill(host.matchId, guest.playerId),
    ).rejects.toMatchObject({ code: 'NOT_HOST' });

    clock.advance(40_000);
    const extended = await service.extendLobbyFill(
      host.matchId,
      host.playerId,
    );
    expect(extended.lobbyFillWaitMs).toBe(50_000);

    await expect(
      service.startLobbyNow(host.matchId, guest.playerId),
    ).rejects.toMatchObject({ code: 'NOT_HOST' });

    const started = await service.startLobbyNow(host.matchId, host.playerId);
    expect(started.snapshot.phase).toBe('ready_countdown');

    service.onModuleDestroy();
  });

  it('training starts with capacity 1', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const started = await service.startTraining({
      displayName: 'Trainee',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    expect(started.snapshot.mode).toBe('training');
    expect(started.snapshot.players).toHaveLength(1);

    const finalized = await service.finalizeJoin(
      started.matchId,
      started.playerId,
    );
    expect(finalized.countdownStarted).toBe(true);
    const store = service.getStoreForTests();
    const match = await store.get(started.matchId);
    expect(match!.playerCapacity).toBe(1);
    expect(match!.phase).toBe('ready_countdown');

    service.onModuleDestroy();
  });

  it('training.retry carries remaining hearts; resets to 3 after wipe', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const started = await service.startTraining({
      displayName: 'Trainee',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(started.matchId, started.playerId);
    const store = service.getStoreForTests();

    let match = await store.get(started.matchId);
    const firstDefinitionId = match!.pinnedPlaylist[0]!.definitionId;
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = 1;
    const player = match!.players.get(started.playerId)!;
    player.hearts = 2;
    player.energy = 1;
    await store.save(match!);

    const midRetry = await service.retryTraining(
      started.matchId,
      started.playerId,
    );
    expect(midRetry.matchId).not.toBe(started.matchId);
    const carried = midRetry.snapshot.players[0];
    expect(carried?.hearts).toBe(2);
    expect(carried?.energy).toBe(1);

    await service.finalizeJoin(midRetry.matchId, midRetry.playerId);
    match = await store.get(midRetry.matchId);
    expect(match!.pinnedPlaylist).toHaveLength(1);
    expect(match!.pinnedPlaylist[0]!.definitionId).toBe(firstDefinitionId);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = 1;
    const wiped = match!.players.get(midRetry.playerId)!;
    wiped.hearts = 0;
    wiped.energy = 4;
    wiped.status = 'spectator';
    await store.save(match!);

    const fresh = await service.retryTraining(
      midRetry.matchId,
      midRetry.playerId,
    );
    expect(fresh.matchId).not.toBe(midRetry.matchId);
    expect(fresh.snapshot.players[0]?.hearts).toBe(3);
    expect(fresh.snapshot.players[0]?.energy).toBe(0);
    expect(fresh.snapshot.players[0]?.status).toBe('active');

    await service.finalizeJoin(fresh.matchId, fresh.playerId);
    const retriedMatch = await store.get(fresh.matchId);
    expect(retriedMatch!.pinnedPlaylist).toHaveLength(1);
    expect(retriedMatch!.pinnedPlaylist[0]!.definitionId).toBe(
      firstDefinitionId,
    );

    service.onModuleDestroy();
  });

  it('training.restart opens a fresh full pack with full hearts', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const started = await service.startTraining({
      displayName: 'Trainee',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(started.matchId, started.playerId);
    const store = service.getStoreForTests();

    let match = await store.get(started.matchId);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = 3;
    const player = match!.players.get(started.playerId)!;
    player.hearts = 1;
    player.energy = 2;
    await store.save(match!);

    const restarted = await service.restartTraining(
      started.matchId,
      started.playerId,
    );
    expect(restarted.matchId).not.toBe(started.matchId);
    expect(restarted.snapshot.players[0]?.hearts).toBe(3);
    expect(restarted.snapshot.players[0]?.energy).toBe(0);

    await service.finalizeJoin(restarted.matchId, restarted.playerId);
    match = await store.get(restarted.matchId);
    assertUniqueDifficultyOrder(match!.pinnedPlaylist);
    expect(match!.pinnedPlaylist.length).toBeGreaterThan(10);

    service.onModuleDestroy();
  });

  it('rematch returns a new matchId with the caller as host', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const started = await service.startTraining({
      displayName: 'Trainee',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(started.matchId, started.playerId);
    const store = service.getStoreForTests();
    let match = await store.get(started.matchId);
    match!.phase = 'completed';
    match!.status = 'completed';
    match!.winnerId = started.playerId;
    await store.save(match!);

    const rematched = await service.rematch(started.matchId, started.playerId);
    expect(rematched.matchId).not.toBe(started.matchId);
    expect(rematched.snapshot.mode).toBe('training');
    expect(rematched.snapshot.players).toHaveLength(1);
    expect(rematched.snapshot.hostPlayerId).toBe(rematched.playerId);

    service.onModuleDestroy();
  });

  it('rematch party joins the same lobby; first clicker is host', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const a = created.assignments[0]!;
    const b = created.assignments[1]!;
    for (const seat of created.assignments) {
      await service.finalizeJoin(created.matchId, seat.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'completed';
    match!.status = 'completed';
    match!.winnerId = a.playerId;
    await store.save(match!);

    const first = await service.rematch(created.matchId, a.playerId);
    // Solo rematch must not arm fill-abort (keeps the lobby for the party).
    expect(first.lobbyFillWaitMs).toBeUndefined();
    expect(first.snapshot.lobbyFillDeadlineAtMs).toBeNull();

    const broadcasts: Array<{ matchId: string; sequence: number }> = [];
    service.onBroadcast((b) => {
      broadcasts.push({
        matchId: b.matchId,
        sequence: b.snapshot.sequence,
      });
    });

    const second = await service.rematch(created.matchId, b.playerId);
    expect(second.matchId).toBe(first.matchId);
    expect(first.snapshot.hostPlayerId).toBe(first.playerId);
    expect(second.snapshot.players).toHaveLength(2);
    expect(second.snapshot.hostPlayerId).toBe(first.playerId);
    expect(second.lobbyFillWaitMs).toBe(60_000);
    expect(second.snapshot.lobbyFillDeadlineAtMs).toBe(
      clock.nowMs() + 60_000,
    );
    // Host already seated must receive a bumped snap with the fill deadline
    // (mobile gates Start now on lobbyFillDeadlineAtMs).
    const fillBroadcast = broadcasts.find(
      (b) =>
        b.matchId === first.matchId &&
        b.sequence > first.snapshot.sequence,
    );
    expect(fillBroadcast).toBeTruthy();
    const hostView = await service.requestSnapshot(first.matchId);
    expect(hostView.snapshot.lobbyFillDeadlineAtMs).toBe(
      clock.nowMs() + 60_000,
    );

    service.onModuleDestroy();
  });

  it('concurrent rematch from two seats lands in one lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Wajdi', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Mahmoud', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const a = created.assignments[0]!;
    const b = created.assignments[1]!;
    for (const seat of created.assignments) {
      await service.finalizeJoin(created.matchId, seat.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'completed';
    match!.status = 'completed';
    match!.winnerId = a.playerId;
    await store.save(match!);

    const [first, second] = await Promise.all([
      service.rematch(created.matchId, a.playerId),
      service.rematch(created.matchId, b.playerId),
    ]);

    expect(second.matchId).toBe(first.matchId);
    expect(first.playerId).not.toBe(second.playerId);
    const lobby = await store.get(first.matchId);
    expect(lobby!.phase).toBe('lobby');
    expect(lobby!.status).toBe('waiting');
    expect(lobby!.players.size).toBe(2);
    expect([first.playerId, second.playerId]).toContain(lobby!.hostPlayerId);

    const again = await service.rematch(created.matchId, a.playerId);
    expect(again.matchId).toBe(first.matchId);
    expect(again.playerId).toBe(first.playerId);
    expect((await store.get(first.matchId))!.players.size).toBe(2);

    service.onModuleDestroy();
  });

  it('late rematch after party window still joins the open rematch lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Ace', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Bea', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const a = created.assignments[0]!;
    const b = created.assignments[1]!;
    for (const seat of created.assignments) {
      await service.finalizeJoin(created.matchId, seat.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'completed';
    match!.status = 'completed';
    match!.winnerId = a.playerId;
    await store.save(match!);

    const first = await service.rematch(created.matchId, a.playerId);
    clock.advance(60_001);
    const second = await service.rematch(created.matchId, b.playerId);

    expect(second.matchId).toBe(first.matchId);
    expect((await store.get(first.matchId))!.players.size).toBe(2);
    expect(second.lobbyFillWaitMs).toBe(60_000);

    service.onModuleDestroy();
  });

  it('solo rematch lobby is not aborted by fill resolve while party waits', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Ace', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Bea', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const a = created.assignments[0]!;
    const b = created.assignments[1]!;
    for (const seat of created.assignments) {
      await service.finalizeJoin(created.matchId, seat.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'completed';
    match!.status = 'completed';
    match!.winnerId = a.playerId;
    await store.save(match!);

    const first = await service.rematch(created.matchId, a.playerId);
    // Force a spent fill deadline as if a timer had been armed elsewhere.
    const lobby = await store.get(first.matchId);
    lobby!.lobbyFillDeadlineAtMs = clock.nowMs() - 1;
    lobby!.lobbyFillDeadlineMonoMs = clock.monoMs() - 1;
    await store.save(lobby!);

    const resolved = await service.resolveQuickLobbyFill(first.matchId);
    expect(resolved.outcome).toBe('noop');
    expect(await store.get(first.matchId)).toBeTruthy();

    const second = await service.rematch(created.matchId, b.playerId);
    expect(second.matchId).toBe(first.matchId);
    expect((await store.get(first.matchId))!.players.size).toBe(2);

    service.onModuleDestroy();
  });

  it('bot fill exposes isBot true in snapshot', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'development' });
    const { matchId } = await service.createDevMatch();
    const human = await service.joinMatch(matchId, {
      displayName: 'Human',
      avatarColor: '#010101',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(matchId, human.playerId);
    const filled = await service.fillDevBots(matchId);
    const bots = filled.snapshot.players.filter((p) => p.isBot === true);
    expect(bots.length).toBe(5);
    expect(filled.botIds).toHaveLength(5);

    service.onModuleDestroy();
  });

  it('matchmaking cancel frees the ticket', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(service);
    const queued = await mm.enqueue({
      displayName: 'Queued',
      avatarColor: '#123456',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    expect(queued.state).toBe('assigned');
    expect(mm.getTicket(queued.ticketId)).toBeTruthy();

    const cancelled = await mm.cancel(queued.ticketId);
    expect(cancelled?.state).toBe('cancelled');
    expect(mm.getTicket(queued.ticketId)).toBeUndefined();

    // Same identity can enqueue again after cancel.
    const again = await mm.enqueue({
      displayName: 'Queued',
      avatarColor: '#123456',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    expect(again.state).toBe('assigned');

    mm.onModuleDestroy();
    service.onModuleDestroy();
  });

  it('after the last playlist round, equal hearts starts a fresh recycle', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    expect(match).toBeTruthy();
    assertUniqueDifficultyOrder(match!.pinnedPlaylist);
    expect(match!.pinnedPlaylist[0]?.difficulty).toBe('easy');
    // Exhausted base playlist with 2+ hearts still alive → recycle, do not draw yet.
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = Math.max(match!.pinnedPlaylist.length, 1);
    match!.phaseDeadlineAtMs = clock.nowMs();
    match!.phaseDeadlineMonoMs = clock.monoMs();
    match!.players.get(hostId)!.hearts = 2;
    match!.players.get(guestId)!.hearts = 2;
    await store.save(match!);

    await service.tickDue(created.matchId);
    const after = await store.get(created.matchId);
    expect(after?.winnerId).toBeNull();
    expect(after?.phase).not.toBe('draw');
    expect(after?.status === 'challenge_active' || after?.phase === 'power_action').toBe(
      true,
    );
    expect(after!.roundNumber).toBeGreaterThan(match!.roundNumber);

    service.onModuleDestroy();
  });

  it('stops after two fresh playlist recycles and crowns by standings', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber =
      match!.pinnedPlaylist.length * (MAX_PLAYLIST_RECYCLES + 1);
    match!.phaseDeadlineAtMs = clock.nowMs();
    match!.phaseDeadlineMonoMs = clock.monoMs();
    match!.players.get(hostId)!.hearts = 2;
    match!.players.get(guestId)!.hearts = 1;
    await store.save(match!);

    await service.tickDue(created.matchId);
    const after = await store.get(created.matchId);
    expect(after?.status).toBe('completed');
    expect(after?.winnerId).toBe(hostId);

    service.onModuleDestroy();
  });

  it('training advances to the next playlist challenge while hearts remain', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const started = await service.startTraining({
      displayName: 'Trainee',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
      playerId: 'install-test-player-01',
    });
    await service.finalizeJoin(started.matchId, started.playerId);
    const store = service.getStoreForTests();

    const match = await store.get(started.matchId);
    assertUniqueDifficultyOrder(match!.pinnedPlaylist);
    expect(match!.pinnedPlaylist.length).toBeGreaterThan(10);
    expect(
      match!.pinnedPlaylist.some((d) => d.engineId === 'social.pair_sync'),
    ).toBe(false);
    expect(match!.pinnedPlaylist[0]?.difficulty).toBe('easy');
    expect(
      match!.pinnedPlaylist[match!.pinnedPlaylist.length - 1]?.difficulty,
    ).toBe('hard');
    expect(
      match!.pinnedPlaylist.map((d) => d.engineId),
    ).toEqual(
      expect.arrayContaining([
        'reaction.wait_for_signal',
        'trap.no_touch',
        'gesture.reverse_swipe',
        'tap.precision',
        'memory.sequence',
        'hold.multitouch',
        'motion.shake',
        'motion.tilt_balance',
        'audio.cue',
      ]),
    );
    expect(
      match!.powerConfig == null ||
        match!.powerConfig.powers.every(
          (p) => !p.eligibleModes.includes('training'),
        ),
    ).toBe(true);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = 1;
    match!.phaseDeadlineAtMs = clock.nowMs();
    match!.phaseDeadlineMonoMs = clock.monoMs();
    match!.players.get(started.playerId)!.hearts = 2;
    await store.save(match!);

    await service.tickDue(started.matchId);
    const after = await store.get(started.matchId);
    expect(after?.winnerId).toBeNull();
    expect(after?.phase).not.toBe('completed');
    expect(after?.status).toBe('challenge_active');
    expect(after!.roundNumber).toBe(2);
    expect(after!.currentChallenge?.definitionId).toBe(
      match!.pinnedPlaylist[1]!.definitionId,
    );

    service.onModuleDestroy();
  });

  it('live mid-playlist with 2+ hearts does not end the match', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    expect(match!.pinnedPlaylist.length).toBeGreaterThan(2);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = 2;
    match!.phaseDeadlineAtMs = clock.nowMs();
    match!.phaseDeadlineMonoMs = clock.monoMs();
    match!.players.get(hostId)!.hearts = 2;
    match!.players.get(guestId)!.hearts = 1;
    await store.save(match!);

    await service.tickDue(created.matchId);
    const after = await store.get(created.matchId);
    expect(after?.winnerId).toBeNull();
    expect(after?.phase).not.toBe('completed');
    expect(after?.phase).not.toBe('draw');
    expect(after!.roundNumber).toBeGreaterThan(2);

    service.onModuleDestroy();
  });

  it('mid-match leave keeps the player on the roster as left', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    let match = await store.get(created.matchId);
    match!.phase = 'challenge_active';
    match!.status = 'challenge_active';
    await store.save(match!);

    const left = await service.leaveMatch(created.matchId, guestId);
    expect(left.left).toBe(true);
    expect(left.emptied).toBe(false);
    const guest = left.snapshot?.players.find((p) => p.playerId === guestId);
    expect(guest?.status).toBe('left');
    expect(guest?.presence).toBe('disconnected');
    expect(left.snapshot?.players.some((p) => p.playerId === hostId)).toBe(
      true,
    );

    match = await store.get(created.matchId);
    expect(match!.players.get(guestId)!.status).toBe('left');
    // 2→1 live leave must crown the remaining player immediately.
    expect(match!.phase).toBe('completed');
    expect(match!.status).toBe('completed');
    expect(match!.winnerId).toBe(hostId);

    service.onModuleDestroy();
  });

  it('disconnect grace leave ends a 2-player live match for the survivor', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    let match = await store.get(created.matchId);
    match!.phase = 'challenge_active';
    match!.status = 'challenge_active';
    await store.save(match!);

    await service.markDisconnected(created.matchId, guestId);
    match = await store.get(created.matchId);
    expect(match!.players.get(guestId)!.presence).toBe('disconnected');
    expect(match!.players.get(guestId)!.status).toBe('active');
    expect(match!.phase).toBe('challenge_active');

    await service.expireDisconnectGraceForTests(created.matchId, guestId);
    match = await store.get(created.matchId);
    expect(match!.players.get(guestId)!.status).toBe('left');
    expect(match!.phase).toBe('completed');
    expect(match!.winnerId).toBe(hostId);

    service.onModuleDestroy();
  });

  it('resume during disconnect grace keeps the 2-player match alive', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const guestId = created.assignments[1]!.playerId;
    const guestToken = created.assignments[1]!.resumeToken;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    let match = await store.get(created.matchId);
    match!.phase = 'challenge_active';
    match!.status = 'challenge_active';
    await store.save(match!);

    await service.markDisconnected(created.matchId, guestId);
    await service.resumeMatch({
      matchId: created.matchId,
      resumeToken: guestToken,
      commandId: 'resume-after-disconnect',
    });

    await service.expireDisconnectGraceForTests(created.matchId, guestId);
    match = await store.get(created.matchId);
    expect(match!.players.get(guestId)!.status).toBe('active');
    expect(match!.players.get(guestId)!.presence).toBe('connected');
    expect(match!.phase).toBe('challenge_active');
    expect(match!.winnerId).toBeNull();

    service.onModuleDestroy();
  });

  it('does not advance to another live round while a survivor is disconnected', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = 2;
    match!.phaseDeadlineAtMs = clock.nowMs();
    match!.phaseDeadlineMonoMs = clock.monoMs();
    match!.players.get(hostId)!.hearts = 2;
    match!.players.get(guestId)!.hearts = 2;
    match!.players.get(guestId)!.presence = 'disconnected';
    await store.save(match!);

    await service.tickDue(created.matchId);
    const after = await store.get(created.matchId);
    expect(after?.winnerId).toBeNull();
    expect(after?.phase).toBe('round_result');
    expect(after?.status).toBe('waiting');
    expect(after!.roundNumber).toBe(2);

    service.onModuleDestroy();
  });

  it('equal hearts with no survivors ends in a draw', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const created = await service.createQuickSurvivalMatch([
      { displayName: 'Host', avatarColor: '#111111', countryCode: 'SA' , playerId: 'install-test-player-01' },
      { displayName: 'Guest', avatarColor: '#222222', countryCode: 'SA' , playerId: 'install-test-player-01' },
    ]);
    const hostId = created.assignments[0]!.playerId;
    const guestId = created.assignments[1]!.playerId;
    for (const a of created.assignments) {
      await service.finalizeJoin(created.matchId, a.playerId);
    }

    const store = service.getStoreForTests();
    const match = await store.get(created.matchId);
    match!.phase = 'round_result';
    match!.status = 'waiting';
    match!.roundNumber = Math.max(match!.pinnedPlaylist.length, 1);
    match!.phaseDeadlineAtMs = clock.nowMs();
    match!.phaseDeadlineMonoMs = clock.monoMs();
    match!.players.get(hostId)!.hearts = 0;
    match!.players.get(hostId)!.status = 'spectator';
    match!.players.get(guestId)!.hearts = 0;
    match!.players.get(guestId)!.status = 'spectator';
    await store.save(match!);

    await service.tickDue(created.matchId);
    const after = await store.get(created.matchId);
    expect(after?.phase).toBe('draw');
    expect(after?.status).toBe('completed');
    expect(after?.winnerId).toBeNull();

    service.onModuleDestroy();
  });
});
