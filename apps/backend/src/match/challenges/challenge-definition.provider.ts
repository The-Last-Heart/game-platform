import type { ChallengeDefinition } from '../domain/types';

/**
 * Provides challenge definitions for match rounds.
 * Production implementations would load from a catalog service or database.
 */
export interface ChallengeDefinitionProvider {
  getById(id: string): ChallengeDefinition | undefined;
  getDefaultDev(): ChallengeDefinition;
}
