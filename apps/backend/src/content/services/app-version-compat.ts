import {
  FIRST_GAMEPLAY_APP_VERSION,
  isChallengeCompatibleWithAppVersion,
  type ChallengeDefinitionContract,
} from '@thelastheart/contracts';
import type { ChallengeDefinition } from '../../match/domain/types';

/**
 * Filter a catalog playlist to challenges executable by the match gameplay version.
 * minAppVersion is a lower bound; capabilities and engine registry are enforced.
 */
export function filterPlaylistForAppVersion(
  playlist: readonly ChallengeDefinition[],
  gameplayVersion: string | null | undefined,
): ChallengeDefinition[] {
  const version = gameplayVersion ?? FIRST_GAMEPLAY_APP_VERSION;
  return playlist.filter((def) =>
    isChallengeCompatibleWithAppVersion({
      appVersion: version,
      minAppVersion: def.minAppVersion ?? FIRST_GAMEPLAY_APP_VERSION,
      engineId: def.engineId,
      requiredCapabilities: def.requiredCapabilities ?? [],
    }),
  );
}

/** Studio / contract definition → compatibility gate (publish-time). */
export function isContractDefinitionCompatibleWithAppVersion(
  def: ChallengeDefinitionContract,
  appVersion: string,
): boolean {
  return isChallengeCompatibleWithAppVersion({
    appVersion,
    minAppVersion: def.minAppVersion,
    engineId: def.engineId,
    requiredCapabilities: def.requiredCapabilities,
  });
}
