import {
  COMPLETE_SUM_DEFAULT_GENERATION_RULES,
  completeSumGenerationRuleSchema,
  type CompleteSumGenerationRule,
  type CompleteSumPlayerCount,
} from '@thelastheart/contracts';

export const LOGIC_COMPLETE_SUM_ENGINE_ID = 'logic.complete_sum';

export type CompleteSumPublicPayload = {
  target: number;
  participantIds: string[];
  selections: Record<string, number | null>;
  currentTotal: number;
  allSelected: boolean;
  stateSequence: number;
  incorrectTotal: boolean;
};

/**
 * Server-only witness. Must never be copied into clientConfig, public
 * snapshots, logs, or analytics payloads.
 */
export type CompleteSumHiddenSolution = {
  solutionByPlayerId: Record<string, number>;
};

/** How long the active round stays up so clients can play the success ring/total motion. */
export const COMPLETE_SUM_SUCCESS_ANIM_MS = 1400;

export type CompleteSumRoundState = CompleteSumPublicPayload & {
  /** Authoritative per-seat choices — never broadcast in full. */
  optionsByPlayerId: Record<string, number[]>;
  hidden: CompleteSumHiddenSolution;
  /**
   * When set, the target was hit and resolve is deferred until this mono time
   * so the mobile ring/total success motion can finish.
   */
  successResolveAtMonoMs?: number | null;
};

export type CompleteSumGenerationResult = {
  target: number;
  optionsByPlayerId: Record<string, number[]>;
  hidden: CompleteSumHiddenSolution;
  usedFallback: boolean;
  attempts: number;
};

export class CompleteSumConfigError extends Error {
  readonly code = 'COMPLETE_SUM_INVALID_CONFIG';

  constructor(message: string) {
    super(message);
    this.name = 'CompleteSumConfigError';
  }
}

/** Mulberry32 — deterministic RNG from a 32-bit seed. */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function assertPlayerCount(n: number): CompleteSumPlayerCount {
  if (n === 2 || n === 3 || n === 4 || n === 5 || n === 6) {
    return n;
  }
  throw new CompleteSumConfigError(
    `complete_sum requires 2–6 participants, got ${n}`,
  );
}

