import type { AdminDashboardOverview } from '@thelastheart/contracts';

export type DashboardViewModel = {
  generatedAt: string;
  activeMatchCount: number;
  waitingLobbyCount: number;
  activeAdmins: number;
  deactivatedAdmins: number;
  activeSessions: number;
  connectedPlayers: number;
  disconnectedPlayers: number;
  spectators: number;
  matchesByPhase: Array<{ phase: string; count: number }>;
};

export function mapDashboardOverview(
  overview: AdminDashboardOverview,
): DashboardViewModel {
  const phases = overview.aggregates.matchesByPhase;
  return {
    generatedAt: overview.generatedAt,
    activeMatchCount: overview.aggregates.activeMatchCount,
    waitingLobbyCount: overview.aggregates.waitingLobbyCount,
    activeAdmins: overview.adminUsers.activeCount,
    deactivatedAdmins: overview.adminUsers.deactivatedCount,
    activeSessions: overview.sessions.activeCount,
    connectedPlayers: overview.aggregates.connectedPlayers,
    disconnectedPlayers: overview.aggregates.disconnectedPlayers,
    spectators: overview.aggregates.spectators,
    matchesByPhase: [
      { phase: 'lobby', count: phases.lobby },
      { phase: 'ready_countdown', count: phases.ready_countdown },
      { phase: 'challenge_intro', count: phases.challenge_intro },
      { phase: 'challenge_active', count: phases.challenge_active },
      { phase: 'round_result', count: phases.round_result },
      { phase: 'completed', count: phases.completed },
      { phase: 'halted', count: phases.halted },
    ],
  };
}
