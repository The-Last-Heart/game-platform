import type { ChallengeDefinition, MatchMode } from './types';

/**
 * Engines that require another human seat (or are meaningless alone).
 * Training is capacity-1 — these must never enter the training playlist.
 */
export const MULTI_SEAT_ENGINE_IDS = new Set<string>([
  'social.pair_sync',
  'logic.complete_sum',
]);

export function isSoloTrainingEngine(engineId: string): boolean {
  return !MULTI_SEAT_ENGINE_IDS.has(engineId);
}

/** Playlist for a match mode. Training keeps every solo live engine. */
export function filterPlaylistForMode(
  playlist: readonly ChallengeDefinition[],
  mode: MatchMode,
): ChallengeDefinition[] {
  if (mode !== 'training') {
    return [...playlist];
  }
  return playlist.filter((def) => isSoloTrainingEngine(def.engineId));
}
