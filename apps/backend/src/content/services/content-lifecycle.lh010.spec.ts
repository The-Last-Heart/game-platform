import {
  ENGINE_RUNTIME_READINESS,
  type LaunchEngineId,
} from '@thelastheart/contracts';
import { ContentLifecycleService } from './content-lifecycle.service';

/**
 * Unit tests for LH-010 Studio features on ContentLifecycleService.
 *
 * These test pure logic paths (SoD, validation, catalog proof) that don't
 * need a database.
 */
describe('ContentLifecycleService LH-010', () => {
  describe('computeCatalogProof', () => {
    let service: ContentLifecycleService;

    beforeEach(() => {
      // Minimal construction — DB/audit are not called for proof computation
      service = Object.create(ContentLifecycleService.prototype) as ContentLifecycleService;
    });

    it('detects schema_only engines in entries', () => {
      const proof = service.computeCatalogProof([
        { definitionId: 'def1', engineId: 'reaction.wait_for_signal' },
        { definitionId: 'def2', engineId: 'motion.shake' },
      ]);
      expect(proof.schemaOnlyEngines).toEqual(['motion.shake']);
      expect(proof.valid).toBe(false);
    });

    it('reports valid when only live engines present', () => {
      const proof = service.computeCatalogProof([
        { definitionId: 'def1', engineId: 'reaction.wait_for_signal' },
        { definitionId: 'def2', engineId: 'trap.no_touch' },
      ]);
      expect(proof.schemaOnlyEngines).toEqual([]);
      expect(proof.emptyPlaylist).toBe(false);
      expect(proof.valid).toBe(true);
    });

    it('detects empty playlist when all entries are schema_only', () => {
      const proof = service.computeCatalogProof([
        { definitionId: 'def1', engineId: 'motion.shake' },
        { definitionId: 'def2', engineId: 'audio.cue' },
      ]);
      expect(proof.emptyPlaylist).toBe(true);
      expect(proof.valid).toBe(false);
    });

    it('reports empty playlist for no entries', () => {
      const proof = service.computeCatalogProof([]);
      expect(proof.emptyPlaylist).toBe(true);
      expect(proof.valid).toBe(false);
    });
  });

  describe('validateDefinition engine config cross-check', () => {
    let service: ContentLifecycleService;

    beforeEach(() => {
      service = Object.create(ContentLifecycleService.prototype) as ContentLifecycleService;
    });

    it('rejects definition with invalid engine configs', () => {
      expect(() =>
        service.validateDefinition({
          definitionId: 'test.def',
          definitionVersion: 1,
          engineId: 'reaction.wait_for_signal',
          durationMs: 5000,
          heartPenaltyOnFailure: 1,
          energyRewardOnSuccess: 1,
          promptKey: 'prompt',
          clientConfig: {
            categoryKey: 'cat',
            waitingPromptKey: 'wait',
            waitingHintKey: 'hint',
            activePromptKey: 'active',
            actionKey: 'action',
          },
          // Invalid: missing required signalDelayMs / signalWindowMs
          serverConfig: {},
          internalTitle: 'Test',
          familyId: 'reaction',
          categoryId: 'reaction.wait_for_signal',
          difficulty: 'easy',
          instructionAr: 'تعليمات',
          eligibleModes: ['dev'],
          accessibilityFallbackKey: 'fallback',
        }),
      ).toThrow();
    });

    it('passes definition with valid engine configs', () => {
      const def = service.validateDefinition({
        definitionId: 'test.def',
        definitionVersion: 1,
        engineId: 'reaction.wait_for_signal',
        durationMs: 5000,
        heartPenaltyOnFailure: 1,
        energyRewardOnSuccess: 1,
        promptKey: 'prompt',
        clientConfig: {
          categoryKey: 'cat',
          waitingPromptKey: 'wait',
          waitingHintKey: 'hint',
          activePromptKey: 'active',
          actionKey: 'action',
        },
        serverConfig: { signalDelayMs: 1500, signalWindowMs: 750 },
        internalTitle: 'Test',
        familyId: 'reaction',
        categoryId: 'reaction.wait_for_signal',
        difficulty: 'easy',
        instructionAr: 'تعليمات',
        eligibleModes: ['dev'],
        accessibilityFallbackKey: 'fallback',
      });
      expect(def.definitionId).toBe('test.def');
    });
  });
});
