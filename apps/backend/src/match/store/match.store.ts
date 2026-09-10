import type { MatchState } from '../domain/types';

/**
 * Ephemeral match persistence. In-memory implementation is single-process only.
 * A future Redis-backed store can replace this without changing domain logic.
 */
export interface MatchStore {
  save(match: MatchState): Promise<void>;
  get(matchId: string): Promise<MatchState | undefined>;
  delete(matchId: string): Promise<void>;
  listIds(): Promise<string[]>;
}

export class InMemoryMatchStore implements MatchStore {
  private readonly matches = new Map<string, MatchState>();

  save(match: MatchState): Promise<void> {
    this.matches.set(match.matchId, match);
    return Promise.resolve();
  }

  get(matchId: string): Promise<MatchState | undefined> {
    return Promise.resolve(this.matches.get(matchId));
  }

  delete(matchId: string): Promise<void> {
    this.matches.delete(matchId);
    return Promise.resolve();
  }

  listIds(): Promise<string[]> {
    return Promise.resolve([...this.matches.keys()]);
  }

  clear(): void {
    this.matches.clear();
  }
}
