import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
} from './types';

export const WAIT_FOR_SIGNAL_ENGINE_ID = 'reaction.wait_for_signal';

/**
 * Evaluator for the wait-for-signal reaction challenge.
 *
 * Success requires:
 * 1. The round has already been signaled (signalToken provided in context)
 * 2. The submitted answer.signalToken matches the expected token
 *
 * The MatchEngine passes `_signalToken` in the answer when the signal is
 * active, allowing this evaluator to validate without accessing round state.
 */
export class WaitForSignalEvaluator implements ChallengeEvaluator {
  readonly engineId = WAIT_FOR_SIGNAL_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false };
    }

    // _expectedSignalToken is injected by the engine before evaluation
    const expectedToken = input.answer['_expectedSignalToken'];
    const submittedToken = input.answer['signalToken'];

    if (!expectedToken || typeof expectedToken !== 'string') {
      // Signal has not fired yet — early tap is a failure
      return { success: false };
    }

    if (!submittedToken || typeof submittedToken !== 'string') {
      return { success: false };
    }

    return { success: submittedToken === expectedToken };
  }
}
