import { FakeClock } from '../domain/types';
import { MatchService } from './match.service';
import { MatchmakingService } from './matchmaking.service';

describe('MatchmakingService', () => {
  it('allocates when six players enqueue', async () => {
    const clock = new FakeClock(5_000_000);
    const matches = MatchService.forTests({ clock, nodeEnv: 'test' });
    const mm = MatchmakingService.forTests(matches);
    const assigned: string[] = [];
    mm.onStatus((event) => {
      if (event.state === 'assigned' && event.matchId) {
        assigned.push(event.ticketId);
      }
    });

    for (let i = 0; i < 6; i += 1) {
      const status = await mm.enqueue({
        displayName: `Player${i}`,
        avatarColor: '#112233',
      });
      if (i < 5) {
        expect(status.state).toBe('queued');
      } else {
        expect(status.state).toBe('assigned');
        expect(status.matchId).toBeTruthy();
        expect(status.assignment?.playerId).toBeTruthy();
      }
    }
    expect(assigned).toHaveLength(6);

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('bot-fill seats remaining humans when policy enabled', async () => {
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
    });
    expect(first.state).toBe('queued');

    // Age the ticket past wait threshold.
    const ticket = mm.getTicket(first.ticketId)!;
    (ticket as { enqueuedAtMs: number }).enqueuedAtMs = Date.now() - 10_000;

    await mm.scanForTests();
    const after = mm.getTicket(first.ticketId);
    expect(after).toBeUndefined();

    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });

  it('cancel removes ticket so no ghost reservation', async () => {
    const matches = MatchService.forTests({
      clock: new FakeClock(1),
      nodeEnv: 'test',
    });
    const mm = MatchmakingService.forTests(matches);
    const queued = await mm.enqueue({
      displayName: 'Ghost',
      avatarColor: '#000000',
    });
    await mm.cancel(queued.ticketId);
    expect(mm.getTicket(queued.ticketId)).toBeUndefined();
    const again = await mm.enqueue({
      displayName: 'Ghost',
      avatarColor: '#000000',
    });
    expect(again.state).toBe('queued');
    mm.onModuleDestroy();
    matches.onModuleDestroy();
  });
});
