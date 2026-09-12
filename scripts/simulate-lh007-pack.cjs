#!/usr/bin/env node
/**
 * LH-007 automated evidence entrypoint (no device).
 *
 * Runs the MatchEngine simulation matrix:
 *   apps/backend/src/match/domain/engines/lh007-pack.simulation.spec.ts
 *
 * Matrix coverage (per engine unless noted):
 *   - reaction.wait_for_signal: success / early-fail / timeout
 *   - trap.no_touch: absence success / touch fail
 *   - gesture.reverse_swipe: success / fail / timeout
 *   - tap.precision: success / fail / timeout
 *   - memory.sequence: success / fail / timeout
 *   - hold.multitouch: success / fail / timeout
 *   - finite playlist of 2 defs → equal hearts → phase draw
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const spec =
  'src/match/domain/engines/lh007-pack.simulation.spec.ts';

const result = spawnSync(
  'pnpm',
  ['exec', 'jest', spec, '--runInBand'],
  {
    cwd: path.join(root, 'apps/backend'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
