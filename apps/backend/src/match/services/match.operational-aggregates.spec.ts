import { FakeClock } from '../../match/domain/types';
import { MatchService } from '../../match/services/match.service';

describe('MatchService.getOperationalAggregates', () => {
  it('excludes completed/halted from activeMatchCount and separates player metrics', async () => {
    const service = MatchService.forTests({ clock: new FakeClock() });
    const store = service.getStoreForTests();

    const active = await service.createDevMatch();
    await service.joinMatch(active.matchId);

    const completed = await service.createDevMatch();
    const completedMatch = (await store.get(completed.matchId))!;
    completedMatch.phase = 'completed';
    completedMatch.status = 'completed';
    await store.save(completedMatch);

    const halted = await service.createDevMatch();
    const haltedMatch = (await store.get(halted.matchId))!;
    haltedMatch.phase = 'halted';
    await store.save(haltedMatch);

    const mixed = await service.createDevMatch();
    const joined = await service.joinMatch(mixed.matchId);
    const mixedMatch = (await store.get(mixed.matchId))!;
    const player = mixedMatch.players.get(joined.playerId)!;
    player.status = 'spectator';
    player.presence = 'disconnected';
    await store.save(mixedMatch);

    const aggregates = await service.getOperationalAggregates();

    expect(aggregates.activeMatchCount).toBe(2);
    expect(aggregates.matchesByPhase.lobby).toBe(2);
    expect(aggregates.matchesByPhase.completed).toBe(1);
    expect(aggregates.matchesByPhase.halted).toBe(1);
    expect(aggregates.waitingLobbyCount).toBe(1);
    expect(aggregates.connectedPlayers).toBeGreaterThanOrEqual(1);
    expect(aggregates.disconnectedPlayers).toBeGreaterThanOrEqual(1);
    expect(aggregates.spectators).toBe(1);

    const serialized = JSON.stringify(aggregates);
    expect(serialized).not.toMatch(/resumeToken/i);
    expect(serialized).not.toMatch(/serverConfig/i);
    expect(serialized).not.toMatch(/answer/i);
    expect(serialized).not.toMatch(/signalToken/i);
    expect(serialized).not.toMatch(/DATABASE_URL/i);
    expect(serialized).not.toMatch(/password|secret/i);
  });

  it('returns safe counts without private match fields', async () => {
    const service = MatchService.forTests({ clock: new FakeClock() });
    const created = await service.createDevMatch();
    await service.joinMatch(created.matchId);

    const aggregates = await service.getOperationalAggregates();
    expect(aggregates.activeMatchCount).toBe(1);
    expect(aggregates.matchesByPhase.lobby).toBe(1);
    expect(aggregates.waitingLobbyCount).toBe(1);
    expect(
      aggregates.connectedPlayers + aggregates.disconnectedPlayers,
    ).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(aggregates);
    expect(serialized).not.toMatch(/resumeToken/i);
    expect(serialized).not.toMatch(/serverConfig/i);
    expect(serialized).not.toMatch(/answer/i);
    expect(serialized).not.toMatch(/signalToken/i);
  });
});
