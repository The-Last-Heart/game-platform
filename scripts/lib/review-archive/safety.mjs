import { basename, posix, win32 } from 'node:path';

/** Basename exactly `.env.example` is the only allowed env template. */
export function isAllowedEnvExample(base) {
  return base === '.env.example';
}

/**
 * Reject secret env filenames: `.env`, `.env.*`, and other `*.env` artifacts.
 * @param {string} filePath posix-style candidate path
 */
export function isForbiddenEnvPath(filePath) {
  const base = posix.basename(filePath);
  if (isAllowedEnvExample(base)) {
    return false;
  }
  if (base === '.env') {
    return true;
  }
  if (base.startsWith('.env.')) {
    return true;
  }
  if (base.endsWith('.env')) {
    return true;
  }
  return false;
}

const FORBIDDEN_BASENAMES = new Set([
  'local.properties',
  'GeneratedPluginRegistrant.java',
  'GeneratedPluginRegistrant.h',
  'GeneratedPluginRegistrant.m',
  'Generated.xcconfig',
  'flutter_export_environment.sh',
  'flutter_native_integration.env',
]);

const FORBIDDEN_SEGMENTS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.dart_tool',
  'ephemeral',
]);

/**
 * Segment-aware generated/dependency rejection.
 * @param {string} filePath
 */
export function hasForbiddenSegment(filePath) {
  const segments = filePath.split('/').filter(Boolean);
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      return true;
    }
    if (segment.endsWith('.iml')) {
      return true;
    }
  }
  const base = segments[segments.length - 1] ?? '';
  if (FORBIDDEN_BASENAMES.has(base)) {
    return true;
  }
  if (base.startsWith('GeneratedPluginRegistrant.')) {
    return true;
  }
  return false;
}

/**
 * @param {string} filePath
 */
export function isUnsafeCandidatePath(filePath) {
  if (!filePath || filePath.length === 0) {
    return 'empty path';
  }
  for (let i = 0; i < filePath.length; i += 1) {
    const code = filePath.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return 'control characters';
    }
  }
  if (filePath.startsWith('/') || filePath.startsWith('\\')) {
    return 'absolute path';
  }
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return 'absolute path';
  }
  const segments = filePath.split(/[/\\]/);
  if (segments.some((segment) => segment === '..')) {
    return 'path traversal';
  }
  if (isForbiddenEnvPath(filePath)) {
    return 'secret environment file';
  }
  if (hasForbiddenSegment(filePath)) {
    return 'generated or dependency path';
  }
  return null;
}

/** Content patterns — report rule id only, never dump match text. */
export const CONTENT_RULES = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  },
  {
    id: 'github-classic-token',
    pattern: /\bghp_[A-Za-z0-9]{20,}\b/,
  },
  {
    id: 'github-fine-grained-token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    id: 'aws-access-key-id',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'unix-home-path',
    pattern: /(?:^|[\s"'=])\/home\/[^/\s"'\\]+(?:\/|$)/,
  },
  {
    id: 'macos-home-path',
    pattern: /(?:^|[\s"'=])\/Users\/[^/\s"'\\]+(?:\/|$)/,
  },
  {
    id: 'windows-user-home-path',
    // Matches drive-letter user-profile paths (Users directory) with / or \.
    pattern: /(?:^|[\s"'=])[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/i,
  },
];

/**
 * @param {string} label
 * @param {string} content
 */
export function scanTextContent(label, content) {
  for (const rule of CONTENT_RULES) {
    if (rule.pattern.test(content)) {
      throw new Error(
        `Forbidden content rule "${rule.id}" matched in ${label}`,
      );
    }
  }
}

/**
 * Detect a Windows user-home path string (for tests and scanners).
 * @param {string} value
 */
export function containsWindowsUserHomePath(value) {
  return CONTENT_RULES.find((r) => r.id === 'windows-user-home-path').pattern.test(
    value,
  );
}

export function basenameOf(filePath) {
  return basename(filePath);
}

/** Exported for tests */
export const pathHelpers = { posix, win32 };