export function resolveGenerationRule(
  participantCount: number,
  configured?: Partial<
    Record<CompleteSumPlayerCount | `${CompleteSumPlayerCount}`, unknown>
  >,
): CompleteSumGenerationRule {
  const n = assertPlayerCount(participantCount);
  const rules = configured as Record<string | number, unknown> | undefined;
  const raw = rules?.[n] ?? rules?.[String(n)];
  if (raw == null) {
    return COMPLETE_SUM_DEFAULT_GENERATION_RULES[n];
  }
  const parsed = completeSumGenerationRuleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CompleteSumConfigError(
      `invalid generation rule for ${n} players: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function rangeValues(rule: CompleteSumGenerationRule): number[] {
  const out: number[] = [];
  for (let v = rule.minValue; v <= rule.maxValue; v += 1) {
    out.push(v);
  }
  return out;
}

/**
 * Independent reachability validator: exactly one selection per participant.
 * DP over reachable sums — do not rely solely on sum(solution).
 */
export function isTargetReachable(
  optionsByPlayer: readonly (readonly number[])[],
  target: number,
): boolean {
  let reachable = new Set<number>([0]);
  for (const options of optionsByPlayer) {
    const next = new Set<number>();
    for (const sum of reachable) {
      for (const option of options) {
        next.add(sum + option);
      }
    }
    reachable = next;
  }
  return reachable.has(target);
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}

function pickDistinct(
  pool: readonly number[],
  count: number,
  rng: () => number,
  mustInclude: number,
): number[] | null {
  if (!pool.includes(mustInclude)) {
    return null;
  }
  if (pool.length < count) {
    return null;
  }
  const others = pool.filter((v) => v !== mustInclude);
  shuffleInPlace(others, rng);
  const chosen = [mustInclude, ...others.slice(0, count - 1)];
  if (chosen.length !== count) {
    return null;
  }
  if (new Set(chosen).size !== count) {
    return null;
  }
  shuffleInPlace(chosen, rng);
  return chosen;
}

function isTrivialSolution(
  solution: readonly number[],
  rule: CompleteSumGenerationRule,
): boolean {
  if (solution.length === 0) return true;
  const allMin = solution.every((v) => v === rule.minValue);
  const allMax = solution.every((v) => v === rule.maxValue);
  return allMin || allMax;
}

function absoluteMinMaxTotals(
  n: number,
  rule: CompleteSumGenerationRule,
): { minTotal: number; maxTotal: number } {
  return {
    minTotal: rule.minValue * n,
    maxTotal: rule.maxValue * n,
  };
}

/**
 * Choices must never include the target itself: picking it forces every other
 * seat to contribute 0, which is an easy grief when 0 is not offered.
 */
function choicePoolExcludingTarget(
  pool: readonly number[],
  target: number,
): number[] {
  return pool.filter((v) => v !== target);
}

function tryGenerateOnce(
  participantIds: readonly string[],
  rule: CompleteSumGenerationRule,
  rng: () => number,
): Omit<CompleteSumGenerationResult, 'usedFallback' | 'attempts'> | null {
  const n = participantIds.length;
  const pool = rangeValues(rule);
  const { minTotal, maxTotal } = absoluteMinMaxTotals(n, rule);

  const solution: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const idx = Math.floor(rng() * pool.length);
    solution.push(pool[idx]!);
  }
  if (isTrivialSolution(solution, rule)) {
    return null;
  }

  const target = solution.reduce((a, b) => a + b, 0);
  if (target <= minTotal || target >= maxTotal) {
    return null;
  }
  // A seat holding the full target (others must be 0) is rejected as griefable.
  if (solution.some((v) => v === target)) {
    return null;
  }

  const choicePool = choicePoolExcludingTarget(pool, target);
  if (choicePool.length < rule.choicesPerPlayer) {
    return null;
  }

  const optionsByPlayerId: Record<string, number[]> = {};
  const solutionByPlayerId: Record<string, number> = {};
  for (let i = 0; i < n; i += 1) {
    const playerId = participantIds[i]!;
    const seatSolution = solution[i]!;
    if (seatSolution === target || !choicePool.includes(seatSolution)) {
      return null;
    }
    const choices = pickDistinct(
      choicePool,
      rule.choicesPerPlayer,
      rng,
      seatSolution,
    );
    if (!choices) {
      return null;
    }
    optionsByPlayerId[playerId] = choices;
    solutionByPlayerId[playerId] = seatSolution;
  }

  const optionLists = participantIds.map((id) => optionsByPlayerId[id]!);
  if (!isTargetReachable(optionLists, target)) {
    return null;
  }

  return {
    target,
    optionsByPlayerId,
    hidden: { solutionByPlayerId },
  };
}

/**
 * Deterministic safe fallback: non-trivial mid value for every seat, four
 * distinct in-range choices including that value. Always DP-validated.
 */
export function buildSafeFallback(
  participantIds: readonly string[],
  rule: CompleteSumGenerationRule,
  rng: () => number,
): Omit<CompleteSumGenerationResult, 'usedFallback' | 'attempts'> {
  const n = participantIds.length;
  const pool = rangeValues(rule);
  if (pool.length < rule.choicesPerPlayer) {
    throw new CompleteSumConfigError(
      `range [${rule.minValue},${rule.maxValue}] has fewer than ${rule.choicesPerPlayer} distinct values`,
    );
  }

  let preferred = rule.minValue + 1;
  if (preferred > rule.maxValue || preferred === rule.maxValue) {
    preferred = Math.floor((rule.minValue + rule.maxValue) / 2);
  }
  if (preferred === rule.minValue && rule.maxValue > rule.minValue) {
    preferred = rule.minValue + 1;
  }

  const target = preferred * n;
  if (preferred === target) {
    throw new CompleteSumConfigError(
      'safe fallback preferred value must not equal target',
    );
  }

  const choicePool = choicePoolExcludingTarget(pool, target);
  if (choicePool.length < rule.choicesPerPlayer || !choicePool.includes(preferred)) {
    throw new CompleteSumConfigError(
      'safe fallback choice pool cannot exclude target and still fill seats',
    );
  }

  const optionsByPlayerId: Record<string, number[]> = {};
  const solutionByPlayerId: Record<string, number> = {};
  for (const playerId of participantIds) {
    const choices = pickDistinct(
      choicePool,
      rule.choicesPerPlayer,
      rng,
      preferred,
    );
    if (!choices) {
      throw new CompleteSumConfigError('safe fallback could not build choices');
    }
    optionsByPlayerId[playerId] = choices;
    solutionByPlayerId[playerId] = preferred;
  }

  const optionLists = participantIds.map((id) => optionsByPlayerId[id]!);
  if (!isTargetReachable(optionLists, target)) {
    throw new CompleteSumConfigError('safe fallback failed reachability');
  }

  return {
    target,
    optionsByPlayerId,
    hidden: { solutionByPlayerId },
  };
}

export function generateCompleteSumRound(input: {
  participantIds: readonly string[];
  generationRules?: Partial<
    Record<CompleteSumPlayerCount | `${CompleteSumPlayerCount}`, unknown>
  >;
  maxAttempts?: number;
  seed?: number;
}): CompleteSumGenerationResult {
  const participantIds = [...input.participantIds];
  if (participantIds.length < 2 || participantIds.length > 6) {
    throw new CompleteSumConfigError(
      `complete_sum requires 2–6 participants, got ${participantIds.length}`,
    );
  }
  const unique = new Set(participantIds);
  if (unique.size !== participantIds.length) {
    throw new CompleteSumConfigError('participant ids must be unique');
  }

  const rule = resolveGenerationRule(
    participantIds.length,
    input.generationRules,
  );
  const maxAttempts = Math.min(256, Math.max(1, input.maxAttempts ?? 48));
  const seed =
    input.seed ??
    hashStringToSeed(`complete_sum:${participantIds.join(',')}:${Date.now()}`);
  const rng = createSeededRng(seed);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = tryGenerateOnce(participantIds, rule, rng);
    if (generated) {
      return {
        ...generated,
        usedFallback: false,
        attempts: attempt,
      };
    }
  }

  const fallback = buildSafeFallback(participantIds, rule, rng);
  return {
    ...fallback,
    usedFallback: true,
    attempts: maxAttempts,
  };
}

export function emptySelections(
  participantIds: readonly string[],
): Record<string, number | null> {
  const selections: Record<string, number | null> = {};
  for (const id of participantIds) {
    selections[id] = null;
  }
  return selections;
}

export function recalculateCompleteSumTotal(
  participantIds: readonly string[],
  selections: Readonly<Record<string, number | null>>,
): { currentTotal: number; allSelected: boolean } {
  let currentTotal = 0;
  let allSelected = true;
  for (const id of participantIds) {
    const value = selections[id];
    if (value == null) {
      allSelected = false;
      continue;
    }
    currentTotal += value;
  }
  return { currentTotal, allSelected };
}

export function buildInitialCompleteSumState(input: {
  participantIds: readonly string[];
  generated: CompleteSumGenerationResult;
}): CompleteSumRoundState {
  const selections = emptySelections(input.participantIds);
  return {
    target: input.generated.target,
    participantIds: [...input.participantIds],
    optionsByPlayerId: input.generated.optionsByPlayerId,
    selections,
    currentTotal: 0,
    allSelected: false,
    stateSequence: 0,
    incorrectTotal: false,
    successResolveAtMonoMs: null,
    hidden: input.generated.hidden,
  };
}

/** Public fields only — never includes hidden solution or other seats' options. */
export function toCompleteSumPublicPayload(
  state: CompleteSumRoundState,
): CompleteSumPublicPayload {
  return {
    target: state.target,
    participantIds: [...state.participantIds],
    selections: { ...state.selections },
    currentTotal: state.currentTotal,
    allSelected: state.allSelected,
    stateSequence: state.stateSequence,
    incorrectTotal: state.incorrectTotal,
  };
}

export function applyCompleteSumSelection(input: {
  state: CompleteSumRoundState;
  playerId: string;
  selectedValue: number;
  /** Mono clock used to stamp deferred success resolve. */
  nowMonoMs?: number;
}):
  | { ok: true; state: CompleteSumRoundState; succeeded: boolean }
  | { ok: false; reason: string } {
  const { state, playerId, selectedValue } = input;
  if (!state.participantIds.includes(playerId)) {
    return { ok: false, reason: 'not_participating' };
  }
  // Target already hit — keep the round frozen while success motion plays.
  if (
    state.successResolveAtMonoMs != null ||
    (state.allSelected && state.currentTotal === state.target)
  ) {
    return { ok: false, reason: 'already_succeeded' };
  }
  const options = state.optionsByPlayerId[playerId];
  if (!options || !options.includes(selectedValue)) {
    return { ok: false, reason: 'invalid_value' };
  }

  const selections = { ...state.selections, [playerId]: selectedValue };
  const { currentTotal, allSelected } = recalculateCompleteSumTotal(
    state.participantIds,
    selections,
  );
  const succeeded = allSelected && currentTotal === state.target;
  const incorrectTotal = allSelected && currentTotal !== state.target;
  const nowMono = input.nowMonoMs ?? 0;

  return {
    ok: true,
    succeeded,
    state: {
      ...state,
      selections,
      currentTotal,
      allSelected,
      incorrectTotal,
      stateSequence: state.stateSequence + 1,
      successResolveAtMonoMs: succeeded
        ? nowMono + COMPLETE_SUM_SUCCESS_ANIM_MS
        : (state.successResolveAtMonoMs ?? null),
    },
  };
}
