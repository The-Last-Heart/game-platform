import {
  validateEngineConfigs,
  ENGINE_RUNTIME_READINESS,
  type LaunchEngineId,
} from '@thelastheart/contracts';

describe('LH-010 engine extensions', () => {
  describe('validateEngineConfigs for schema-only engines', () => {
    it('validates motion.shake configs', () => {
      const result = validateEngineConfigs(
        'motion.shake',
        {
          categoryKey: 'cat.motion',
          promptKey: 'shake.prompt',
          progressKey: 'shake.progress',
        },
        {
          requiredShakeCount: 10,
          noiseThreshold: 5,
        },
      );
      expect(result.engineId).toBe('motion.shake');
    });

    it('validates motion.tilt_balance configs', () => {
      const result = validateEngineConfigs(
        'motion.tilt_balance',
        {
          categoryKey: 'cat.motion',
          promptKey: 'tilt.prompt',
        },
        {
          targetX: 0.5,
          targetY: -0.3,
          holdMs: 2000,
          varianceTolerance: 0.15,
        },
      );
      expect(result.engineId).toBe('motion.tilt_balance');
    });

    it('validates audio.cue configs', () => {
      const result = validateEngineConfigs(
        'audio.cue',
        {
          categoryKey: 'cat.audio',
          promptKey: 'audio.prompt',
          visualFallbackKey: 'audio.visual',
          hapticFallbackKey: 'audio.haptic',
        },
        { pulseCount: 3 },
      );
      expect(result.engineId).toBe('audio.cue');
    });

    it('validates social.pair_sync configs with matching partnerRoleKeys', () => {
      const result = validateEngineConfigs(
        'social.pair_sync',
        {
          categoryKey: 'cat.social',
          promptKey: 'pair.prompt',
          partnerRoleKeys: ['role.a', 'role.b'],
        },
        {
          partnerRoleKeys: ['role.b', 'role.a'],
          syncWindowMs: 3000,
        },
      );
      expect(result.engineId).toBe('social.pair_sync');
    });

    it('rejects social.pair_sync with mismatched partnerRoleKeys', () => {
      expect(() =>
        validateEngineConfigs(
          'social.pair_sync',
          {
            categoryKey: 'cat.social',
            promptKey: 'pair.prompt',
            partnerRoleKeys: ['role.a', 'role.b'],
          },
          {
            partnerRoleKeys: ['role.x'],
            syncWindowMs: 3000,
          },
        ),
      ).toThrow();
    });

    it('validates tactical.risk_choice configs with matching optionKeys', () => {
      const result = validateEngineConfigs(
        'tactical.risk_choice',
        {
          categoryKey: 'cat.tactical',
          promptKey: 'risk.prompt',
          optionKeys: ['opt1', 'opt2', 'opt3'],
        },
        {
          optionKeys: ['opt3', 'opt1', 'opt2'],
          riskWeights: [50, 30, 20],
        },
      );
      expect(result.engineId).toBe('tactical.risk_choice');
    });

    it('rejects tactical.risk_choice with mismatched optionKeys', () => {
      expect(() =>
        validateEngineConfigs(
          'tactical.risk_choice',
          {
            categoryKey: 'cat.tactical',
            promptKey: 'risk.prompt',
            optionKeys: ['opt1', 'opt2'],
          },
          {
            optionKeys: ['opt1', 'opt3'],
            riskWeights: [50, 50],
          },
        ),
      ).toThrow();
    });

    it('rejects tactical.risk_choice with mismatched riskWeights length', () => {
      expect(() =>
        validateEngineConfigs(
          'tactical.risk_choice',
          {
            categoryKey: 'cat.tactical',
            promptKey: 'risk.prompt',
            optionKeys: ['opt1', 'opt2'],
          },
          {
            optionKeys: ['opt1', 'opt2'],
            riskWeights: [50],
          },
        ),
      ).toThrow();
    });
  });

  describe('ENGINE_RUNTIME_READINESS', () => {
    it('marks live engines correctly', () => {
      expect(ENGINE_RUNTIME_READINESS['reaction.wait_for_signal']).toBe('live');
      expect(ENGINE_RUNTIME_READINESS['trap.no_touch']).toBe('live');
      expect(ENGINE_RUNTIME_READINESS['gesture.reverse_swipe']).toBe('live');
      expect(ENGINE_RUNTIME_READINESS['tap.precision']).toBe('live');
      expect(ENGINE_RUNTIME_READINESS['memory.sequence']).toBe('live');
      expect(ENGINE_RUNTIME_READINESS['hold.multitouch']).toBe('live');
    });

    it('marks schema_only engines correctly', () => {
      expect(ENGINE_RUNTIME_READINESS['motion.shake']).toBe('schema_only');
      expect(ENGINE_RUNTIME_READINESS['motion.tilt_balance']).toBe('schema_only');
      expect(ENGINE_RUNTIME_READINESS['audio.cue']).toBe('schema_only');
      expect(ENGINE_RUNTIME_READINESS['social.pair_sync']).toBe('schema_only');
      expect(ENGINE_RUNTIME_READINESS['tactical.risk_choice']).toBe('schema_only');
    });

    it('covers all 11 engines', () => {
      expect(Object.keys(ENGINE_RUNTIME_READINESS)).toHaveLength(11);
    });
  });
});
