import type { ChallengeDefinition } from './types';

export const DEFAULT_ROUND_RESULT_MS = 2500;
const MAX_INTRO_MS = 5000;
const MAX_RESULT_HOLD_MS = 10_000;

export function challengeIntroDurationMs(
  definition: ChallengeDefinition,
): number {
  const raw = definition.introDurationMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.min(MAX_INTRO_MS, Math.floor(raw));
}

export function challengeResultHoldMs(definition: ChallengeDefinition): number {
  const raw = definition.resultHoldMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return DEFAULT_ROUND_RESULT_MS;
  }
  return Math.min(MAX_RESULT_HOLD_MS, Math.floor(raw));
}
