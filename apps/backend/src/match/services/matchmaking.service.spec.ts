import { FakeClock } from '../domain/types';
import { MatchService } from './match.service';
import { MatchmakingService } from './matchmaking.service';

describe('MatchmakingService', () => {
  it('seats the first player into a new open lobby immediately', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const status = await mm.enqueue({
      displayName: 'Solo',
      avatarColor: '#112233',
      countryCode: 'SA',
    });
    expect(status.state).toBe('assigned');
    expect(status.matchId).toBeTruthy();
    expect(status.assignment?.playerId).toBeTruthy();
    expect(status.acceptedSeats).toBe(1);

    const snap = await matches.requestSnapshot(status.matchId!);
    expect(snap.snapshot.mode).toBe('quick_survival');
    expect(snap.snapshot.phase).toBe('lobby');
    expect(snap.snapshot.players).toHaveLength(1);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('joins a second player into the same open lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const first = await mm.enqueue({
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
    });
    expect(first.state).toBe('assigned');

    const second = await mm.enqueue({
      displayName: 'Beta',
      avatarColor: '#222222',
      countryCode: 'SA',
    });
    expect(second.state).toBe('assigned');
    expect(second.matchId).toBe(first.matchId);
    expect(second.acceptedSeats).toBe(2);

    const snap = await matches.requestSnapshot(first.matchId!);
    expect(snap.snapshot.players).toHaveLength(2);
    expect(snap.snapshot.phase).toBe('lobby');

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('opens a second lobby only after the first is full', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const firstRoom: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const status = await mm.enqueue({
        displayName: `P${i}`,
        avatarColor: '#112233',
        countryCode: 'SA',
      });
      expect(status.state).toBe('assigned');
      firstRoom.push(status.matchId!);
      await matches.finalizeJoin(status.matchId!, status.assignment!.playerId);
    }
    expect(new Set(firstRoom).size).toBe(1);

    const overflow = await mm.enqueue({
      displayName: 'Overflow',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
    });
    expect(overflow.state).toBe('assigned');
    expect(overflow.matchId).not.toBe(firstRoom[0]);
    expect(overflow.acceptedSeats).toBe(1);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('does not bot-fill even when policy is enabled', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({
      clock,
      nodeEnv: 'test',
      botFillEnabled: true,
      botFillWaitMs: 1,
    });
    const mm = MatchmakingService.forTests(matches, {
      botFillEnabled: true,
      botFillWaitMs: 1,
    });

    const first = await mm.enqueue({
      displayName: 'Solo',
      avatarColor: '#ABCDEF',
      countryCode: 'SA',
    });
    expect(first.state).toBe('assigned');
    expect(first.acceptedSeats).toBe(1);

    await mm.scanForTests();
    const snap = await matches.requestSnapshot(first.matchId!);
    expect(snap.snapshot.players).toHaveLength(1);
    expect(snap.snapshot.players.every((p) => p.isBot !== true)).toBe(true);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('packs 100 concurrent enqueues into rooms of at most 6', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        mm.enqueue({
          displayName: `Burst${i}`,
          avatarColor: '#112233',
          countryCode: 'SA',
        }),
      ),
    );

    expect(results.every((r) => r.state === 'assigned')).toBe(true);
    expect(results.every((r) => r.matchId && r.assignment?.playerId)).toBe(
      true,
    );

    const byMatch = new Map<string, number>();
    for (const status of results) {
      const id = status.matchId!;
      byMatch.set(id, (byMatch.get(id) ?? 0) + 1);
    }

    expect(byMatch.size).toBe(Math.ceil(100 / 6));
    for (const [matchId, count] of byMatch) {
      expect(count).toBeLessThanOrEqual(6);
      const snap = await matches.requestSnapshot(matchId);
      expect(snap.snapshot.players.length).toBe(count);
      expect(snap.snapshot.players.length).toBeLessThanOrEqual(6);
      expect(snap.snapshot.mode).toBe('quick_survival');
      expect(snap.snapshot.phase).toBe('lobby');
    }

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('after fill wait, starts with 2+ players but aborts a solo lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const solo = await mm.enqueue({
      displayName: 'Alone',
      avatarColor: '#111111',
      countryCode: 'SA',
    });
    expect(solo.state).toBe('assigned');
    clock.advance(60_000);
    const timedOut: string[] = [];
    mm.onStatus((e) => {
      if (e.state === 'timed_out') {
        timedOut.push(e.ticketId);
      }
    });
    await mm.resolveLobbyFillForTests(solo.matchId!);
    expect(timedOut).toContain(solo.ticketId);
    expect(await matches.getStoreForTests().get(solo.matchId!)).toBeUndefined();

    const a = await mm.enqueue({
      displayName: 'A',
      avatarColor: '#222222',
      countryCode: 'SA',
    });
    const b = await mm.enqueue({
      displayName: 'B',
      avatarColor: '#333333',
      countryCode: 'SA',
    });
    expect(a.matchId).toBe(b.matchId);
    clock.advance(60_000);
    await mm.resolveLobbyFillForTests(a.matchId!);
    const started = await matches.getStoreForTests().get(a.matchId!);
    expect(started?.phase).toBe('ready_countdown');
    expect(started?.players.size).toBe(2);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('cancel leaves the open lobby seat so the name can requeue', async () => {
    const matches = MatchService.forTests({
      clock: new FakeClock(1),
      nodeEnv: 'test',
    });
    const mm = MatchmakingService.forTests(matches);
    const queued = await mm.enqueue({
      displayName: 'Ghost',
      avatarColor: '#000000',
      countryCode: 'SA',
    });
    expect(queued.state).toBe('assigned');
    const matchId = queued.matchId!;

    await mm.cancel(queued.ticketId);
    expect(mm.getTicket(queued.ticketId)).toBeUndefined();
    expect(await matches.getStoreForTests().get(matchId)).toBeUndefined();

    const again = await mm.enqueue({
      displayName: 'Ghost',
      avatarColor: '#000000',
      countryCode: 'SA',
    });
    expect(again.state).toBe('assigned');
    expect(again.matchId).toBeTruthy();
    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('after fill deadline, a second enqueue still joins the same open lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const host = await mm.enqueue({
      displayName: 'HostWait',
      avatarColor: '#111111',
      countryCode: 'SA',
    });
    expect(host.state).toBe('assigned');

    // Past fill deadline: previously findOpen sealed the room and opened a
    // second match for the next player while the host still sat in lobby.
    clock.advance(60_000);
    expect(await matches.findOpenQuickSurvivalLobby()).toBe(host.matchId);

    const guest = await mm.enqueue({
      displayName: 'GuestLate',
      avatarColor: '#222222',
      countryCode: 'SA',
    });
    expect(guest.state).toBe('assigned');
    expect(guest.matchId).toBe(host.matchId);
    expect(guest.acceptedSeats).toBe(2);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('after a player leaves, the next enqueue rejoins the same open lobby', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const host = await mm.enqueue({
      displayName: 'HostStay',
      avatarColor: '#111111',
      countryCode: 'SA',
    });
    const guest = await mm.enqueue({
      displayName: 'GuestLeave',
      avatarColor: '#222222',
      countryCode: 'SA',
    });
    expect(guest.matchId).toBe(host.matchId);

    await mm.cancel(guest.ticketId);
    const snap = await matches.requestSnapshot(host.matchId!);
    expect(snap.snapshot.players).toHaveLength(1);
    expect(
      snap.snapshot.players.some((p) => p.displayName === 'GuestLeave'),
    ).toBe(false);

    // Advance past the original fill window — leave refreshed the deadline.
    clock.advance(45_000);

    const rejoined = await mm.enqueue({
      displayName: 'GuestLeave',
      avatarColor: '#222222',
      countryCode: 'SA',
    });
    expect(rejoined.state).toBe('assigned');
    expect(rejoined.matchId).toBe(host.matchId);
    expect(rejoined.acceptedSeats).toBe(2);

    // Second leave must also free the seat (no ghost from the first cycle).
    await mm.cancel(rejoined.ticketId);
    const afterSecondLeave = await matches.requestSnapshot(host.matchId!);
    expect(afterSecondLeave.snapshot.players).toHaveLength(1);
    expect(
      afterSecondLeave.snapshot.players.some(
        (p) => p.displayName === 'GuestLeave',
      ),
    ).toBe(false);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('host extend delays lobby fill start', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const a = await mm.enqueue({
      displayName: 'A',
      avatarColor: '#111111',
      countryCode: 'SA',
    });
    const b = await mm.enqueue({
      displayName: 'B',
      avatarColor: '#222222',
      countryCode: 'SA',
    });
    expect(a.matchId).toBe(b.matchId);
    const matchId = a.matchId!;
    const hostId = a.assignment!.playerId;

    clock.advance(55_000);
    const extended = await matches.extendLobbyFill(matchId, hostId);
    expect(extended.lobbyFillWaitMs).toBeGreaterThan(30_000);
    mm.onLobbyCompositionChanged(matchId, {
      emptied: false,
      lobbyFillWaitMs: extended.lobbyFillWaitMs,
    });

    await mm.resolveLobbyFillForTests(matchId);
    expect((await matches.getStoreForTests().get(matchId))?.phase).toBe(
      'lobby',
    );

    clock.advance(extended.lobbyFillWaitMs);
    await mm.resolveLobbyFillForTests(matchId);
    expect((await matches.getStoreForTests().get(matchId))?.phase).toBe(
      'ready_countdown',
    );

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });
});
