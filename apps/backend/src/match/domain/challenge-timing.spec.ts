import {
  challengeIntroDurationMs,
  challengeResultHoldMs,
  DEFAULT_ROUND_RESULT_MS,
} from './challenge-timing';
import type { ChallengeDefinition } from './types';

function def(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: 'precision.neon_cable.dev',
    definitionVersion: 1,
    engineId: 'precision.neon_cable',
    durationMs: 8000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.neon_cable.intro',
    clientConfig: {},
    serverConfig: {},
    ...overrides,
  };
}

describe('challenge timing', () => {
  it('skips intro when unset or zero', () => {
    expect(challengeIntroDurationMs(def())).toBe(0);
    expect(challengeIntroDurationMs(def({ introDurationMs: 0 }))).toBe(0);
  });

  it('uses Studio intro duration when set', () => {
    expect(challengeIntroDurationMs(def({ introDurationMs: 2000 }))).toBe(2000);
  });

  it('falls back to the default result hold when unset', () => {
    expect(challengeResultHoldMs(def())).toBe(DEFAULT_ROUND_RESULT_MS);
  });

  it('uses Studio result hold when set', () => {
    expect(challengeResultHoldMs(def({ resultHoldMs: 4500 }))).toBe(4500);
    expect(challengeResultHoldMs(def({ resultHoldMs: 0 }))).toBe(0);
  });
});
