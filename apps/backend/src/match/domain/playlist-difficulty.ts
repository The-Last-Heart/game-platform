import { createHash } from 'node:crypto';
import type { ChallengeDefinition } from './types';

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';

/** Additional full playlist passes after the first (cycles 1 and 2). */
export const MAX_PLAYLIST_RECYCLES = 2;

const DIFFICULTY_RANK: Record<ChallengeDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

/**
 * Preferred engine order within each tier (progressive feel + stable picks).
 * Extra engines in a tier still play — they are not truncated or padded.
 */
export const DIFFICULTY_ENGINE_PRIORITY: Record<
  ChallengeDifficulty,
  readonly string[]
> = {
  easy: [
    'reaction.wait_for_signal',
    'trap.no_touch',
    'trivia.multiple_choice',
    'trivia.common_word',
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
    'audio.multiple_choice',
    'laser.routing',
  ],
  hard: [
    'memory.sequence',
    'motion.tilt_balance',
    'audio.cue',
    'geography.select_on_map',
    'precision.maze_path',
    'focus.stroop',
    'logic.balance_scale',
    'logic.complete_sum',
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
 * Build a room playlist: every unique playable definition, easy → medium →
 * hard, shuffled within each tier. Never pads or repeats inside the first
 * pass — later cycles reshuffle within tiers (see selectDifficultyCycledDefinition).
 */
export function buildDifficultyOrderedPlaylist(
  pool: readonly ChallengeDefinition[],
  matchId: string,
): {
  structured: ChallengeDefinition[];
  hardLoop: ChallengeDefinition[];
} {
  const unique = uniqueByDefinitionId(pool);
  const byDifficulty: Record<ChallengeDifficulty, ChallengeDefinition[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const def of unique) {
    byDifficulty[difficultyOf(def)].push(def);
  }

  const structured = (['easy', 'medium', 'hard'] as const).flatMap((tier) =>
    seededShuffle(
      orderTierAvailable(byDifficulty[tier], tier),
      `${matchId}:tier:${tier}`,
    ),
  );

  const hardLoop =
    byDifficulty.hard.length > 0
      ? [...byDifficulty.hard]
      : structured.filter((d) => difficultyOf(d) === 'hard');

  return { structured, hardLoop };
}

/**
 * Next definition for `roundNumber` (0-based index of challenges already
 * introduced). Cycle 0 uses the pinned easy→medium→hard order. Cycles 1..N
 * reshuffle within each tier. Returns null after `maxRecycles` extra passes.
 */
export function selectDifficultyCycledDefinition(options: {
  playlist: readonly ChallengeDefinition[];
  matchId: string;
  roundNumber: number;
  maxRecycles?: number;
}): ChallengeDefinition | null {
  const { playlist, matchId, roundNumber } = options;
  const maxRecycles = options.maxRecycles ?? MAX_PLAYLIST_RECYCLES;
  if (playlist.length === 0 || roundNumber < 0) {
    return null;
  }
  const cycleIndex = Math.floor(roundNumber / playlist.length);
  if (cycleIndex > maxRecycles) {
    return null;
  }
  const ordered =
    cycleIndex <= 0
      ? playlist
      : orderPlaylistForCycle(playlist, matchId, cycleIndex);
  return ordered[roundNumber % playlist.length] ?? null;
}

/**
 * Reshuffle within each difficulty tier for a later playlist pass.
 * Guarantees the intra-tier order differs from the previous cycle when
 * the tier has more than one challenge — repeats should not feel identical.
 */
export function orderPlaylistForCycle(
  playlist: readonly ChallengeDefinition[],
  matchId: string,
  cycleIndex: number,
): ChallengeDefinition[] {
  if (cycleIndex <= 0) {
    return [...playlist];
  }
  const previous = orderPlaylistForCycle(playlist, matchId, cycleIndex - 1);
  const byDifficulty: Record<ChallengeDifficulty, ChallengeDefinition[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  const previousByDifficulty: Record<
    ChallengeDifficulty,
    ChallengeDefinition[]
  > = {
    easy: [],
    medium: [],
    hard: [],
  };
  for (const def of playlist) {
    byDifficulty[difficultyOf(def)].push(def);
  }
  for (const def of previous) {
    previousByDifficulty[difficultyOf(def)].push(def);
  }
  return (['easy', 'medium', 'hard'] as const).flatMap((tier) =>
    shuffleDistinctFromPrevious(
      byDifficulty[tier],
      `${matchId}:playlist-cycle:${cycleIndex}:${tier}`,
      previousByDifficulty[tier],
    ),
  );
}

export function isDifficultySorted(
  playlist: readonly ChallengeDefinition[],
): boolean {
  let previous = -1;
  for (const def of playlist) {
    const rank = DIFFICULTY_RANK[difficultyOf(def)];
    if (rank < previous) {
      return false;
    }
    previous = rank;
  }
  return true;
}

function uniqueByDefinitionId(
  pool: readonly ChallengeDefinition[],
): ChallengeDefinition[] {
  const seen = new Set<string>();
  const unique: ChallengeDefinition[] = [];
  for (const def of pool) {
    if (seen.has(def.definitionId)) {
      continue;
    }
    seen.add(def.definitionId);
    unique.push(def);
  }
  return unique;
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
  const leftovers = [...byEngine.values()].sort((a, b) =>
    a.definitionId.localeCompare(b.definitionId),
  );
  return [...prioritized, ...leftovers];
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

function shuffleDistinctFromPrevious<T extends { definitionId: string }>(
  items: readonly T[],
  seedMaterial: string,
  previous: readonly T[],
): T[] {
  const shuffled = seededShuffle(items, seedMaterial);
  if (shuffled.length <= 1) {
    return shuffled;
  }
  const prevIds = previous.map((d) => d.definitionId).join(',');
  if (shuffled.map((d) => d.definitionId).join(',') !== prevIds) {
    return shuffled;
  }
  return [...shuffled.slice(1), shuffled[0]!];
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
