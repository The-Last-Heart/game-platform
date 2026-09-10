import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
  ChallengeEvaluatorRegistry,
} from './types';

/**
 * Development/test-only deterministic evaluator.
 * Not real product challenge content. Unavailable in production registration.
 */
export const DEV_DETERMINISTIC_CHOICE_ENGINE_ID = 'dev.deterministic_choice';
export const DEV_CHALLENGE_DEFINITION_ID = 'dev.deterministic_choice.v1';

export class DevDeterministicChoiceEvaluator implements ChallengeEvaluator {
  readonly engineId = DEV_DETERMINISTIC_CHOICE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false };
    }
    const expected = input.definition.serverConfig['expectedChoice'];
    const choice = input.answer['choice'];
    return { success: expected === choice };
  }
}

export class ChallengeEvaluatorRegistryImpl
  implements ChallengeEvaluatorRegistry
{
  private readonly map = new Map<string, ChallengeEvaluator>();

  register(evaluator: ChallengeEvaluator): void {
    this.map.set(evaluator.engineId, evaluator);
  }

  get(engineId: string): ChallengeEvaluator | undefined {
    return this.map.get(engineId);
  }
}

export function createDevChallengeDefinition(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: overrides.definitionId ?? DEV_CHALLENGE_DEFINITION_ID,
    definitionVersion: overrides.definitionVersion ?? 1,
    engineId: DEV_DETERMINISTIC_CHOICE_ENGINE_ID,
    durationMs: overrides.durationMs ?? 3000,
    heartPenaltyOnFailure: overrides.heartPenaltyOnFailure ?? 1,
    energyRewardOnSuccess: overrides.energyRewardOnSuccess ?? 1,
    promptKey: overrides.promptKey ?? 'dev.challenge.prompt',
    choiceKeys: overrides.choiceKeys ?? [
      'dev.challenge.choice.a',
      'dev.challenge.choice.b',
    ],
    clientConfig: {
      fixtureMode: true,
      ...(overrides.clientConfig ?? {}),
    },
    serverConfig: {
      expectedChoice: 'a',
      ...(overrides.serverConfig ?? {}),
    },
  };
}
