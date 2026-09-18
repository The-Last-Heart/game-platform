import {
  buildDifficultyOrderedPlaylist,
  isDifficultySorted,
  MAX_PLAYLIST_RECYCLES,
  selectDifficultyCycledDefinition,
} from './playlist-difficulty';
import type { ChallengeDefinition } from './types';

function def(
  engineId: string,
  difficulty: 'easy' | 'medium' | 'hard',
): ChallengeDefinition {
  return {
    definitionId: `${engineId}.dev`,
    definitionVersion: 1,
    engineId,
    promptKey: 'dev',
    durationMs: 1000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 0,
    difficulty,
    clientConfig: {},
    serverConfig: {},
  };
}

describe('playlist-difficulty', () => {
  const pool = [
    def('reaction.wait_for_signal', 'easy'),
    def('trap.no_touch', 'easy'),
    def('trivia.multiple_choice', 'easy'),
    def('focus.odd_one_out', 'easy'),
    def('precision.neon_cable', 'easy'),
    def('tap.precision', 'medium'),
    def('gesture.reverse_swipe', 'medium'),
    def('hold.multitouch', 'medium'),
    def('search.select_occurrences', 'medium'),
    def('order.sequence_sort', 'medium'),
    def('memory.sequence', 'hard'),
    def('motion.tilt_balance', 'hard'),
    def('audio.cue', 'hard'),
    def('geography.select_on_map', 'hard'),
    def('precision.maze_path', 'hard'),
    def('focus.stroop', 'hard'),
    def('logic.balance_scale', 'hard'),
    def('social.pair_sync', 'hard'),
  ];

  it('plays every unique challenge once, easy then medium then hard', () => {
    const { structured, hardLoop } = buildDifficultyOrderedPlaylist(
      pool,
      'match-a',
    );
    expect(structured).toHaveLength(pool.length);
    expect(new Set(structured.map((d) => d.definitionId)).size).toBe(
      pool.length,
    );
    expect(isDifficultySorted(structured)).toBe(true);
    expect(structured.filter((d) => d.difficulty === 'easy')).toHaveLength(5);
    expect(structured.filter((d) => d.difficulty === 'medium')).toHaveLength(5);
    expect(structured.filter((d) => d.difficulty === 'hard')).toHaveLength(8);
    expect(hardLoop.every((d) => d.difficulty === 'hard')).toBe(true);
    expect(hardLoop.length).toBe(8);
  });

  it('does not pad a short catalog by repeating challenges', () => {
    const sparse = [
      def('precision.neon_cable', 'easy'),
      def('gesture.fog_wipe', 'medium'),
      def('memory.sequence', 'hard'),
    ];
    const { structured } = buildDifficultyOrderedPlaylist(sparse, 'sparse-room');
    expect(structured).toHaveLength(3);
    expect(structured.map((d) => d.engineId)).toEqual([
      'precision.neon_cable',
      'gesture.fog_wipe',
      'memory.sequence',
    ]);
  });

  it('is deterministic for the same matchId', () => {
    const a = buildDifficultyOrderedPlaylist(pool, 'stable');
    const b = buildDifficultyOrderedPlaylist(pool, 'stable');
    expect(a.structured.map((d) => d.engineId)).toEqual(
      b.structured.map((d) => d.engineId),
    );
  });

  it('can shuffle within a tier across rooms', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const { structured } = buildDifficultyOrderedPlaylist(
        pool,
        `room-${i}`,
      );
      orders.add(
        structured
          .filter((d) => d.difficulty === 'easy')
          .map((d) => d.engineId)
          .join(','),
      );
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('recycles a fresh within-tier shuffle up to max 2 extra passes', () => {
    const { structured } = buildDifficultyOrderedPlaylist(pool, 'cycle-room');
    const first = structured.map((d) => d.definitionId);
    const second = Array.from({ length: structured.length }, (_, i) =>
      selectDifficultyCycledDefinition({
        playlist: structured,
        matchId: 'cycle-room',
        roundNumber: structured.length + i,
      }),
    ).map((d) => d?.definitionId);
    const third = Array.from({ length: structured.length }, (_, i) =>
      selectDifficultyCycledDefinition({
        playlist: structured,
        matchId: 'cycle-room',
        roundNumber: structured.length * 2 + i,
      }),
    ).map((d) => d?.definitionId);

    expect(second.every((id) => id != null)).toBe(true);
    expect(third.every((id) => id != null)).toBe(true);
    expect(new Set(second).size).toBe(structured.length);
    expect(isDifficultySorted(
      second.map((id) => structured.find((d) => d.definitionId === id)!),
    )).toBe(true);
    expect(selectDifficultyCycledDefinition({
      playlist: structured,
      matchId: 'cycle-room',
      roundNumber: structured.length * (MAX_PLAYLIST_RECYCLES + 1),
    })).toBeNull();
    expect(first.join(',')).not.toBe(second.join(','));
    expect(second.join(',')).not.toBe(third.join(','));
  });

  it('training (maxRecycles 0) stops after the first pass', () => {
    const { structured } = buildDifficultyOrderedPlaylist(pool, 'train');
    expect(
      selectDifficultyCycledDefinition({
        playlist: structured,
        matchId: 'train',
        roundNumber: 0,
        maxRecycles: 0,
      })?.definitionId,
    ).toBe(structured[0]!.definitionId);
    expect(
      selectDifficultyCycledDefinition({
        playlist: structured,
        matchId: 'train',
        roundNumber: structured.length,
        maxRecycles: 0,
      }),
    ).toBeNull();
  });
});
