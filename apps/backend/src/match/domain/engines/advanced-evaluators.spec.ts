import {
  AudioCueEvaluator,
  MotionShakeEvaluator,
  MotionTiltBalanceEvaluator,
  SocialPairSyncEvaluator,
  TacticalRiskChoiceEvaluator,
} from './advanced-evaluators';
import type { ChallengeDefinition } from '../types';

function def(
  engineId: string,
  serverConfig: Record<string, unknown>,
): ChallengeDefinition {
  return {
    definitionId: `${engineId}.test`,
    definitionVersion: 1,
    engineId,
    durationMs: 5000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'prompt',
    choiceKeys: [],
    clientConfig: {},
    serverConfig,
  };
}

describe('advanced evaluators (LH-009)', () => {
  describe('MotionShakeEvaluator', () => {
    const evaluator = new MotionShakeEvaluator();
    const definition = def('motion.shake', { requiredShakeCount: 5 });

    it('succeeds when shake count meets requirement', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { shakeCount: 5 },
        receivedMonoMs: 1000,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('fails when incomplete', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { shakeCount: 2 },
        receivedMonoMs: 1000,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(false);
      expect(result.reasonKey).toBe('result.shake.incomplete');
    });
  });

  describe('MotionTiltBalanceEvaluator', () => {
    const evaluator = new MotionTiltBalanceEvaluator();
    const definition = def('motion.tilt_balance', {
      targetX: 0,
      targetY: 0,
      holdMs: 1500,
      varianceTolerance: 0.2,
    });

    it('succeeds inside tolerance with enough hold', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { finalX: 0.05, finalY: -0.05, heldMs: 1600 },
        receivedMonoMs: 2000,
        deadlineMonoMs: 6000,
      });
      expect(result.success).toBe(true);
    });

    it('fails when out of tolerance', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { finalX: 0.9, finalY: 0.9, heldMs: 2000 },
        receivedMonoMs: 2000,
        deadlineMonoMs: 6000,
      });
      expect(result.success).toBe(false);
      expect(result.reasonKey).toBe('result.tilt.miss');
    });
  });

  describe('AudioCueEvaluator', () => {
    const evaluator = new AudioCueEvaluator();
    const definition = def('audio.cue', { pulseCount: 3 });

    it('succeeds on exact pulse count', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { reportedPulseCount: 3 },
          receivedMonoMs: 1000,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });

    it('fails on wrong count', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { reportedPulseCount: 2 },
        receivedMonoMs: 1000,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(false);
      expect(result.reasonKey).toBe('result.audio.wrong_count');
    });
  });

  describe('SocialPairSyncEvaluator', () => {
    const evaluator = new SocialPairSyncEvaluator();
    const definition = def('social.pair_sync', { syncWindowMs: 500 });

    it('fair-fallback succeeds without partner', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { synced: true, _hasPartner: false },
        receivedMonoMs: 1000,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.reasonKey).toBe('result.pair.fallback');
    });

    it('succeeds when submitter held but partner missing', () => {
      const result = evaluator.evaluate({
        definition,
        answer: {
          synced: true,
          heldMs: 4000,
          _hasPartner: true,
          _partnerSubmitted: false,
        },
        receivedMonoMs: 1000,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.reasonKey).toBe('result.pair.partner_absent_ok');
    });

    it('succeeds when both held and press starts within sync window', () => {
      const result = evaluator.evaluate({
        definition,
        answer: {
          synced: true,
          heldMs: 4000,
          _hasPartner: true,
          _partnerSubmitted: true,
          _partnerHeldMs: 4100,
          _partnerReleasedEarly: false,
          // Finish times differ a lot, but press starts align (received - held).
          _selfReceivedMonoMs: 4500,
          _partnerReceivedMonoMs: 4900,
        },
        receivedMonoMs: 4500,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('fails both sides when partner released early (shared outcome)', () => {
      const result = evaluator.evaluate({
        definition,
        answer: {
          synced: true,
          heldMs: 4000,
          _hasPartner: true,
          _partnerSubmitted: true,
          _partnerHeldMs: 200,
          _partnerReleasedEarly: true,
          _selfReceivedMonoMs: 4500,
          _partnerReceivedMonoMs: 4600,
        },
        receivedMonoMs: 4500,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(false);
      expect(result.reasonKey).toBe('result.pair.out_of_sync');
    });

    it('fails both sides when either held too briefly', () => {
      const result = evaluator.evaluate({
        definition,
        answer: {
          synced: true,
          heldMs: 4000,
          _hasPartner: true,
          _partnerSubmitted: true,
          _partnerHeldMs: 1000,
          _partnerReleasedEarly: false,
          _selfReceivedMonoMs: 4500,
          _partnerReceivedMonoMs: 4600,
        },
        receivedMonoMs: 4500,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(false);
    });

    it('fails when released early', () => {
      const result = evaluator.evaluate({
        definition,
        answer: {
          synced: false,
          releasedEarly: true,
          heldMs: 200,
          _hasPartner: true,
          _partnerSubmitted: true,
          _partnerHeldMs: 4000,
          _partnerReleasedEarly: false,
        },
        receivedMonoMs: 1000,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(false);
    });

    it('fails when press starts are out of sync', () => {
      const result = evaluator.evaluate({
        definition,
        answer: {
          synced: true,
          heldMs: 4000,
          _hasPartner: true,
          _partnerSubmitted: true,
          _partnerHeldMs: 4000,
          _partnerReleasedEarly: false,
          _selfReceivedMonoMs: 4500,
          _partnerReceivedMonoMs: 5500,
        },
        receivedMonoMs: 4500,
        deadlineMonoMs: 8000,
      });
      expect(result.success).toBe(false);
      expect(result.reasonKey).toBe('result.pair.out_of_sync');
    });
  });

  describe('TacticalRiskChoiceEvaluator', () => {
    const evaluator = new TacticalRiskChoiceEvaluator();
    const definition = def('tactical.risk_choice', {
      optionKeys: ['option.safe', 'option.risky'],
      riskWeights: [30, 70],
    });

    it('safe path awards +1 energy', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: 'option.safe' },
        receivedMonoMs: 800,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.energyRewardOverride).toBe(1);
    });

    it('risky path awards +3 energy', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: 'option.risky' },
        receivedMonoMs: 800,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.energyRewardOverride).toBe(3);
    });
  });
});
