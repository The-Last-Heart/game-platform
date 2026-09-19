import { z } from 'zod';
import { LAUNCH_ENGINE_IDS, type LaunchEngineId } from './engines';
import {
  isStableSemVerGte,
  maxStableSemVer,
  parseStableSemVer,
  stableSemVerSchema,
} from '../../content/v1/semver';

/**
 * First shipped gameplay application version that contains the live challenge
 * engines in this repository. Used as the safe default minimum-supported floor.
 */
export const FIRST_GAMEPLAY_APP_VERSION = '0.0.1' as const;

/** Device / accessibility capability tokens historically used on definitions. */
export const DEVICE_CAPABILITIES = [
  'touch',
  'multitouch',
  'motion',
  'microphone',
  'audio_playback',
] as const;
export type DeviceCapability = (typeof DEVICE_CAPABILITIES)[number];

/**
 * Studio / seed aliases → canonical DEVICE_CAPABILITIES tokens.
 * Unknown aliases stay unchanged so publish-time validation still rejects them.
 */
const DEVICE_CAPABILITY_ALIASES: Readonly<Record<string, DeviceCapability>> = {
  audio_output: 'audio_playback',
  accelerometer: 'motion',
  gyroscope: 'motion',
};

/** Map Studio/seed capability tokens onto the contract registry. */
export function normalizeDeviceCapability(capability: string): string {
  return DEVICE_CAPABILITY_ALIASES[capability] ?? capability;
}

export function normalizeDeviceCapabilities(
  capabilities: readonly string[],
): string[] {
  return capabilities.map(normalizeDeviceCapability);
}

export function engineCapabilityId(
  engineId: LaunchEngineId,
  engineSchemaVersion: number,
): string {
  return `challenge.engine.${engineId}.v${engineSchemaVersion}`;
}

export type ChallengeEngineCompatibility = {
  challengeType: LaunchEngineId;
  engineSchemaVersion: number;
  capability: string;
  introducedInAppVersion: string;
};

function engineEntry(
  challengeType: LaunchEngineId,
  introducedInAppVersion: string,
  engineSchemaVersion = 1,
): ChallengeEngineCompatibility {
  return {
    challengeType,
    engineSchemaVersion,
    capability: engineCapabilityId(challengeType, engineSchemaVersion),
    introducedInAppVersion,
  };
}

/**
 * Authoritative engine ↔ app-version matrix. Reflects Flutter code that has
 * actually shipped. Administrators must not edit this as free-form content.
 *
 * All current live engines ship in the first gameplay release (0.0.1). Future
 * engine batches append entries with a higher introducedInAppVersion and the
 * corresponding AppReleaseCompatibility row retains prior capabilities.
 */
export const CHALLENGE_ENGINE_COMPATIBILITY: readonly ChallengeEngineCompatibility[] =
  LAUNCH_ENGINE_IDS.map((id) => engineEntry(id, FIRST_GAMEPLAY_APP_VERSION));

export type AppReleaseCompatibility = {
  appVersion: string;
  supportedCapabilities: readonly string[];
};

const DEVICE_CAPABILITY_SET: readonly string[] = [...DEVICE_CAPABILITIES];

function capabilitiesThrough(appVersion: string): string[] {
  const engineCaps = CHALLENGE_ENGINE_COMPATIBILITY.filter((entry) =>
    isStableSemVerGte(appVersion, entry.introducedInAppVersion),
  ).map((entry) => entry.capability);
  return [...DEVICE_CAPABILITY_SET, ...engineCaps];
}

/**
 * Additive release manifests. Newer releases retain every older capability.
 */
export const APP_RELEASE_COMPATIBILITY: readonly AppReleaseCompatibility[] = [
  {
    appVersion: FIRST_GAMEPLAY_APP_VERSION,
    supportedCapabilities: capabilitiesThrough(FIRST_GAMEPLAY_APP_VERSION),
  },
];

export const challengeEngineCompatibilitySchema = z
  .object({
    challengeType: z.enum(LAUNCH_ENGINE_IDS),
    engineSchemaVersion: z.number().int().positive(),
    capability: z.string().min(1).max(128),
    introducedInAppVersion: stableSemVerSchema,
  })
  .strict();

export const appReleaseCompatibilitySchema = z
  .object({
    appVersion: stableSemVerSchema,
    supportedCapabilities: z.array(z.string().min(1).max(128)).min(1),
  })
  .strict();

export function getEngineCompatibility(
  engineId: string,
  engineSchemaVersion = 1,
): ChallengeEngineCompatibility | undefined {
  return CHALLENGE_ENGINE_COMPATIBILITY.find(
    (entry) =>
      entry.challengeType === engineId &&
      entry.engineSchemaVersion === engineSchemaVersion,
  );
}

