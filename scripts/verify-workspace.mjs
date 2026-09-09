#!/usr/bin/env node
/**
 * Platform-neutral workspace sanity checks for The Last Heart monorepo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function requirePath(relativePath, label) {
  const full = join(root, relativePath);
  if (!existsSync(full)) {
    errors.push(`Missing ${label}: ${relativePath}`);
  }
}

const required = [
  ['pnpm-workspace.yaml', 'pnpm workspace file'],
  ['package.json', 'root package.json'],
  ['PROJECT_RULES.md', 'project rules'],
  ['.nvmrc', 'Node version pin'],
  ['apps/admin-web/package.json', 'admin-web package'],
  ['apps/backend/package.json', 'backend package'],
  ['apps/mobile/pubspec.yaml', 'mobile pubspec'],
  ['packages/contracts/package.json', 'contracts package'],
  ['infra/local/docker-compose.yml', 'local compose file'],
  ['scripts/docker-compose.mjs', 'compose wrapper'],
];

for (const [path, label] of required) {
  requirePath(path, label);
}

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (rootPkg.packageManager !== 'pnpm@9.15.9') {
  errors.push(
    `Expected packageManager pnpm@9.15.9, found ${rootPkg.packageManager}`,
  );
}
if (rootPkg.engines?.node !== '>=24.21.0 <25') {
  errors.push(`Expected engines.node ">=24.21.0 <25", found ${rootPkg.engines?.node}`);
}

const nvmrc = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
if (nvmrc !== '24.21.0') {
  errors.push(`Expected .nvmrc 24.21.0, found ${nvmrc}`);
}

const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
for (const entry of ['apps/admin-web', 'apps/backend', 'packages/*']) {
  if (!workspace.includes(entry)) {
    errors.push(`pnpm-workspace.yaml missing entry: ${entry}`);
  }
}

const npmrc = readFileSync(join(root, '.npmrc'), 'utf8');
if (!npmrc.includes('strict-peer-dependencies=true')) {
  errors.push('.npmrc must enable strict-peer-dependencies=true');
}

if (errors.length > 0) {
  console.error('Workspace verification failed:');
  for (const error of errors) {
    console.error(` - ${error}`);
  }
  process.exit(1);
}

console.log('Workspace verification passed.');
