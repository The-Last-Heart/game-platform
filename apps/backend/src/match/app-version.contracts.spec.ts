import {
  compareStableSemVer,
  isChallengeCompatibleWithAppVersion,
  isStableSemVerEq,
  isStableSemVerGte,
  normalizeStableSemVer,
  parseStableSemVer,
  clientRuntimeMetadataSchema,
  mobileVersionPolicyResponseSchema,
  protocolErrorPayloadSchema,
  FIRST_GAMEPLAY_APP_VERSION,
  APP_RELEASE_COMPATIBILITY,
  CHALLENGE_ENGINE_COMPATIBILITY,
} from '@thelastheart/contracts';

describe('stable semver', () => {
  it('accepts valid major.minor.patch', () => {
    expect(parseStableSemVer('0.0.1')).toEqual({
      major: 0,
      minor: 0,
      patch: 1,
    });
    expect(normalizeStableSemVer('1.10.0')).toBe('1.10.0');
  });

  it('rejects invalid version strings', () => {
    expect(parseStableSemVer('1.0')).toBeNull();
    expect(parseStableSemVer('01.0.0')).toBeNull();
    expect(parseStableSemVer('1.0.0-beta')).toBeNull();
    expect(parseStableSemVer('abc')).toBeNull();
    expect(parseStableSemVer(' 1.0.0')).toBeNull();
  });

  it('compares numerically (1.10.0 > 1.9.0)', () => {
    expect(compareStableSemVer('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(isStableSemVerGte('1.10.0', '1.9.0')).toBe(true);
    expect(isStableSemVerEq('1.0.0', '1.0.0')).toBe(true);
  });
});

describe('runtime metadata and version policy contracts', () => {
  it('validates client runtime metadata', () => {
    const parsed = clientRuntimeMetadataSchema.safeParse({
      appVersion: '0.0.1',
      buildNumber: '12',
      platform: 'android',
    });
    expect(parsed.success).toBe(true);
  });

  it('validates mobile version policy response', () => {
    const parsed = mobileVersionPolicyResponseSchema.safeParse({
      minimumSupportedVersion: '0.0.1',
      updateRequired: false,
      storeUrl:
        'https://play.google.com/store/apps/details?id=com.thelastheart.game',
      policyRevision: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('includes version compatibility error codes', () => {
    const parsed = protocolErrorPayloadSchema.safeParse({
      code: 'PRIVATE_ROOM_VERSION_CLIENT_OLDER',
      messageKey: 'errors.room.version_client_older',
      details: { roomVersion: '1.0.0', clientVersion: '0.0.1' },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('challenge compatibility registry', () => {
  it('registers engines for the first gameplay release', () => {
    expect(FIRST_GAMEPLAY_APP_VERSION).toBe('0.0.1');
    expect(CHALLENGE_ENGINE_COMPATIBILITY.length).toBeGreaterThan(10);
    expect(APP_RELEASE_COMPATIBILITY[0]?.appVersion).toBe('0.0.1');
  });

  it('treats minAppVersion as a lower bound', () => {
    expect(
      isChallengeCompatibleWithAppVersion({
        appVersion: '1.0.0',
        minAppVersion: '0.0.1',
        engineId: 'reaction.wait_for_signal',
        requiredCapabilities: ['touch'],
      }),
    ).toBe(true);
    expect(
      isChallengeCompatibleWithAppVersion({
        appVersion: '0.0.1',
        minAppVersion: '1.0.0',
        engineId: 'reaction.wait_for_signal',
        requiredCapabilities: [],
      }),
    ).toBe(false);
  });

  it('accepts Studio audio_output as audio_playback alias', () => {
    expect(
      isChallengeCompatibleWithAppVersion({
        appVersion: FIRST_GAMEPLAY_APP_VERSION,
        minAppVersion: '0.0.0',
        engineId: 'audio.multiple_choice',
        requiredCapabilities: ['audio_output'],
      }),
    ).toBe(true);
  });
});
