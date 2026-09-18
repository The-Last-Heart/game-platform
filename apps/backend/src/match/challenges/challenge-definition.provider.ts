import type { ChallengeDefinition } from '../domain/types';

/**
 * Provides challenge definitions for match rounds.
 * Production implementations would load from a catalog service or database.
 */
export interface ChallengeDefinitionProvider {
  getById(id: string): ChallengeDefinition | undefined;
  getDefaultDev(): ChallengeDefinition;
  /**
   * Unique live-match pool. Runtime orders easy → medium → hard, then
   * reshuffles within each tier for at most two extra full passes.
   */
  getPlaylist(): readonly ChallengeDefinition[];
}
