import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  assertFingerprintUnchanged,
  captureRealIndexFingerprint,
  sha256,
} from './fingerprint.mjs';
import { isUnsafeCandidatePath, scanTextContent } from './safety.mjs';
import { readZipEntries } from './zip-read.mjs';

/**
 * Publish a verified archive to the final path. The previous output is only
 * replaced after the new bytes are fully written beside it (or via atomic rename).
 * @param {string} sourceZip
 * @param {string} outPath
 */
function publishArchive(sourceZip, outPath) {
  const staging = `${outPath}.staging-${process.pid}-${Date.now()}`;
  copyFileSync(sourceZip, staging);
  try {
    renameSync(staging, outPath);
  } catch {
    copyFileSync(staging, outPath);
    rmSync(staging, { force: true });
  } finally {
    if (existsSync(staging)) {
      rmSync(staging, { force: true });
    }
  }
}

/**
 * @param {string} root
 * @param {string} cmd
 * @param {string[]} args
 * @param {Record<string, string | undefined>} [extraEnv]
 * @param {'utf8' | 'buffer'} [encoding]
 */
function run(root, cmd, args, extraEnv = {}, encoding = 'utf8') {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const err =
      encoding === 'utf8'
        ? result.stderr || result.stdout || ''
        : Buffer.concat([
            result.stderr ?? Buffer.alloc(0),
            result.stdout ?? Buffer.alloc(0),
          ]).toString('utf8');
    throw new Error(`${cmd} ${args.join(' ')} failed: ${err}`);
  }
  return result.stdout;
}

function hasHead(root) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0;
}

/**
 * @param {string} root
 * @param {string} outPath
 */
function assertSafeOutputPath(root, outPath) {
  if (!outPath.toLowerCase().endsWith('.zip')) {
    throw new Error('Output path must end with .zip');
  }

  const resolved = resolve(outPath);
  const resolvedRoot = resolve(root);

  if (existsSync(resolved)) {
    const st = lstatSync(resolved);
    if (st.isDirectory()) {
      throw new Error('Output path must not be a directory');
    }
    if (st.isSymbolicLink()) {
      throw new Error('Output path must not be a symbolic link');
    }
  }

  const rel = relative(resolvedRoot, resolved);
  const insideRepo =
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && !rel.startsWith('..') && !isAbsolute(rel));
  if (insideRepo) {
    throw new Error('Output path must resolve outside the repository root');
  }

  // Refuse overwriting a repository source path by absolute equality checks
  // against common entry points (defense in depth; already outside repo).
  return resolved;
}

/**
 * @param {object} options
 * @param {string} options.root
 * @param {string} options.output
 * @param {boolean} [options.force]
 * @param {(msg: string) => void} [options.log]
 */
