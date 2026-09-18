import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
} from '../types';

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const MOTION_SHAKE_ENGINE_ID = 'motion.shake';
export const MOTION_TILT_BALANCE_ENGINE_ID = 'motion.tilt_balance';
export const AUDIO_CUE_ENGINE_ID = 'audio.cue';
export const SOCIAL_PAIR_SYNC_ENGINE_ID = 'social.pair_sync';
export const TACTICAL_RISK_CHOICE_ENGINE_ID = 'tactical.risk_choice';

export class MotionShakeEvaluator implements ChallengeEvaluator {
  readonly engineId = MOTION_SHAKE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const required = num(
      input.definition.serverConfig['requiredShakeCount'],
      3,
    );
    const count = num(input.answer['shakeCount']);
    if (count < required) {
      return { success: false, reasonKey: 'result.shake.incomplete' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class MotionTiltBalanceEvaluator implements ChallengeEvaluator {
  readonly engineId = MOTION_TILT_BALANCE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const targetX = num(input.definition.serverConfig['targetX'], 0);
    const targetY = num(input.definition.serverConfig['targetY'], 0);
    const holdMs = num(input.definition.serverConfig['holdMs'], 1500);
    const tolerance = num(
      input.definition.serverConfig['varianceTolerance'],
      0.22,
    );
    const finalX = num(input.answer['finalX']);
    const finalY = num(input.answer['finalY']);
    const heldMs = num(input.answer['heldMs']);
    const dist = Math.hypot(finalX - targetX, finalY - targetY);
    if (dist > tolerance || heldMs < holdMs) {
      return { success: false, reasonKey: 'result.tilt.miss' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(heldMs)),
    };
  }
}

export class AudioCueEvaluator implements ChallengeEvaluator {
  readonly engineId = AUDIO_CUE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const expected = num(input.definition.serverConfig['pulseCount'], 3);
    const reported = num(input.answer['reportedPulseCount'], -1);
    if (reported !== expected) {
      return { success: false, reasonKey: 'result.audio.wrong_count' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class SocialPairSyncEvaluator implements ChallengeEvaluator {
  readonly engineId = SOCIAL_PAIR_SYNC_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    // Odd-seat / missing partner → published fair fallback (no heart loss).
    if (input.answer['_hasPartner'] !== true) {
      return {
        success: true,
        reasonKey: 'result.pair.fallback',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }

    // A press is any in-window submit. Short taps must be able to succeed
    // when the partner never arrives (fair continue).
    const selfPressed =
      input.answer['synced'] === true ||
      input.answer['holding'] === true ||
      num(input.answer['heldMs'], 0) > 0;

    // Submitter pressed; partner never submitted → fair success (no heart loss).
    if (input.answer['_partnerSubmitted'] !== true) {
      if (!selfPressed) {
        return { success: false, reasonKey: 'result.pair.out_of_sync' };
      }
      return {
        success: true,
        reasonKey: 'result.pair.partner_absent_ok',
        measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      };
    }

    const togetherMs = num(input.definition.serverConfig['togetherMs'], 0);
    const overlapMs = num(input.answer['_overlapMs'], 0);
    // Win by overlapping taps for togetherMs. Accidental release pauses
    // the overlap clock; it must not fail the pair by itself.
    if (togetherMs > 0 && overlapMs >= togetherMs) {
      return {
        success: true,
        reasonKey: 'result.success',
        measureMs: Math.max(0, Math.floor(overlapMs)),
      };
    }
    return { success: false, reasonKey: 'result.pair.out_of_sync' };
  }
}

export class TacticalRiskChoiceEvaluator implements ChallengeEvaluator {
  readonly engineId = TACTICAL_RISK_CHOICE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const optionKeys = input.definition.serverConfig['optionKeys'];
    const riskWeights = input.definition.serverConfig['riskWeights'];
    const chosen = str(input.answer['chosenOptionKey']);
    if (!chosen || !Array.isArray(optionKeys) || !optionKeys.includes(chosen)) {
      return { success: false, reasonKey: 'result.risk.invalid' };
    }
    const index = optionKeys.indexOf(chosen);
    const weights = Array.isArray(riskWeights)
      ? riskWeights.map((w) => num(w, 50))
      : [];
    const weight = weights[index] ?? 50;
    // Higher risk weight → higher energy reward (safe ~1, risky ~3).
    const energyRewardOverride = weight >= 60 ? 3 : 1;
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
      energyRewardOverride,
    };
  }
}

export function createAdvancedEvaluators(): ChallengeEvaluator[] {
  return [
    new MotionShakeEvaluator(),
    new MotionTiltBalanceEvaluator(),
    new AudioCueEvaluator(),
    new SocialPairSyncEvaluator(),
    new TacticalRiskChoiceEvaluator(),
  ];
}
