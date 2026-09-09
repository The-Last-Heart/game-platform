import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildComposeArgv,
  resolveComposeInvocation,
} from '../lib/docker/resolve-compose.mjs';

describe('resolveComposeInvocation', () => {
  it('keeps Program Files docker.exe as one executable argv element', () => {
    const exe =
      '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe';
    const invocation = resolveComposeInvocation({
      env: { LH_DOCKER_EXE: exe },
      pathExists: (p) => p === exe,
      dockerWorks: (bin) => bin === exe,
      detectWsl: () => true,
    });
    assert.equal(invocation.executable, exe);
    assert.deepEqual(invocation.prefixArgs, ['compose']);
    const argv = buildComposeArgv(invocation, ['ps']);
    assert.equal(argv[0], exe);
    assert.deepEqual(argv.slice(1), ['compose', 'ps']);
  });

  it('keeps Windows Program Files path intact', () => {
    const exe =
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
    const invocation = resolveComposeInvocation({
      env: { LH_DOCKER_EXE: exe },
      pathExists: (p) => p === exe,
      dockerWorks: () => true,
      detectWsl: () => false,
    });
    assert.equal(invocation.executable, exe);
    assert.equal(invocation.executable.includes('Program Files'), true);
  });

  it('keeps user compose arguments separate', () => {
    const invocation = resolveComposeInvocation({
      env: {},
      pathExists: () => false,
      dockerWorks: (bin) => bin === 'docker',
      detectWsl: () => false,
    });
    const argv = buildComposeArgv(invocation, ['-f', 'file.yml', 'up', '-d']);
    assert.deepEqual(argv, ['docker', 'compose', '-f', 'file.yml', 'up', '-d']);
  });

  it('fails clearly for an invalid explicit override without fallback', () => {
    assert.throws(
      () =>
        resolveComposeInvocation({
          env: { LH_DOCKER_EXE: '/missing/docker.exe' },
          pathExists: () => false,
          dockerWorks: () => true,
          detectWsl: () => true,
        }),
      /LH_DOCKER_EXE points to a missing executable/,
    );
  });

  it('uses native docker when available', () => {
    const invocation = resolveComposeInvocation({
      env: {},
      pathExists: () => false,
      dockerWorks: (bin) => bin === 'docker',
      detectWsl: () => true,
    });
    assert.equal(invocation.source, 'native');
  });

  it('uses WSL docker.exe fallback when native is unavailable', () => {
    const exe =
      '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe';
    const invocation = resolveComposeInvocation({
      env: {},
      pathExists: (p) => p === exe,
      dockerWorks: (bin) => bin === exe,
      detectWsl: () => true,
    });
    assert.equal(invocation.source, 'wsl-docker-exe');
    assert.equal(invocation.executable, exe);
  });

  it('supports JSON argv override without whitespace splitting', () => {
    const exe =
      '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe';
    const invocation = resolveComposeInvocation({
      env: {
        LH_DOCKER_COMPOSE_ARGV: JSON.stringify([exe, 'compose']),
      },
      pathExists: () => true,
      dockerWorks: () => true,
      detectWsl: () => false,
    });
    assert.equal(invocation.executable, exe);
    assert.deepEqual(invocation.prefixArgs, ['compose']);
  });
});
