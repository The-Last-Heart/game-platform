import { describe, expect, it } from 'vitest';
import type { AdminDashboardOverview } from '@thelastheart/contracts';
import { mapDashboardOverview } from './map-overview';

describe('mapDashboardOverview', () => {
  it('maps aggregates into a stable view model', () => {
    const overview: AdminDashboardOverview = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      aggregates: {
        activeMatchCount: 3,
        matchesByPhase: {
          lobby: 1,
          ready_countdown: 0,
          challenge_intro: 0,
          challenge_active: 2,
          round_result: 0,
          completed: 4,
          halted: 1,
        },
        connectedPlayers: 4,
        disconnectedPlayers: 1,
        spectators: 2,
        waitingLobbyCount: 2,
      },
      adminUsers: { activeCount: 5, deactivatedCount: 1 },
      sessions: { activeCount: 2 },
    };

    const view = mapDashboardOverview(overview);
    expect(view.activeMatchCount).toBe(3);
    expect(view.waitingLobbyCount).toBe(2);
    expect(view.activeAdmins).toBe(5);
    expect(view.connectedPlayers).toBe(4);
    expect(view.disconnectedPlayers).toBe(1);
    expect(view.spectators).toBe(2);
    expect(
      view.matchesByPhase.find((row) => row.phase === 'completed')?.count,
    ).toBe(4);
    expect(
      view.matchesByPhase.find((row) => row.phase === 'halted')?.count,
    ).toBe(1);
  });
});
