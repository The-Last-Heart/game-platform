import type { ChallengeDefinition } from '../domain/types';

/**
 * Provides challenge definitions for match rounds.
 * Production implementations would load from a catalog service or database.
 */
export interface ChallengeDefinitionProvider {
  getById(id: string): ChallengeDefinition | undefined;
  getDefaultDev(): ChallengeDefinition;
  /** Ordered live-match playlist. Exhaustion ends the match (no repeats). */
  getPlaylist(): readonly ChallengeDefinition[];
}