export function createReviewArchive(options) {
  const { root, force = false, log = console.log } = options;
  const outPath = assertSafeOutputPath(root, options.output);

  if (existsSync(outPath) && !force) {
    throw new Error(
      `Output already exists (pass --force to replace safely): ${outPath}`,
    );
  }

  const previousBytes =
    existsSync(outPath) && force ? readFileSync(outPath) : null;

  let fingerprintBefore;
  let fingerprintAfter;
  let tmpDir;
  let tempZip;

  try {
    fingerprintBefore = captureRealIndexFingerprint(root);
    tmpDir = mkdtempSync(join(tmpdir(), 'lh-review-'));
    const tmpIndex = join(tmpDir, 'index');
    tempZip = join(tmpDir, 'archive.zip');
    const env = { GIT_INDEX_FILE: tmpIndex };

    if (hasHead(root)) {
      run(root, 'git', ['read-tree', 'HEAD'], env);
    } else {
      run(root, 'git', ['read-tree', '--empty'], env);
    }
    run(root, 'git', ['add', '-A'], env);
    run(root, 'git', ['diff', '--cached', '--check'], env);

    const lsRaw = run(root, 'git', ['ls-files', '-z'], env, 'buffer');
    const candidateList = [];
    let start = 0;
    for (let i = 0; i < lsRaw.length; i += 1) {
      if (lsRaw[i] === 0) {
        if (i > start) {
          candidateList.push(lsRaw.subarray(start, i).toString('utf8'));
        }
        start = i + 1;
      }
    }
    candidateList.sort();

    if (candidateList.length === 0) {
      throw new Error('Candidate index is empty');
    }

    for (const file of candidateList) {
      const reason = isUnsafeCandidatePath(file);
      if (reason) {
        throw new Error(`Unsafe candidate path (${reason}): ${file}`);
      }

      const abs = join(root, file);
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) {
        throw new Error(`Symbolic-link candidates are rejected: ${file}`);
      }
      if (!st.isFile()) {
        throw new Error(`Candidate is not a regular file: ${file}`);
      }

      // Text scan when UTF-8; skip binary-looking files for content rules.
      const bytes = readFileSync(abs);
      if (!bytes.includes(0)) {
        scanTextContent(file, bytes.toString('utf8'));
      }
    }

    const tree = String(run(root, 'git', ['write-tree'], env)).trim();
    run(root, 'git', ['archive', '--format=zip', '-o', tempZip, tree], env);

    const zipBytes = readFileSync(tempZip);
    const zipEntries = readZipEntries(zipBytes);
    const zipNames = zipEntries.map((e) => e.name).sort();
    const candidateSet = new Set(candidateList);
    const zipSet = new Set(zipNames);

    const missingInZip = candidateList.filter((f) => !zipSet.has(f));
    const extraInZip = zipNames.filter((f) => !candidateSet.has(f));
    if (missingInZip.length || extraInZip.length) {
      throw new Error(
        `Archive/candidate path mismatch. missing=${missingInZip.length} extra=${extraInZip.length}`,
      );
    }
    if (candidateList.length !== zipNames.length) {
      throw new Error('Archive/candidate count mismatch');
    }

    const zipByName = new Map(zipEntries.map((e) => [e.name, e.data]));
    for (const file of candidateList) {
      const archived = zipByName.get(file);
      if (!archived) {
        throw new Error(`Missing archive bytes for ${file}`);
      }
      const blob = run(root, 'git', ['show', `:${file}`], env, 'buffer');
      if (Buffer.compare(blob, archived) !== 0) {
        throw new Error(`Archive byte mismatch for ${file}`);
      }
      if (!archived.includes(0)) {
        scanTextContent(`archive:${file}`, archived.toString('utf8'));
      }
      const zipPathReason = isUnsafeCandidatePath(file);
      if (zipPathReason) {
        throw new Error(`Unsafe ZIP entry (${zipPathReason}): ${file}`);
      }
    }

    // Publish only after verification. Previous output remains until replace.
    publishArchive(tempZip, outPath);
    tempZip = null;

    const finalBytes = readFileSync(outPath);
    const report = {
      output: outPath,
      candidateCount: candidateList.length,
      archiveCount: zipNames.length,
      exactMatch: true,
      byteContentMatch: true,
      sizeBytes: finalBytes.length,
      sha256: sha256(finalBytes),
      realIndex: {
        existed: fingerprintBefore.exists,
        sha256: fingerprintBefore.indexSha256,
        stagedSha256: fingerprintBefore.stagedSha256,
        cachedDiffSha256: fingerprintBefore.cachedDiffSha256,
      },
    };
    log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    // Restore previous archive bytes if we were replacing and left nothing.
    if (force && previousBytes && !existsSync(outPath)) {
      writeFileSync(outPath, previousBytes);
    }
    throw error;
  } finally {
    try {
      fingerprintAfter = captureRealIndexFingerprint(root);
      if (fingerprintBefore) {
        assertFingerprintUnchanged(fingerprintBefore, fingerprintAfter);
      }
    } catch (fingerprintError) {
      console.error(
        fingerprintError instanceof Error
          ? fingerprintError.message
          : 'Real index fingerprint verification failed',
      );
      process.exitCode = 2;
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

export { publishArchive };
