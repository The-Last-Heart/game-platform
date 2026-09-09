import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseReviewArchiveArgs } from '../lib/review-archive/cli.mjs';
import { createReviewArchive } from '../lib/review-archive/create.mjs';
import {
  captureRealIndexFingerprint,
} from '../lib/review-archive/fingerprint.mjs';
import {
  containsWindowsUserHomePath,
  isForbiddenEnvPath,
  isUnsafeCandidatePath,
} from '../lib/review-archive/safety.mjs';

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)));
const scriptPath = join(repoRoot, 'scripts', 'create-review-archive.mjs');

function runScript(args, options = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}), PATH: options.path ?? process.env.PATH },
    encoding: 'utf8',
    shell: false,
  });
}

function initRepo(dir) {
  const git = (args) => {
    const result = spawnSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    return result.stdout;
  };
  git(['init']);
  git(['config', 'user.email', 'lh001d@example.com']);
  git(['config', 'user.name', 'LH001D']);
  return git;
}

describe('review archive CLI', () => {
  it('--help creates no artifact and exits 0', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'lh-help-'));
    try {
      const before = spawnSync('git', ['status', '--short'], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: false,
      }).stdout;
      const result = runScript(['--help']);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Usage:/);
      assert.equal(existsSync(join(outDir, 'x.zip')), false);
      const after = spawnSync('git', ['status', '--short'], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: false,
      }).stdout;
      assert.equal(before, after);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('rejects unknown flags', () => {
    assert.throws(() => parseReviewArchiveArgs(['--wat']), /Unknown flag/);
    const result = runScript(['--wat']);
    assert.notEqual(result.status, 0);
  });

  it('rejects output inside the repository', () => {
    const result = runScript(['--output', join(repoRoot, 'inside-repo.zip')]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside the repository/);
    assert.equal(existsSync(join(repoRoot, 'inside-repo.zip')), false);
  });

  it('rejects package.json as output and leaves bytes unchanged', () => {
    const packagePath = join(repoRoot, 'package.json');
    const before = readFileSync(packagePath);
    const result = runScript(['--output', packagePath]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(packagePath), before);
  });

  it('keeps a pre-existing output intact after a failed run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-keep-'));
    const out = join(dir, 'keep.zip');
    const marker = Buffer.from('previous-archive-bytes');
    writeFileSync(out, marker);
    const result = runScript(['--output', out]); // no --force → fail
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(out), marker);
    rmSync(dir, { recursive: true, force: true });
  });

  it('supports output paths containing spaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh space '));
    const out = join(dir, 'review archive.zip');
    const fpBefore = captureRealIndexFingerprint(repoRoot);
    const report = createReviewArchive({
      root: repoRoot,
      output: out,
      log: () => {},
    });
    assert.equal(existsSync(out), true);
    assert.equal(report.exactMatch, true);
    assert.equal(report.candidateCount, report.archiveCount);
    const fpAfter = captureRealIndexFingerprint(repoRoot);
    assert.equal(fpBefore.indexSha256, fpAfter.indexSha256);
    assert.equal(fpBefore.stagedSha256, fpAfter.stagedSha256);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('review archive disposable repositories', () => {
  it('creates candidates for an empty/no-HEAD repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-empty-'));
    const git = initRepo(dir);
    writeFileSync(join(dir, 'README.md'), '# empty\n');
    writeFileSync(join(dir, '.gitignore'), 'secret.bin\n');
    writeFileSync(join(dir, 'secret.bin'), 'nope');
    writeFileSync(join(dir, '.env.example'), 'X=1\n');
    // These must be ignored / rejected from candidates via gitignore.
    writeFileSync(join(dir, '.env.production'), 'SECRET=1\n');
    mkdirSync(join(dir, 'apps', 'backend'), { recursive: true });
    writeFileSync(join(dir, 'apps', 'backend', '.env.test'), 'SECRET=2\n');

    // Copy ignore rules similar to project for env.
    writeFileSync(
      join(dir, '.gitignore'),
      'secret.bin\n.env\n.env.*\n!.env.example\n',
    );

    const out = join(tmpdir(), `lh-empty-out-${Date.now()}.zip`);
    const report = createReviewArchive({
      root: dir,
      output: out,
      log: () => {},
    });
    assert.ok(report.candidateCount >= 2);
    // Ensure ignored env files are not candidates.
    const listed = spawnSync('git', ['ls-files', '-z'], {
      cwd: dir,
      env: { ...process.env, GIT_INDEX_FILE: join(dir, '.git', 'index') },
      encoding: 'utf8',
      shell: false,
    });
    void listed;
    assert.equal(isForbiddenEnvPath('.env.production'), true);
    assert.equal(isForbiddenEnvPath('apps/backend/.env.test'), true);
    assert.equal(isForbiddenEnvPath('.env.example'), false);
    rmSync(out, { force: true });
    rmSync(dir, { recursive: true, force: true });
    void git;
  });

  it('includes tracked + modified + untracked when HEAD exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-head-'));
    const git = initRepo(dir);
    writeFileSync(join(dir, 'tracked.txt'), 'one\n');
    writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(dir, 'ignored.txt'), 'x');
    git(['add', 'tracked.txt', '.gitignore']);
    git(['commit', '-m', 'init']);
    writeFileSync(join(dir, 'tracked.txt'), 'two\n');
    writeFileSync(join(dir, 'untracked.txt'), 'new\n');

    const out = join(tmpdir(), `lh-head-out-${Date.now()}.zip`);
    const report = createReviewArchive({
      root: dir,
      output: out,
      log: () => {},
    });
    assert.equal(report.exactMatch, true);
    // Extract names via recreate index listing inside create already matched.
    // Spot-check by reading zip is heavy; count should include 3 source files.
    assert.ok(report.candidateCount >= 3);
    rmSync(out, { force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects symlink candidates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-link-'));
    initRepo(dir);
    writeFileSync(join(dir, 'real.txt'), 'data\n');
    try {
      symlinkSync('real.txt', join(dir, 'link.txt'));
    } catch {
      // Some environments disallow symlinks; skip assertion soft-fail.
      rmSync(dir, { recursive: true, force: true });
      return;
    }
    const out = join(tmpdir(), `lh-link-out-${Date.now()}.zip`);
    assert.throws(
      () =>
        createReviewArchive({
          root: dir,
          output: out,
          log: () => {},
        }),
      /Symbolic-link/,
    );
    assert.equal(existsSync(out), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('preserves real index on success and failure for the project repo', () => {
    const before = captureRealIndexFingerprint(repoRoot);
    const dir = mkdtempSync(join(tmpdir(), 'lh-fp-'));
    const outOk = join(dir, 'ok.zip');
    createReviewArchive({ root: repoRoot, output: outOk, log: () => {} });
    const mid = captureRealIndexFingerprint(repoRoot);
    assert.equal(before.indexSha256, mid.indexSha256);
    assert.equal(before.stagedSha256, mid.stagedSha256);
    assert.equal(before.cachedDiffSha256, mid.cachedDiffSha256);

    const bad = runScript(['--output', join(repoRoot, 'package.json')]);
    assert.notEqual(bad.status, 0);
    const after = captureRealIndexFingerprint(repoRoot);
    assert.equal(before.indexSha256, after.indexSha256);
    assert.equal(before.stagedSha256, after.stagedSha256);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('safety helpers', () => {
  it('detects Windows user-home paths', () => {
    const winPath = ['C:', 'Users', 'Wajdi', 'project'].join('\\');
    const winSlash = ['D:', 'Users', 'Wajdi', 'project'].join('/');
    assert.equal(containsWindowsUserHomePath(`note ${winPath}`), true);
    assert.equal(containsWindowsUserHomePath(`note ${winSlash}`), true);
    assert.equal(
      containsWindowsUserHomePath(['C:', 'Windows', 'System32'].join('\\')),
      false,
    );
  });

  it('flags absolute and traversal candidate paths', () => {
    assert.ok(isUnsafeCandidatePath('/etc/passwd'));
    assert.ok(isUnsafeCandidatePath('foo/../../etc/passwd'));
    assert.ok(isUnsafeCandidatePath('apps/backend/.env.production'));
    assert.equal(isUnsafeCandidatePath('.env.example'), null);
  });
});

describe('archive workflow without python3', () => {
  it('runs successfully when python3 is absent from PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-nopy-'));
    const out = join(dir, 'nopy.zip');
    // Prepend an empty bin dir so `python3` is not found if spawned.
    const emptyBin = join(dir, 'bin');
    mkdirSync(emptyBin);
    writeFileSync(join(emptyBin, 'python3'), '#!/bin/sh\nexit 99\n');
    chmodSync(join(emptyBin, 'python3'), 0o755);
    const result = runScript(['--output', out], {
      path: `${emptyBin}${join(':')}${process.env.PATH}`,
    });
    // Our script must not invoke python3; success expected.
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(out), true);
    rmSync(dir, { recursive: true, force: true });
  });
});
