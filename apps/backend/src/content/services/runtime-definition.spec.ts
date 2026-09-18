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

  it('copies Studio difficulty onto ring-lock serverConfig for generation', () => {
    const def = {
      definitionId: 'precision.ring_lock.dev',
      definitionVersion: 1,
      engineId: 'precision.ring_lock',
      durationMs: 15000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.ring_lock.intro',
      clientConfig: {},
      serverConfig: {
        minAngularVelocityDegPerSec: 45,
        maxAngularVelocityDegPerSec: 90,
        alignmentToleranceDeg: 24,
        difficulty: 'medium',
      },
      internalTitle: 'Unlock the Rings',
      familyId: 'precision',
      categoryId: 'precision.ring_lock',
      difficulty: 'hard',
      instructionAr: 'أوقف الحلقات',
      eligibleModes: ['training'],
      accessibilityFallbackKey: 'challenge.ring_lock.a11y_fallback',
    } as ChallengeDefinitionContract;

    expect(toRuntimeChallengeDefinition(def).serverConfig['difficulty']).toBe(
      'hard',
    );
  });

  it('fills tap speed from difficulty when Studio omitted it', () => {
    const def = {
      definitionId: 'tap.precision.dev',
      definitionVersion: 1,
      engineId: 'tap.precision',
      durationMs: 5000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.precision.intro',
      clientConfig: {
        categoryKey: 'challenge.category.tap',
        promptKey: 'challenge.precision.prompt',
        targets: [{ id: 't1', x: 0.5, y: 0.5 }],
        attemptCount: 1,
      },
      serverConfig: { targetIds: ['t1'], attemptCount: 1 },
      internalTitle: 'Precision tap',
      familyId: 'tap',
      categoryId: 'tap.precision',
      difficulty: 'hard',
      instructionAr: 'اضغط',
      eligibleModes: ['training'],
      accessibilityFallbackKey: 'challenge.precision.a11y_fallback',
    } as ChallengeDefinitionContract;

    const runtime = toRuntimeChallengeDefinition(def);
    expect(runtime.clientConfig['attemptCount']).toBe(1);
    expect(runtime.clientConfig['speedMin']).toBeGreaterThan(0.2);
    expect(runtime.durationMs).toBe(5000);
  });

  it('widens pair-sync duration so togetherMs can finish after both start', () => {
    const def = {
      definitionId: 'social.pair_sync.dev',
      definitionVersion: 1,
      engineId: 'social.pair_sync',
      durationMs: 5000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.pair_sync.intro',
      clientConfig: {},
      serverConfig: {
        partnerRoleKeys: ['role.leader', 'role.follower'],
        togetherMs: 5000,
        syncWindowMs: 500,
      },
      internalTitle: 'Pair sync',
      familyId: 'social',
      categoryId: 'social.pair_sync',
      difficulty: 'hard',
      instructionAr: 'زامن',
      eligibleModes: ['quick_survival'],
      accessibilityFallbackKey: 'challenge.pair_sync.a11y_fallback',
    } as ChallengeDefinitionContract;

    const runtime = toRuntimeChallengeDefinition(def);
    expect(runtime.durationMs).toBeGreaterThanOrEqual(8000);
    expect(runtime.serverConfig['togetherMs']).toBe(5000);
  });
});
