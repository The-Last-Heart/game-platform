import { createHash } from 'node:crypto';
import type { ChallengeDefinition } from './types';

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';

export const CHALLENGES_PER_DIFFICULTY = 5;

/**
 * Preferred engine order within each tier (progressive feel + stable picks).
 * Extra hard engines stay in the hard-loop pool only.
 */
export const DIFFICULTY_ENGINE_PRIORITY: Record<
  ChallengeDifficulty,
  readonly string[]
> = {
  easy: [
    'reaction.wait_for_signal',
    'trap.no_touch',
    'trivia.multiple_choice',
    'focus.odd_one_out',
    'precision.neon_cable',
  ],
  medium: [
    'tap.precision',
    'gesture.reverse_swipe',
    'gesture.fog_wipe',
    'hold.multitouch',
    'search.select_occurrences',
    'order.sequence_sort',
  ],
  hard: [
    'memory.sequence',
    'motion.tilt_balance',
    'audio.cue',
    'geography.select_on_map',
    'precision.maze_path',
    'focus.stroop',
    'logic.balance_scale',
    'social.pair_sync',
    'motion.shake',
  ],
};

export function difficultyOf(
  def: ChallengeDefinition,
): ChallengeDifficulty {
  return def.difficulty ?? 'medium';
}

/**
 * Build a room playlist: 5 easy → 5 medium → 5 hard (shuffled within each tier).
 * `hardLoopPlaylist` is every hard-tagged definition from the pool for sudden-death.
 */
export function buildDifficultyOrderedPlaylist(
  pool: readonly ChallengeDefinition[],
  matchId: string,
): {
  structured: ChallengeDefinition[];
  hardLoop: ChallengeDefinition[];
} {
  const byDifficulty: Record<ChallengeDifficulty, ChallengeDefinition[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const def of pool) {
    byDifficulty[difficultyOf(def)].push(def);
  }

  const structured: ChallengeDefinition[] = [];
  for (const tier of ['easy', 'medium', 'hard'] as const) {
    structured.push(
      ...pickTierSlice(byDifficulty[tier], tier, matchId, CHALLENGES_PER_DIFFICULTY),
    );
  }

  const hardLoop =
    byDifficulty.hard.length > 0
      ? [...byDifficulty.hard]
      : structured.filter((d) => difficultyOf(d) === 'hard');

  return { structured, hardLoop };
}

function pickTierSlice(
  available: readonly ChallengeDefinition[],
  tier: ChallengeDifficulty,
  matchId: string,
  count: number,
): ChallengeDefinition[] {
  if (available.length === 0 || count <= 0) {
    return [];
  }

  const byEngine = new Map(available.map((d) => [d.engineId, d]));
  const prioritized: ChallengeDefinition[] = [];
  for (const engineId of DIFFICULTY_ENGINE_PRIORITY[tier]) {
    const def = byEngine.get(engineId);
    if (def) {
      prioritized.push(def);
      byEngine.delete(engineId);
    }
  }
  // Any remaining in this tier (admin-published extras) after priority list.
  const leftovers = [...byEngine.values()].sort((a, b) =>
    a.definitionId.localeCompare(b.definitionId),
  );
  const ordered = [...prioritized, ...leftovers];

  const take = ordered.slice(0, Math.min(count, ordered.length));
  // If catalog is short, cycle the tier so the pack still has `count` slots.
  while (take.length < count && ordered.length > 0) {
    take.push(ordered[take.length % ordered.length]!);
  }

  return seededShuffle(take, `${matchId}:tier:${tier}`);
}

function seededShuffle<T>(items: readonly T[], seedMaterial: string): T[] {
  const out = [...items];
  if (out.length <= 1) {
    return out;
  }
  const rand = mulberry32(seedU32(seedMaterial));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function seedU32(material: string): number {
  const digest = createHash('sha256').update(material).digest();
  return digest.readUInt32BE(0);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