export function getAppReleaseCompatibility(
  appVersion: string,
): AppReleaseCompatibility | undefined {
  const exact = APP_RELEASE_COMPATIBILITY.find(
    (entry) => entry.appVersion === appVersion,
  );
  if (exact) {
    return exact;
  }
  // Additive rule: a known higher version inherits the highest registered
  // release that is still <= the requested version.
  let best: AppReleaseCompatibility | undefined;
  for (const entry of APP_RELEASE_COMPATIBILITY) {
    if (!isStableSemVerGte(appVersion, entry.appVersion)) {
      continue;
    }
    if (!best || isStableSemVerGte(entry.appVersion, best.appVersion)) {
      best = entry;
    }
  }
  if (!best) {
    return undefined;
  }
  return {
    appVersion,
    supportedCapabilities: capabilitiesThrough(appVersion),
  };
}

export function releaseSupportsAllCapabilities(
  appVersion: string,
  requiredCapabilities: readonly string[],
): boolean {
  if (requiredCapabilities.length === 0) {
    return true;
  }
  const release = getAppReleaseCompatibility(appVersion);
  if (!release) {
    return false;
  }
  const supported = new Set(release.supportedCapabilities);
  return normalizeDeviceCapabilities(requiredCapabilities).every((cap) =>
    supported.has(cap),
  );
}

/**
 * Effective minimum app version for a challenge definition:
 * max(configured min, engine introduced-in, capability floors).
 */
export function effectiveChallengeMinAppVersion(input: {
  configuredMinAppVersion: string;
  engineId: string;
  engineSchemaVersion?: number;
  requiredCapabilities?: readonly string[];
}): string | null {
  const engine = getEngineCompatibility(
    input.engineId,
    input.engineSchemaVersion ?? 1,
  );
  if (!engine) {
    return null;
  }
  if (parseStableSemVer(input.configuredMinAppVersion) == null) {
    return null;
  }
  let effective = maxStableSemVer(
    input.configuredMinAppVersion === '0.0.0'
      ? engine.introducedInAppVersion
      : input.configuredMinAppVersion,
    engine.introducedInAppVersion,
  );
  for (const cap of normalizeDeviceCapabilities(
    input.requiredCapabilities ?? [],
  )) {
    const engineCap = CHALLENGE_ENGINE_COMPATIBILITY.find(
      (entry) => entry.capability === cap,
    );
    if (engineCap) {
      effective = maxStableSemVer(effective, engineCap.introducedInAppVersion);
      continue;
    }
    if ((DEVICE_CAPABILITIES as readonly string[]).includes(cap)) {
      effective = maxStableSemVer(effective, FIRST_GAMEPLAY_APP_VERSION);
      continue;
    }
    // Unknown capability — no registered release can satisfy it.
    return null;
  }
  // Confirm at least one release can execute.
  if (!releaseSupportsAllCapabilities(effective, input.requiredCapabilities ?? [])) {
    // Try the highest registered release.
    let highest: string = FIRST_GAMEPLAY_APP_VERSION;
    for (const release of APP_RELEASE_COMPATIBILITY) {
      if (isStableSemVerGte(release.appVersion, highest)) {
        highest = release.appVersion;
      }
    }
    if (
      !releaseSupportsAllCapabilities(
        highest,
        input.requiredCapabilities ?? [],
      )
    ) {
      return null;
    }
    effective = maxStableSemVer(effective, highest);
  }
  return effective;
}

export function isChallengeCompatibleWithAppVersion(input: {
  appVersion: string;
  minAppVersion: string;
  engineId: string;
  engineSchemaVersion?: number;
  requiredCapabilities?: readonly string[];
}): boolean {
  if (parseStableSemVer(input.appVersion) == null) {
    return false;
  }
  const effectiveArgs: {
    configuredMinAppVersion: string;
    engineId: string;
    engineSchemaVersion?: number;
    requiredCapabilities?: readonly string[];
  } = {
    configuredMinAppVersion: input.minAppVersion,
    engineId: input.engineId,
  };
  if (input.engineSchemaVersion != null) {
    effectiveArgs.engineSchemaVersion = input.engineSchemaVersion;
  }
  if (input.requiredCapabilities != null) {
    effectiveArgs.requiredCapabilities = input.requiredCapabilities;
  }
  const effective = effectiveChallengeMinAppVersion(effectiveArgs);
  if (effective == null) {
    return false;
  }
  if (!isStableSemVerGte(input.appVersion, effective)) {
    return false;
  }
  return releaseSupportsAllCapabilities(
    input.appVersion,
    input.requiredCapabilities ?? [],
  );
}
