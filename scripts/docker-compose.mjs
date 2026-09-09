#!/usr/bin/env node
/**
 * Platform-neutral Docker Compose runner for local infra.
 *
 * Resolution order:
 * 1. LH_DOCKER_EXE — exact executable path; `compose` is appended internally
 * 2. LH_DOCKER_COMPOSE_ARGV — JSON argv array (unambiguous, optional)
 * 3. native `docker compose` when the CLI works
 * 4. On WSL, `docker.exe compose` when native docker is unusable
 *
 * Failures from Docker/Compose are never swallowed. No shell evaluation.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildComposeArgv,
  resolveComposeInvocation,
} from './lib/docker/resolve-compose.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = join(root, 'infra', 'local', 'docker-compose.yml');

function dockerWorks(bin) {
  const result = spawnSync(bin, ['version'], {
    stdio: 'ignore',
    env: process.env,
    shell: false,
  });
  return result.status === 0;
}

const userArgs = process.argv.slice(2);
if (userArgs.length === 0) {
  console.error('Usage: node scripts/docker-compose.mjs <compose-args...>');
  process.exit(2);
}

try {
  const invocation = resolveComposeInvocation({
    env: process.env,
    dockerWorks,
    pathExists: existsSync,
  });
  if (invocation.source === 'wsl-docker-exe') {
    console.error(
      '[infra] Native WSL docker unavailable; using docker.exe Compose fallback.',
    );
  }

  const argv = buildComposeArgv(invocation, [
    '-f',
    composeFile,
    ...userArgs,
  ]);
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Docker Compose wrapper failed',
  );
  process.exit(1);
}
