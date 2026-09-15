import { randomInt } from 'node:crypto';
import type { ChallengeDefinition } from './types';

type ObjectGroup = {
  groupId: string;
  keys: string[];
};

/**
 * Materialize a shared memory round for all seats:
 * pick one object group, sample distinct option keys, then build the
 * authoritative sequence. Mutates the pinned definition in place.
 */
export function materializeMemoryRound(definition: ChallengeDefinition): void {
  if (definition.engineId !== 'memory.sequence') {
    return;
  }
  const server = definition.serverConfig;
  const client = definition.clientConfig;
  const groups = readObjectGroups(server['objectGroups']);
  const optionCount = clampInt(server['optionCount'], 4, 2, 8);
  const sequenceLength = clampInt(server['sequenceLength'], 4, 1, 12);

  if (groups.length === 0) {
    // Legacy / explicit test defs keep authored optionKeys + sequence.
    return;
  }

  const group = groups[randomInt(0, groups.length)]!;
  const pool = shuffleCopy(group.keys);
  const optionKeys = pool.slice(0, Math.min(optionCount, pool.length));
  const sequence = buildSequence(optionKeys, sequenceLength);

  server['optionKeys'] = optionKeys;
  server['sequence'] = sequence;
  client['optionKeys'] = shuffleCopy(optionKeys);
}

function buildSequence(optionKeys: string[], sequenceLength: number): string[] {
  if (optionKeys.length === 0) {
    return [];
  }
  if (sequenceLength <= optionKeys.length) {
    return shuffleCopy(optionKeys).slice(0, sequenceLength);
  }
  const out: string[] = [];
  while (out.length < sequenceLength) {
    out.push(...shuffleCopy(optionKeys));
  }
  return out.slice(0, sequenceLength);
}

function readObjectGroups(raw: unknown): ObjectGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const groups: ObjectGroup[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const groupId =
      typeof record['groupId'] === 'string' ? record['groupId'].trim() : '';
    const keys = readStringList(record['keys']);
    if (!groupId || keys.length === 0) continue;
    groups.push({ groupId, keys });
  }
  return groups;
}

function readStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function shuffleCopy<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
