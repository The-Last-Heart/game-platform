import type { ChallengeDefinitionContract } from '@thelastheart/contracts';
import type { ChallengeDefinition } from '../../match/domain/types';

/** Map a published Studio definition onto the match-runtime shape. */
export function toRuntimeChallengeDefinition(
  def: ChallengeDefinitionContract,
): ChallengeDefinition {
  return {
    definitionId: def.definitionId,
    definitionVersion: def.definitionVersion,
    engineId: def.engineId,
    durationMs: def.durationMs,
    introDurationMs: def.introDurationMs,
    resultHoldMs: def.resultHoldMs,
    heartPenaltyOnFailure: def.heartPenaltyOnFailure,
    energyRewardOnSuccess: def.energyRewardOnSuccess,
    promptKey: def.promptKey,
    difficulty: def.difficulty,
    choiceKeys: def.choiceKeys,
    clientConfig: def.clientConfig,
    serverConfig: def.serverConfig,
  };
}
