import {
  permutationForCycle,
  playlistOrderForCycle,
  selectPlaylistDefinition,
} from './playlist-cycle';
import type { ChallengeDefinition } from './types';

function def(id: string): ChallengeDefinition {
  return {
    definitionId: id,
    definitionVersion: 1,
    engineId: 'dev.choice',
    promptKey: 'dev',
    durationMs: 1000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 0,
    clientConfig: {},
    serverConfig: {},
  };
}

describe('playlist-cycle', () => {
  const playlist = [def('a'), def('b'), def('c'), def('d')];

  it('keeps catalog order for the first cycle', () => {
    expect(
      [0, 1, 2, 3].map(
        (round) =>
          selectPlaylistDefinition({
            playlist,
            matchId: 'match-1',
            roundNumber: round,
          })?.definitionId,
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('recycles as a permutation with no duplicates inside a cycle', () => {
    const order = playlistOrderForCycle(4, 'match-1', 4);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);

    const ids = [4, 5, 6, 7].map(
      (round) =>
        selectPlaylistDefinition({
          playlist,
          matchId: 'match-1',
          roundNumber: round,
        })!.definitionId,
    );
    expect(new Set(ids).size).toBe(4);
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shuffles recycled cycles (not a fixed replay of catalog order)', () => {
    const cycle0 = permutationForCycle(6, 'match-room', 0);
    expect(cycle0).toEqual([0, 1, 2, 3, 4, 5]);

    let foundNonIdentity = false;
    let foundDistinctCycles = false;
    for (let i = 0; i < 40; i++) {
      const cycle1 = permutationForCycle(6, `match-room-${i}`, 1);
      const cycle2 = permutationForCycle(6, `match-room-${i}`, 2);
      if (cycle1.some((v, idx) => v !== idx)) {
        foundNonIdentity = true;
      }
      if (cycle1.join(',') !== cycle2.join(',')) {
        foundDistinctCycles = true;
      }
      if (foundNonIdentity && foundDistinctCycles) break;
    }
    expect(foundNonIdentity).toBe(true);
    expect(foundDistinctCycles).toBe(true);
  });

  it('is deterministic for the same match + cycle', () => {
    expect(permutationForCycle(5, 'stable-match', 3)).toEqual(
      permutationForCycle(5, 'stable-match', 3),
    );
  });

  it('returns null for an empty playlist', () => {
    expect(
      selectPlaylistDefinition({
        playlist: [],
        matchId: 'x',
        roundNumber: 0,
      }),
    ).toBeNull();
  });
});
