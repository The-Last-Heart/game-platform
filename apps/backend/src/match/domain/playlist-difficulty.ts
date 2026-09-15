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
    'precision.circuit_rotation',
    'precision.cable_untangle',
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
 *
 * When the live catalog is sparse (ops pauses / early seeds), padding an early
 * tier to 5 slots with the same challenge would hide later-tier engines for an
 * entire match. In that case, interleave across non-empty tiers instead.
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

  const tiers = ['easy', 'medium', 'hard'] as const;
  const orderedByTier = tiers.map((tier) =>
    orderTierAvailable(byDifficulty[tier], tier),
  );
  const nonEmptyTier = orderedByTier.filter((tier) => tier.length > 0);
  const sparseAcrossTiers =
    nonEmptyTier.length >= 2 &&
    nonEmptyTier.some((tier) => tier.length < CHALLENGES_PER_DIFFICULTY);

  const structured: ChallengeDefinition[] = sparseAcrossTiers
    ? interleaveSparseTiers(orderedByTier, matchId, CHALLENGES_PER_DIFFICULTY * 3)
    : tiers.flatMap((tier, index) =>
        pickTierSlice(
          orderedByTier[index]!,
          tier,
          matchId,
          CHALLENGES_PER_DIFFICULTY,
        ),
      );

  const hardLoop =
    byDifficulty.hard.length > 0
      ? [...byDifficulty.hard]
      : structured.filter((d) => difficultyOf(d) === 'hard');

  return { structured, hardLoop };
}

function orderTierAvailable(
  available: readonly ChallengeDefinition[],
  tier: ChallengeDifficulty,
): ChallengeDefinition[] {
  if (available.length === 0) {
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
  return [...prioritized, ...leftovers];
}

function pickTierSlice(
  ordered: readonly ChallengeDefinition[],
  tier: ChallengeDifficulty,
  matchId: string,
  count: number,
): ChallengeDefinition[] {
  if (ordered.length === 0 || count <= 0) {
    return [];
  }

  const take = ordered.slice(0, Math.min(count, ordered.length));
  // If catalog is short, cycle the tier so the pack still has `count` slots.
  while (take.length < count && ordered.length > 0) {
    take.push(ordered[take.length % ordered.length]!);
  }

  return seededShuffle(take, `${matchId}:tier:${tier}`);
}

/**
 * Round-robin unique picks across tiers, then cycle to fill the pack.
 * Shuffled per room so neon/fog (etc.) are not stuck in a fixed order.
 */
function interleaveSparseTiers(
  orderedByTier: readonly (readonly ChallengeDefinition[])[],
  matchId: string,
  totalCount: number,
): ChallengeDefinition[] {
  const queues = orderedByTier
    .map((tier, index) =>
      seededShuffle(tier, `${matchId}:sparse-tier:${index}`),
    )
    .filter((tier) => tier.length > 0);
  if (queues.length === 0 || totalCount <= 0) {
    return [];
  }

  const unique: ChallengeDefinition[] = [];
  const seen = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const queue of queues) {
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (seen.has(next.definitionId)) {
          continue;
        }
        seen.add(next.definitionId);
        unique.push(next);
        progress = true;
        break;
      }
    }
  }

  if (unique.length === 0) {
    return [];
  }

  const out: ChallengeDefinition[] = [];
  while (out.length < totalCount) {
    out.push(unique[out.length % unique.length]!);
  }
  return out;
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
