import type { ChallengeDefinitionContract } from '@thelastheart/contracts';
import { toRuntimeChallengeDefinition } from './runtime-definition';

describe('toRuntimeChallengeDefinition', () => {
  it('carries Studio timing onto the match playlist', () => {
    const def = {
      definitionId: 'precision.neon_cable.dev',
      definitionVersion: 2,
      engineId: 'precision.neon_cable',
      durationMs: 4000,
      introDurationMs: 1000,
      resultHoldMs: 1500,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.neon_cable.intro',
      clientConfig: {},
      serverConfig: {},
      internalTitle: 'Neon cable connect',
      familyId: 'precision',
      categoryId: 'precision.neon_cable',
      difficulty: 'easy',
      instructionAr: 'اسحب السلك',
      eligibleModes: ['training'],
      accessibilityFallbackKey: 'challenge.neon_cable.a11y_fallback',
    } as ChallengeDefinitionContract;

    expect(toRuntimeChallengeDefinition(def)).toMatchObject({
      definitionId: 'precision.neon_cable.dev',
      definitionVersion: 2,
      durationMs: 4000,
      introDurationMs: 1000,
      resultHoldMs: 1500,
    });
  });
});
