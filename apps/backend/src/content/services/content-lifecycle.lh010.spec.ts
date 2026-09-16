import {
  ENGINE_RUNTIME_READINESS,
  type LaunchEngineId,
} from '@thelastheart/contracts';
import {
  ContentLifecycleService,
  isBulkPauseEligible,
  studioHomeCountsFromRows,
} from './content-lifecycle.service';

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
      service = Object.create(
        ContentLifecycleService.prototype,
      ) as ContentLifecycleService;
    });

    it('reports no schema_only engines when all are live', () => {
      const proof = service.computeCatalogProof([
        { definitionId: 'def1', engineId: 'reaction.wait_for_signal' },
        { definitionId: 'def2', engineId: 'motion.shake' },
      ]);
      expect(proof.schemaOnlyEngines).toEqual([]);
      expect(proof.valid).toBe(true);
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

    it('treats advanced engines as live playlist members', () => {
      const proof = service.computeCatalogProof([
        { definitionId: 'def1', engineId: 'motion.shake' },
        { definitionId: 'def2', engineId: 'audio.cue' },
      ]);
      expect(proof.emptyPlaylist).toBe(false);
      expect(proof.schemaOnlyEngines).toEqual([]);
      expect(proof.valid).toBe(true);
    });

    it('reports empty playlist for no entries', () => {
      const proof = service.computeCatalogProof([]);
      expect(proof.emptyPlaylist).toBe(true);
      expect(proof.valid).toBe(false);
    });
  });

  describe('isBulkPauseEligible', () => {
    it('allows pause for published, approved, and scheduled only', () => {
      expect(isBulkPauseEligible('published', true)).toBe(true);
      expect(isBulkPauseEligible('approved', true)).toBe(true);
      expect(isBulkPauseEligible('scheduled', true)).toBe(true);
      expect(isBulkPauseEligible('paused', true)).toBe(false);
      expect(isBulkPauseEligible('draft', true)).toBe(false);
      expect(isBulkPauseEligible('retired', true)).toBe(false);
    });

    it('allows resume for paused only', () => {
      expect(isBulkPauseEligible('paused', false)).toBe(true);
      expect(isBulkPauseEligible('published', false)).toBe(false);
      expect(isBulkPauseEligible('draft', false)).toBe(false);
    });
  });

  describe('studioHomeCountsFromRows', () => {
    it('maps library display statuses without rewriting published via pause overrides', () => {
      const counts = studioHomeCountsFromRows([
        { status: 'published', cnt: 3 },
        { status: 'paused', cnt: 19 },
        { status: 'submitted', cnt: 1 },
        { status: 'approved', cnt: 1 },
      ]);
      expect(counts.published).toBe(3);
      expect(counts.paused).toBe(19);
      expect(counts.submitted).toBe(1);
      expect(counts.approved).toBe(1);
      expect(counts.drafts).toBe(0);
      expect(counts.inReview).toBe(0);
      expect(counts.scheduled).toBe(0);
    });
  });

  describe('validateDefinition engine config cross-check', () => {
    let service: ContentLifecycleService;

    beforeEach(() => {
      service = Object.create(
        ContentLifecycleService.prototype,
      ) as ContentLifecycleService;
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
