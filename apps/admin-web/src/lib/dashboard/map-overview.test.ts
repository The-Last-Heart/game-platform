import { describe, expect, it } from 'vitest';
import type { AdminDashboardOverview } from '@thelastheart/contracts';
import { mapDashboardOverview } from './map-overview';

describe('mapDashboardOverview', () => {
  it('maps aggregates into a stable view model', () => {
    const overview: AdminDashboardOverview = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      aggregates: {
        matchCount: 3,
        matchesByPhase: {
          lobby: 1,
          ready_countdown: 0,
          challenge_intro: 0,
          challenge_active: 2,
          round_result: 0,
          completed: 0,
          halted: 0,
        },
        playersByPresence: {
          connected: 4,
          disconnected: 1,
          spectator: 0,
        },
        lobbyWaitingPlayers: 2,
      },
      adminUsers: { activeCount: 5, deactivatedCount: 1 },
      sessions: { activeCount: 2 },
    };

    const view = mapDashboardOverview(overview);
    expect(view.matchCount).toBe(3);
    expect(view.activeAdmins).toBe(5);
    expect(
      view.matchesByPhase.find((row) => row.phase === 'lobby')?.count,
    ).toBe(1);
    expect(
      view.playersByPresence.find((row) => row.presence === 'connected')?.count,
    ).toBe(4);
  });
});
