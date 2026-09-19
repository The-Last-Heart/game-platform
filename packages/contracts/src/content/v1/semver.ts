import { z } from 'zod';

/** Stable gameplay version: major.minor.patch only (no prerelease / build metadata). */
export const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const MAX_APP_VERSION_LENGTH = 32;

export type StableSemVer = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

/**
 * Parse a stable semantic version. Rejects prerelease, build metadata, leading
 * zeros in numeric components (except a lone 0), and arbitrary strings.
 */
export function parseStableSemVer(raw: string): StableSemVer | null {
  if (typeof raw !== 'string') {
    return null;
  }
  if (raw.length === 0 || raw.length > MAX_APP_VERSION_LENGTH) {
    return null;
  }
  if (raw.trim() !== raw) {
    return null;
  }
  const match = STABLE_SEMVER_PATTERN.exec(raw);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Normalize after successful parse (identity for already-valid strings). */
export function normalizeStableSemVer(raw: string): string | null {
  const parsed = parseStableSemVer(raw);
  if (!parsed) {
    return null;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function compareStableSemVer(a: string, b: string): number {
  const left = parseStableSemVer(a);
  const right = parseStableSemVer(b);
  if (!left || !right) {
    throw new Error('compareStableSemVer requires valid stable semver inputs');
  }
  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }
  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }
  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }
  return 0;
}

export function isStableSemVerGte(a: string, b: string): boolean {
  return compareStableSemVer(a, b) >= 0;
}

export function isStableSemVerEq(a: string, b: string): boolean {
  return compareStableSemVer(a, b) === 0;
}

/** Highest of two valid versions. */
export function maxStableSemVer(a: string, b: string): string {
  return compareStableSemVer(a, b) >= 0 ? a : b;
}

/** Validates and keeps the canonical major.minor.patch form. */
export const stableSemVerSchema = z
  .string()
  .min(1)
  .max(MAX_APP_VERSION_LENGTH)
  .superRefine((value, ctx) => {
    const normalized = normalizeStableSemVer(value);
    if (normalized == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must be a stable major.minor.patch version',
      });
      return;
    }
    if (normalized !== value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'version must already be normalized major.minor.patch',
      });
    }
  });

export const buildNumberSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._+-]+$/, 'buildNumber contains unsupported characters');

export const clientPlatformSchema = z.enum(['android', 'ios']);
export type ClientPlatform = z.infer<typeof clientPlatformSchema>;
