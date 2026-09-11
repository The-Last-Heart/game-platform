import type { AdminDashboardOverview } from '@thelastheart/contracts';

export type DashboardViewModel = {
  generatedAt: string;
  matchCount: number;
  lobbyWaitingPlayers: number;
  activeAdmins: number;
  deactivatedAdmins: number;
  activeSessions: number;
  matchesByPhase: Array<{ phase: string; count: number }>;
  playersByPresence: Array<{ presence: string; count: number }>;
};

export function mapDashboardOverview(
  overview: AdminDashboardOverview,
): DashboardViewModel {
  const phases = overview.aggregates.matchesByPhase;
  const presence = overview.aggregates.playersByPresence;
  return {
    generatedAt: overview.generatedAt,
    matchCount: overview.aggregates.matchCount,
    lobbyWaitingPlayers: overview.aggregates.lobbyWaitingPlayers,
    activeAdmins: overview.adminUsers.activeCount,
    deactivatedAdmins: overview.adminUsers.deactivatedCount,
    activeSessions: overview.sessions.activeCount,
    matchesByPhase: [
      { phase: 'lobby', count: phases.lobby },
      { phase: 'ready_countdown', count: phases.ready_countdown },
      { phase: 'challenge_intro', count: phases.challenge_intro },
      { phase: 'challenge_active', count: phases.challenge_active },
      { phase: 'round_result', count: phases.round_result },
      { phase: 'completed', count: phases.completed },
      { phase: 'halted', count: phases.halted },
    ],
    playersByPresence: [
      { presence: 'connected', count: presence.connected },
      { presence: 'disconnected', count: presence.disconnected },
      { presence: 'spectator', count: presence.spectator },
    ],
  };
}
