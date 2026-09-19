import { FakeClock } from '../domain/types';
import { MatchService } from './match.service';
import { MatchmakingService } from './matchmaking.service';

function identity(
  name: string,
  appVersion: string,
): {
  displayName: string;
  avatarColor: string;
  countryCode: 'SA';
  playerId: string;
  appVersion: string;
} {
  return {
    displayName: name,
    avatarColor: '#FF3045',
    countryCode: 'SA',
    playerId: `player-${name.toLowerCase()}-0001`,
    appVersion,
  };
}

describe('exact-version matchmaking', () => {
  it('keeps 1.0.0 and 1.1.0 in separate Quick Survival cohorts', async () => {
    const clock = new FakeClock();
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const a = await mm.enqueue(identity('Alpha', '1.0.0'));
    const b = await mm.enqueue(identity('Beta', '1.0.0'));
    const c = await mm.enqueue(identity('Gamma', '1.1.0'));
    const d = await mm.enqueue(identity('Delta', '1.1.0'));

    expect(a.matchId).toBeTruthy();
    expect(b.matchId).toBe(a.matchId);
    expect(c.matchId).toBeTruthy();
    expect(d.matchId).toBe(c.matchId);
    expect(c.matchId).not.toBe(a.matchId);

    const roomA = await matches.getStoreForTests().get(a.matchId!);
    const roomC = await matches.getStoreForTests().get(c.matchId!);
    expect(roomA?.gameplayVersion).toBe('1.0.0');
    expect(roomC?.gameplayVersion).toBe('1.1.0');
    expect(roomA?.players.size).toBe(2);
    expect(roomC?.players.size).toBe(2);
  });

  it('still enforces six-player capacity within a version cohort', async () => {
    const clock = new FakeClock();
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);

    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const status = await mm.enqueue(
        identity(`N${String.fromCharCode(97 + i)}`, '0.0.1'),
      );
      ids.push(status.matchId!);
    }
    expect(new Set(ids).size).toBe(1);
    const seventh = await mm.enqueue(identity('Overflow', '0.0.1'));
    expect(seventh.matchId).not.toBe(ids[0]);
  });
});

describe('private room version isolation', () => {
  it('rejects older and newer joiners before seating', async () => {
    const clock = new FakeClock();
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const room = await service.createPrivateRoom(identity('Host', '1.0.0'));
    expect(room.roomCode).toBeTruthy();

    await expect(
      service.joinPrivateRoom({
        ...identity('Old', '0.0.1'),
        roomCode: room.roomCode,
      }),
    ).rejects.toMatchObject({ code: 'PRIVATE_ROOM_VERSION_CLIENT_OLDER' });

    await expect(
      service.joinPrivateRoom({
        ...identity('New', '1.1.0'),
        roomCode: room.roomCode,
      }),
    ).rejects.toMatchObject({ code: 'PRIVATE_ROOM_VERSION_CLIENT_NEWER' });

    const after = await service.getStoreForTests().get(room.matchId);
    expect(after?.players.size).toBe(1);
    expect(after?.gameplayVersion).toBe('1.0.0');
  });
});

describe('resume version mismatch', () => {
  it('rejects resume when session version differs from match', async () => {
    const clock = new FakeClock();
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const room = await service.createPrivateRoom(identity('Host', '1.0.0'));
    await expect(
      service.resumeMatch({
        matchId: room.matchId,
        resumeToken: room.resumeToken,
        commandId: 'cmd-resume-1',
        appVersion: '1.1.0',
      }),
    ).rejects.toMatchObject({ code: 'MATCH_RESUME_VERSION_MISMATCH' });
  });
});
