import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * @param {Buffer | string} data
 */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {string} root
 * @param {string} cmd
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
function gitRaw(root, cmd, args, env = process.env) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const err = (result.stderr ?? Buffer.alloc(0)).toString('utf8');
    throw new Error(`${cmd} ${args.join(' ')} failed: ${err}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

/**
 * Fingerprint the real Git index for byte-for-byte comparison.
 * @param {string} root
 */
export function captureRealIndexFingerprint(root) {
  const indexPathResult = spawnSync('git', ['rev-parse', '--git-path', 'index'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (indexPathResult.status !== 0) {
    throw new Error('Unable to resolve Git index path');
  }
  const indexPath = indexPathResult.stdout.trim();
  const absoluteIndex = indexPath.startsWith('/')
    ? indexPath
    : `${root}/${indexPath}`;
  const exists = existsSync(absoluteIndex);
  const indexBytes = exists ? readFileSync(absoluteIndex) : null;
  const staged = gitRaw(root, 'git', ['ls-files', '--stage', '-z']);
  const cached = gitRaw(root, 'git', ['diff', '--cached', '--binary']);

  return {
    indexPath: absoluteIndex,
    exists,
    indexSha256: indexBytes ? sha256(indexBytes) : null,
    stagedSha256: sha256(staged),
    cachedDiffSha256: sha256(cached),
    stagedBytes: staged,
    cachedDiffBytes: cached,
  };
}

/**
 * @param {ReturnType<typeof captureRealIndexFingerprint>} before
 * @param {ReturnType<typeof captureRealIndexFingerprint>} after
 */
export function assertFingerprintUnchanged(before, after) {
  if (before.exists !== after.exists) {
    throw new Error('Real Git index presence changed');
  }
  if (before.indexSha256 !== after.indexSha256) {
    throw new Error('Real Git index bytes changed');
  }
  if (before.stagedSha256 !== after.stagedSha256) {
    throw new Error('Real Git staged entries changed');
  }
  if (before.cachedDiffSha256 !== after.cachedDiffSha256) {
    throw new Error('Real Git cached diff changed');
  }
  if (Buffer.compare(before.stagedBytes, after.stagedBytes) !== 0) {
    throw new Error('Real Git staged entry bytes changed');
  }
  if (Buffer.compare(before.cachedDiffBytes, after.cachedDiffBytes) !== 0) {
    throw new Error('Real Git cached diff bytes changed');
  }
}
