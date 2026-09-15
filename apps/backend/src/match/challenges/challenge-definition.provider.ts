import type { ChallengeDefinition } from '../domain/types';

/**
 * Provides challenge definitions for match rounds.
 * Production implementations would load from a catalog service or database.
 */
export interface ChallengeDefinitionProvider {
  getById(id: string): ChallengeDefinition | undefined;
  getDefaultDev(): ChallengeDefinition;
  /**
   * Ordered live-match playlist (first cycle). After exhaustion, sudden-death
   * recycles while 2+ hearts remain — each recycle is a fresh shuffle of this set.
   */
  getPlaylist(): readonly ChallengeDefinition[];
}
