import { createDevChallengeDefinition } from '../domain/dev-challenge.evaluator';
import { DomainError, FakeClock } from '../domain/types';
import { MatchService } from './match.service';

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
});
