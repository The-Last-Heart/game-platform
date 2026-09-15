import {
  buildDifficultyOrderedPlaylist,
  CHALLENGES_PER_DIFFICULTY,
  difficultyOf,
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

  it('builds 5 easy then 5 medium then 5 hard', () => {
    const { structured, hardLoop } = buildDifficultyOrderedPlaylist(
      pool,
      'match-a',
    );
    expect(structured).toHaveLength(CHALLENGES_PER_DIFFICULTY * 3);
    expect(structured.slice(0, 5).every((d) => difficultyOf(d) === 'easy')).toBe(
      true,
    );
    expect(
      structured.slice(5, 10).every((d) => difficultyOf(d) === 'medium'),
    ).toBe(true);
    expect(
      structured.slice(10, 15).every((d) => difficultyOf(d) === 'hard'),
    ).toBe(true);
    expect(hardLoop.every((d) => difficultyOf(d) === 'hard')).toBe(true);
    expect(hardLoop.length).toBeGreaterThanOrEqual(5);
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
      orders.add(structured.slice(0, 5).map((d) => d.engineId).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('interleaves sparse neon+fog pool so fog is not buried behind five neon pads', () => {
    const sparse = [
      def('precision.neon_cable', 'easy'),
      def('gesture.fog_wipe', 'medium'),
    ];
    const { structured } = buildDifficultyOrderedPlaylist(sparse, 'sparse-room');
    expect(structured).toHaveLength(CHALLENGES_PER_DIFFICULTY * 3);
    expect(structured.some((d) => d.engineId === 'gesture.fog_wipe')).toBe(
      true,
    );
    expect(structured.slice(0, 2).map((d) => d.engineId).sort()).toEqual([
      'gesture.fog_wipe',
      'precision.neon_cable',
    ]);
  });
});
