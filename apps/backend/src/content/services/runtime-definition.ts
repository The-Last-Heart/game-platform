import {
  fillChallengeDifficultyDefaults,
  type ChallengeDefinitionContract,
} from '@thelastheart/contracts';
import type { ChallengeDefinition } from '../../match/domain/types';

/** Map a published Studio definition onto the match-runtime shape. */
export function toRuntimeChallengeDefinition(
  def: ChallengeDefinitionContract,
): ChallengeDefinition {
  const filled = fillChallengeDifficultyDefaults({
    engineId: def.engineId,
    difficulty: def.difficulty,
    durationMs: def.durationMs,
    clientConfig: def.clientConfig,
    serverConfig: def.serverConfig,
  });
  const serverConfig: Record<string, unknown> = { ...filled.serverConfig };
  if (def.engineId === 'precision.ring_lock') {
    serverConfig['difficulty'] = def.difficulty;
  }
  return {
    definitionId: def.definitionId,
    definitionVersion: def.definitionVersion,
    engineId: def.engineId,
    durationMs: filled.durationMs,
    introDurationMs: def.introDurationMs,
    resultHoldMs: def.resultHoldMs,
    heartPenaltyOnFailure: def.heartPenaltyOnFailure,
    energyRewardOnSuccess: def.energyRewardOnSuccess,
    promptKey: def.promptKey,
    difficulty: def.difficulty,
    choiceKeys: def.choiceKeys,
    clientConfig: filled.clientConfig,
    serverConfig,
  };
}
