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
  if (
    def.engineId === 'precision.ring_lock' ||
    def.engineId === 'laser.routing'
  ) {
    serverConfig['difficulty'] = def.difficulty;
  }
  let durationMs = filled.durationMs;
  if (def.engineId === 'social.pair_sync') {
    const togetherRaw = serverConfig['togetherMs'];
    const togetherMs =
      typeof togetherRaw === 'number' && Number.isFinite(togetherRaw)
        ? togetherRaw
        : 0;
    if (togetherMs > 0 && durationMs < togetherMs + 3000) {
      durationMs = Math.min(15_000, togetherMs + 3000);
    }
  }
  return {
    definitionId: def.definitionId,
    definitionVersion: def.definitionVersion,
    engineId: def.engineId,
    durationMs,
    introDurationMs: def.introDurationMs,
    resultHoldMs: def.resultHoldMs,
    heartPenaltyOnFailure: def.heartPenaltyOnFailure,
    energyRewardOnSuccess: def.energyRewardOnSuccess,
    promptKey: def.promptKey,
    difficulty: def.difficulty,
    choiceKeys: def.choiceKeys,
    clientConfig: filled.clientConfig,
    serverConfig,
    minAppVersion: def.minAppVersion,
    requiredCapabilities: [...(def.requiredCapabilities ?? [])],
  };
}
