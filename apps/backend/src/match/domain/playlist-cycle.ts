import { createHash } from 'node:crypto';
import type { ChallengeDefinition } from './types';

/**
 * Playlist walk: one full pass (cycle) uses each definition at most once.
 * Cycle 0 follows the pinned catalog order. Cycle 1+ is a deterministic
 * shuffle of that same set so sudden-death recycles feel fresh in-room
 * without repeating a challenge inside a single cycle.
 */
export function selectPlaylistDefinition(options: {
  playlist: readonly ChallengeDefinition[];
  matchId: string;
  roundNumber: number;
}): ChallengeDefinition | null {
  const { playlist, matchId, roundNumber } = options;
  if (playlist.length === 0 || roundNumber < 0) {
    return null;
  }
  const order = playlistOrderForCycle(playlist.length, matchId, roundNumber);
  const indexInCycle = roundNumber % playlist.length;
  return playlist[order[indexInCycle]!] ?? null;
}

/** Indices into the base playlist for the cycle that contains `roundNumber`. */
export function playlistOrderForCycle(
  playlistLength: number,
  matchId: string,
  roundNumber: number,
): number[] {
  if (playlistLength <= 0) {
    return [];
  }
  const cycleIndex = Math.floor(roundNumber / playlistLength);
  return permutationForCycle(playlistLength, matchId, cycleIndex);
}

/**
 * Identity order for cycle 0; Fisher–Yates for later cycles.
 * Seeded from matchId + cycleIndex so resume / multi-node stay consistent.
 */
export function permutationForCycle(
  length: number,
  matchId: string,
  cycleIndex: number,
): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  if (length <= 1 || cycleIndex <= 0) {
    return indices;
  }
  const rand = mulberry32(seedU32(`${matchId}:playlist-cycle:${cycleIndex}`));
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  return indices;
}

function seedU32(material: string): number {
  const digest = createHash('sha256').update(material).digest();
  return digest.readUInt32BE(0);
}

/** Small deterministic PRNG (https://gist.github.com/tommyettinger/46a8745332aa64dd8bdb). */
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
