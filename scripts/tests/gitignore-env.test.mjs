import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * Probe .gitignore rules using a disposable nested work tree that includes
 * the repository .gitignore without creating real secret files in the project.
 */
describe('.gitignore environment protection', () => {
  it('ignores all .env variants except .env.example at every depth', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-gitignore-'));
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
    writeFileSync(
      join(dir, '.gitignore'),
      readFileSync(join(repoRoot, '.gitignore'), 'utf8'),
    );

    writeFileSync(join(dir, '.env'), 'X=1\n');
    writeFileSync(join(dir, '.env.production'), 'X=1\n');
    writeFileSync(join(dir, '.env.local'), 'X=1\n');
    writeFileSync(join(dir, '.env.example'), 'X=1\n');
    mkdirSync(join(dir, 'apps', 'backend'), { recursive: true });
    writeFileSync(join(dir, 'apps', 'backend', '.env.test'), 'X=1\n');
    mkdirSync(join(dir, 'infra', 'local'), { recursive: true });
    writeFileSync(join(dir, 'infra', 'local', '.env'), 'X=1\n');
    writeFileSync(join(dir, 'apps', 'backend', '.env.example'), 'X=1\n');

    const check = (path) =>
      spawnSync('git', ['check-ignore', '-q', path], {
        cwd: dir,
        shell: false,
      }).status === 0;

    assert.equal(check('.env'), true);
    assert.equal(check('.env.production'), true);
    assert.equal(check('.env.local'), true);
    assert.equal(check('apps/backend/.env.test'), true);
    assert.equal(check('infra/local/.env'), true);
    assert.equal(check('.env.example'), false);
    assert.equal(check('apps/backend/.env.example'), false);

    rmSync(dir, { recursive: true, force: true });
  });
});
