import { FakeClock } from '../../match/domain/types';
import { MatchService } from '../../match/services/match.service';

describe('MatchService.getOperationalAggregates', () => {
  it('returns safe counts without private match fields', async () => {
    const service = MatchService.forTests({ clock: new FakeClock() });
    const created = await service.createDevMatch();
    await service.joinMatch(created.matchId);

    const aggregates = await service.getOperationalAggregates();
    expect(aggregates.matchCount).toBe(1);
    expect(aggregates.matchesByPhase.lobby).toBe(1);
    expect(aggregates.lobbyWaitingPlayers).toBe(1);
    expect(
      aggregates.playersByPresence.connected +
        aggregates.playersByPresence.disconnected,
    ).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(aggregates);
    expect(serialized).not.toMatch(/resumeToken/i);
    expect(serialized).not.toMatch(/serverConfig/i);
    expect(serialized).not.toMatch(/answer/i);
    expect(serialized).not.toMatch(/signalToken/i);
  });
});
